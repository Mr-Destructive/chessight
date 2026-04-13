<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import ChessBoard from './ChessBoard.vue'
import { allSquares, isDarkSquare, randomSquare, shuffleSquares, type BoardSide, type Square } from '../lib/chess'

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
  guess: Square | null
  correct: Square
  isCorrect: boolean
  timedOut?: boolean
} | null

type TrainingMode = 'normal' | 'timed' | 'rapid'

const SESSION_LENGTHS: Record<TrainingMode, number> = {
  normal: 12,
  timed: 12,
  rapid: 8,
}

const QUESTION_LIMITS_MS: Record<TrainingMode, number> = {
  normal: 0,
  timed: 15000,
  rapid: 8000,
}

const REVEAL_MS: Record<TrainingMode, number> = {
  normal: 520,
  timed: 520,
  rapid: 360,
}

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
const questionDeadline = ref<number | null>(null)
const timerNow = ref(Date.now())
const feedback = ref<FeedbackState>(null)
const locked = ref(false)
const completed = ref(false)
const playMode = ref<TrainingMode>('normal')
const boardSide = ref<BoardSide>('white')

let revealTimer: number | undefined
let questionTimer: number | undefined
let countdownTicker: number | undefined

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

function clearRevealTimer() {
  if (revealTimer !== undefined) {
    window.clearTimeout(revealTimer)
    revealTimer = undefined
  }
}

function clearQuestionTimer() {
  if (questionTimer !== undefined) {
    window.clearTimeout(questionTimer)
    questionTimer = undefined
  }

  if (countdownTicker !== undefined) {
    window.clearInterval(countdownTicker)
    countdownTicker = undefined
  }

  questionDeadline.value = null
}

function startQuestionTimer() {
  clearQuestionTimer()

  const limit = QUESTION_LIMITS_MS[playMode.value]
  if (!limit) return

  questionDeadline.value = Date.now() + limit
  timerNow.value = Date.now()

  countdownTicker = window.setInterval(() => {
    timerNow.value = Date.now()
  }, 200)

  questionTimer = window.setTimeout(() => {
    handleTimeout()
  }, limit)
}

function createSessionQueue(): Square[] {
  return shuffleSquares(allSquares).slice(0, SESSION_LENGTHS[playMode.value])
}

function startSession() {
  clearRevealTimer()
  clearQuestionTimer()
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
  startQuestionTimer()
}

function nextQuestion() {
  clearRevealTimer()
  clearQuestionTimer()
  currentIndex.value += 1
  if (currentIndex.value >= sessionQueue.value.length) {
    progress.sessionsCompleted += 1
    saveProgress()
    completed.value = true
    return
  }

  promptSquare.value = sessionQueue.value[currentIndex.value]
  questionStart.value = Date.now()
  feedback.value = null
  locked.value = false
  startQuestionTimer()
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

  clearRevealTimer()
  clearQuestionTimer()
  locked.value = true
  const isCorrect = square === promptSquare.value
  const responseMs = Date.now() - questionStart.value

  feedback.value = { guess: square, correct: promptSquare.value, isCorrect }
  recordAttempt(promptSquare.value, isCorrect, responseMs)

  revealTimer = window.setTimeout(() => {
    nextQuestion()
  }, REVEAL_MS[playMode.value])
}

function handleTimeout() {
  if (locked.value || completed.value) return

  clearRevealTimer()
  clearQuestionTimer()
  locked.value = true

  const responseMs = QUESTION_LIMITS_MS[playMode.value]
  feedback.value = {
    guess: null,
    correct: promptSquare.value,
    isCorrect: false,
    timedOut: true,
  }
  recordAttempt(promptSquare.value, false, responseMs)

  revealTimer = window.setTimeout(() => {
    nextQuestion()
  }, REVEAL_MS[playMode.value])
}

const sessionLength = computed(() => SESSION_LENGTHS[playMode.value])

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

const modeLabel = computed(() => (playMode.value === 'normal' ? 'Practice' : playMode.value === 'timed' ? 'Timed' : 'Rapid'))

const timeLabel = computed(() => {
  const limit = QUESTION_LIMITS_MS[playMode.value]
  if (!limit) return 'Unlimited'
  return `${Math.ceil(Math.max(0, (questionDeadline.value ?? 0) - timerNow.value) / 1000)}s left`
})

const resultLine = computed(() => {
  if (!feedback.value) return ''
  if (feedback.value.timedOut) {
    return `Time up. Correct: ${feedback.value.correct}`
  }

  return feedback.value.isCorrect
    ? `Correct: ${feedback.value.correct}`
    : `Wrong: ${feedback.value.guess} · Correct: ${feedback.value.correct}`
})

watch(playMode, () => {
  startSession()
})

onMounted(() => {
  startSession()
})

onBeforeUnmount(() => {
  clearRevealTimer()
  clearQuestionTimer()
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

    <div class="control-row">
      <label class="select-chip">
        <span>Mode</span>
        <select v-model="playMode">
          <option value="normal">Practice</option>
          <option value="timed">Timed</option>
          <option value="rapid">Rapid</option>
        </select>
      </label>
      <label class="select-chip">
        <span>Side</span>
        <select v-model="boardSide">
          <option value="white">White</option>
          <option value="black">Black</option>
        </select>
      </label>
    </div>

    <div class="micro-copy">Tap a square. {{ modeLabel }} mode runs on {{ timeLabel }}.</div>

    <ChessBoard
      :selected-squares="feedback?.guess ? [feedback.guess] : []"
      :correct-squares="feedback ? [feedback.correct] : []"
      :wrong-squares="feedback && feedback.guess && !feedback.isCorrect ? [feedback.guess] : []"
      :locked="locked || completed"
      :orientation="boardSide"
      @select="submitGuess"
    />

    <div class="hint-row">
      <span>Round {{ Math.min(currentIndex + 1, sessionLength) }} / {{ sessionLength }}</span>
      <div class="hint-actions">
        <span>{{ timeLabel }}</span>
        <button class="ghost-button" type="button" @click="startSession">Reset</button>
      </div>
    </div>

    <div v-if="resultLine" class="result-line">
      {{ resultLine }}
    </div>

    <div class="stat-strip">
      <div class="stat-chip">
        <span>Session</span>
        <strong>{{ sessionAttempts }} / {{ sessionLength }}</strong>
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
        <span>Avg</span>
        <strong>{{ overallAverage }} ms</strong>
      </div>
      <div class="stat-chip stat-chip-soft">
        <span>Best</span>
        <strong>{{ Math.max(sessionBestStreak, progress.bestStreak) }}</strong>
      </div>
      <div class="stat-chip stat-chip-soft">
        <span>Weak spot</span>
        <strong>{{ weakSpot }}</strong>
      </div>
    </div>
  </div>
</template>
