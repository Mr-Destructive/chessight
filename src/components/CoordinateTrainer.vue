<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import ChessBoard from './ChessBoard.vue'
import { allSquares, isDarkSquare, normalizeSquare, randomSquare, shuffleSquares, type Square } from '../lib/chess'

type SquareStats = {
  attempts: number
  correct: number
  totalResponseMs: number
}

type ProgressState = {
  totalAttempts: number
  totalCorrect: number
  totalResponseMs: number
  bestStreak: number
  sessionsCompleted: number
  squareStats: Record<string, SquareStats>
  dark: SquareStats
  light: SquareStats
}

type FeedbackState = {
  guess: Square
  correct: Square
  isCorrect: boolean
} | null

const SESSION_LENGTH = 12
const REVEAL_MS = 520

const props = defineProps<{
  storageKey: string
}>()

const progress = reactive<ProgressState>(loadProgress())
const sessionQueue = ref<Square[]>([])
const promptSquare = ref<Square>(randomSquare())
const currentIndex = ref(0)
const sessionAttempts = ref(0)
const sessionCorrect = ref(0)
const sessionStreak = ref(0)
const sessionBestStreak = ref(0)
const sessionTotalResponseMs = ref(0)
const questionStart = ref(Date.now())
const feedback = ref<FeedbackState>(null)
const locked = ref(false)
const completed = ref(false)
const answerBuffer = ref('')
const keyboardInput = ref<HTMLInputElement | null>(null)

let revealTimer: number | undefined

function loadProgress(): ProgressState {
  if (typeof window === 'undefined') {
    return {
      totalAttempts: 0,
      totalCorrect: 0,
      totalResponseMs: 0,
      bestStreak: 0,
      sessionsCompleted: 0,
      squareStats: {},
      dark: { attempts: 0, correct: 0, totalResponseMs: 0 },
      light: { attempts: 0, correct: 0, totalResponseMs: 0 },
    }
  }

  try {
    const raw = window.localStorage.getItem(props.storageKey)
    if (!raw) throw new Error('missing')
    const parsed = JSON.parse(raw) as Partial<ProgressState>
    return {
      totalAttempts: parsed.totalAttempts ?? 0,
      totalCorrect: parsed.totalCorrect ?? 0,
      totalResponseMs: parsed.totalResponseMs ?? 0,
      bestStreak: parsed.bestStreak ?? 0,
      sessionsCompleted: parsed.sessionsCompleted ?? 0,
      squareStats: parsed.squareStats ?? {},
      dark: parsed.dark ?? { attempts: 0, correct: 0, totalResponseMs: 0 },
      light: parsed.light ?? { attempts: 0, correct: 0, totalResponseMs: 0 },
    }
  } catch {
    return {
      totalAttempts: 0,
      totalCorrect: 0,
      totalResponseMs: 0,
      bestStreak: 0,
      sessionsCompleted: 0,
      squareStats: {},
      dark: { attempts: 0, correct: 0, totalResponseMs: 0 },
      light: { attempts: 0, correct: 0, totalResponseMs: 0 },
    }
  }
}

function saveProgress() {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(props.storageKey, JSON.stringify(progress))
}

function clearTimer() {
  if (revealTimer) {
    window.clearTimeout(revealTimer)
    revealTimer = undefined
  }
}

function focusKeyboardInput() {
  keyboardInput.value?.focus({ preventScroll: true })
}

function createSessionQueue(): Square[] {
  return shuffleSquares(allSquares).slice(0, SESSION_LENGTH)
}

function startSession() {
  clearTimer()
  sessionQueue.value = createSessionQueue()
  currentIndex.value = 0
  sessionAttempts.value = 0
  sessionCorrect.value = 0
  sessionStreak.value = 0
  sessionBestStreak.value = 0
  sessionTotalResponseMs.value = 0
  completed.value = false
  feedback.value = null
  locked.value = false
  promptSquare.value = sessionQueue.value[0]
  questionStart.value = Date.now()
  answerBuffer.value = ''
  void nextTick(focusKeyboardInput)
}

function nextQuestion() {
  currentIndex.value += 1
  if (currentIndex.value >= sessionQueue.value.length) {
    progress.sessionsCompleted += 1
    saveProgress()
    completed.value = true
    clearTimer()
    return
  }

  promptSquare.value = sessionQueue.value[currentIndex.value]
  questionStart.value = Date.now()
  feedback.value = null
  locked.value = false
  answerBuffer.value = ''
  void nextTick(focusKeyboardInput)
}

function recordAttempt(correct: Square, isCorrect: boolean, responseMs: number) {
  progress.totalAttempts += 1
  progress.totalCorrect += isCorrect ? 1 : 0
  progress.totalResponseMs += responseMs
  sessionTotalResponseMs.value += responseMs
  sessionAttempts.value += 1

  const bucket = progress.squareStats[correct] ?? { attempts: 0, correct: 0, totalResponseMs: 0 }
  bucket.attempts += 1
  bucket.correct += isCorrect ? 1 : 0
  bucket.totalResponseMs += responseMs
  progress.squareStats[correct] = bucket

  const area = isDarkSquare(correct) ? progress.dark : progress.light
  area.attempts += 1
  area.correct += isCorrect ? 1 : 0
  area.totalResponseMs += responseMs

  if (isCorrect) {
    sessionCorrect.value += 1
    sessionStreak.value += 1
    sessionBestStreak.value = Math.max(sessionBestStreak.value, sessionStreak.value)
  } else {
    sessionStreak.value = 0
  }

  progress.bestStreak = Math.max(progress.bestStreak, sessionBestStreak.value)
  saveProgress()
}

function submitGuess(square: Square) {
  if (locked.value || completed.value) return

  locked.value = true
  const isCorrect = square === promptSquare.value
  const responseMs = Date.now() - questionStart.value

  feedback.value = { guess: square, correct: promptSquare.value, isCorrect }
  recordAttempt(promptSquare.value, isCorrect, responseMs)

  revealTimer = window.setTimeout(() => {
    nextQuestion()
  }, REVEAL_MS)
}

function handleKeyboardSquare(square: Square | null) {
  if (!square) {
    answerBuffer.value = ''
    return
  }

  submitGuess(square)
  answerBuffer.value = ''
}

function submitBufferedGuess() {
  const square = normalizeSquare(answerBuffer.value)
  if (!square) return
  submitGuess(square)
  answerBuffer.value = ''
}

function handleKeydown(event: KeyboardEvent) {
  if (completed.value) {
    if (event.key === 'Enter') startSession()
    return
  }

  if (feedback.value) {
    if (event.key === 'Enter' || event.key === ' ') {
      nextQuestion()
      event.preventDefault()
    }
    return
  }

  if (event.key === 'Backspace') {
    answerBuffer.value = ''
    event.preventDefault()
    return
  }

  const key = event.key.toLowerCase()

  if (key === 'enter') {
    const square = normalizeSquare(answerBuffer.value)
    if (square) handleKeyboardSquare(square)
    event.preventDefault()
    return
  }

  if (key === ' ' || key === ',' || key === ';') {
    answerBuffer.value = ''
    event.preventDefault()
    return
  }

  if (/^[a-h1-8]$/.test(key)) {
    answerBuffer.value += key
    if (answerBuffer.value.length === 2) {
      handleKeyboardSquare(normalizeSquare(answerBuffer.value))
    }
    event.preventDefault()
  }
}

const sessionAccuracy = computed(() => {
  const attempts = Math.max(1, sessionAttempts.value)
  return Math.round((sessionCorrect.value / attempts) * 100)
})

const overallAccuracy = computed(() => {
  if (progress.totalAttempts === 0) return 0
  return Math.round((progress.totalCorrect / progress.totalAttempts) * 100)
})

const sessionAverage = computed(() => {
  const attempts = Math.max(1, sessionAttempts.value)
  return Math.round(sessionTotalResponseMs.value / attempts)
})

const overallAverage = computed(() => {
  if (progress.totalAttempts === 0) return 0
  return Math.round(progress.totalResponseMs / progress.totalAttempts)
})

const xp = computed(() => progress.totalCorrect * 10 + progress.bestStreak * 5)

const level = computed(() => Math.floor(xp.value / 120) + 1)

const weakSpot = computed(() => {
  const darkAccuracy = progress.dark.attempts ? progress.dark.correct / progress.dark.attempts : null
  const lightAccuracy = progress.light.attempts ? progress.light.correct / progress.light.attempts : null

  if (darkAccuracy !== null && lightAccuracy !== null) {
    if (lightAccuracy - darkAccuracy > 0.1 && progress.dark.attempts >= 8) {
      return 'Dark squares need work'
    }
    if (darkAccuracy - lightAccuracy > 0.1 && progress.light.attempts >= 8) {
      return 'Light squares need work'
    }
  }

  const weakest = Object.entries(progress.squareStats)
    .filter(([, value]) => value.attempts >= 3)
    .map(([square, value]) => ({ square, rate: value.correct / value.attempts }))
    .sort((a, b) => a.rate - b.rate)[0]

  return weakest ? `Weakest: ${weakest.square}` : 'No clear weak spot yet'
})

const targetLabel = computed(() => (completed.value ? 'Drill complete' : `Find ${promptSquare.value}`))

onMounted(() => {
  startSession()
  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  clearTimer()
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="trainer">
    <div class="prompt-row">
      <div>
        <div class="label">Prompt</div>
        <div class="prompt">{{ targetLabel }}</div>
      </div>
      <button class="ghost-button" type="button" @click="startSession">New drill</button>
    </div>

    <input
      ref="keyboardInput"
      class="keyboard-capture"
      type="text"
      inputmode="text"
      autocomplete="off"
      autocorrect="off"
      autocapitalize="off"
      spellcheck="false"
      aria-label="Keyboard square input"
    />

    <div class="micro-copy">Tap a square or type the answer, then press Enter.</div>

    <ChessBoard
      :selected-squares="feedback ? [feedback.guess] : []"
      :correct-squares="feedback ? [feedback.correct] : []"
      :wrong-squares="feedback && !feedback.isCorrect ? [feedback.guess] : []"
      :locked="locked || completed"
      @select="submitGuess"
    />

    <div class="keyboard-row">
      <input
        ref="keyboardInput"
        v-model="answerBuffer"
        class="answer-input"
        type="text"
        inputmode="text"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        spellcheck="false"
        placeholder="Type square"
        aria-label="Type the target square"
        @focus="focusKeyboardInput"
        @keydown.enter.prevent="submitBufferedGuess"
      />
      <button class="ghost-button" type="button" @click="focusKeyboardInput">Open keyboard</button>
      <button class="primary-button" type="button" @click="submitBufferedGuess">Check</button>
    </div>

    <div class="stat-strip">
      <div class="stat-chip">
        <span>Session</span>
        <strong>{{ sessionAttempts }} / {{ SESSION_LENGTH }}</strong>
      </div>
      <div class="stat-chip">
        <span>Accuracy</span>
        <strong>{{ sessionAccuracy }}%</strong>
      </div>
      <div class="stat-chip">
        <span>Streak</span>
        <strong>{{ sessionStreak }}</strong>
      </div>
      <div class="stat-chip">
        <span>Speed</span>
        <strong>{{ sessionAverage }} ms</strong>
      </div>
      <div class="stat-chip stat-chip-soft">
        <span>Level</span>
        <strong>{{ level }}</strong>
      </div>
      <div class="stat-chip stat-chip-soft">
        <span>XP</span>
        <strong>{{ xp }}</strong>
      </div>
      <div class="stat-chip stat-chip-soft">
        <span>Overall</span>
        <strong>{{ overallAccuracy }}%</strong>
      </div>
      <div class="stat-chip stat-chip-soft">
        <span>Weak spot</span>
        <strong>{{ weakSpot }}</strong>
      </div>
      <div class="stat-chip stat-chip-soft">
        <span>Avg</span>
        <strong>{{ overallAverage }} ms</strong>
      </div>
      <div class="stat-chip stat-chip-soft">
        <span>Best</span>
        <strong>{{ Math.max(sessionBestStreak, progress.bestStreak) }}</strong>
      </div>
    </div>
  </div>
</template>
