<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import ChessBoard from './ChessBoard.vue'
import { allSquares, knightMoves, randomSquare, shuffleSquares, type Square } from '../lib/chess'

type ProgressState = {
  totalAttempts: number
  totalCorrect: number
  totalResponseMs: number
  bestStreak: number
}

type FeedbackState = {
  selected: Square[]
  correct: Square[]
  wrong: Square[]
  missed: Square[]
  isCorrect: boolean
} | null

const STORAGE_KEY = 'chessight.knight-trainer.v1'
const SESSION_LENGTH = 10
const REVEAL_MS = 700
const KNIGHT = '♘'

const progress = reactive<ProgressState>(loadProgress())
const sessionQueue = ref<Square[]>([])
const sourceSquare = ref<Square>(randomSquare())
const selectedSquares = ref<Square[]>([])
const currentIndex = ref(0)
const sessionCorrect = ref(0)
const sessionStreak = ref(0)
const sessionBestStreak = ref(0)
const sessionTotalResponseMs = ref(0)
const questionStart = ref(Date.now())
const feedback = ref<FeedbackState>(null)
const locked = ref(false)
const completed = ref(false)

let revealTimer: number | undefined

function loadProgress(): ProgressState {
  if (typeof window === 'undefined') {
    return {
      totalAttempts: 0,
      totalCorrect: 0,
      totalResponseMs: 0,
      bestStreak: 0,
    }
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) throw new Error('missing')
    const parsed = JSON.parse(raw) as Partial<ProgressState>
    return {
      totalAttempts: parsed.totalAttempts ?? 0,
      totalCorrect: parsed.totalCorrect ?? 0,
      totalResponseMs: parsed.totalResponseMs ?? 0,
      bestStreak: parsed.bestStreak ?? 0,
    }
  } catch {
    return {
      totalAttempts: 0,
      totalCorrect: 0,
      totalResponseMs: 0,
      bestStreak: 0,
    }
  }
}

function saveProgress() {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress))
}

function clearTimer() {
  if (revealTimer) {
    window.clearTimeout(revealTimer)
    revealTimer = undefined
  }
}

function createSessionQueue(): Square[] {
  return shuffleSquares(allSquares).slice(0, SESSION_LENGTH)
}

function startSession() {
  clearTimer()
  sessionQueue.value = createSessionQueue()
  currentIndex.value = 0
  sessionCorrect.value = 0
  sessionStreak.value = 0
  sessionBestStreak.value = 0
  sessionTotalResponseMs.value = 0
  completed.value = false
  feedback.value = null
  locked.value = false
  selectedSquares.value = []
  sourceSquare.value = sessionQueue.value[0]
  questionStart.value = Date.now()
}

function nextQuestion() {
  currentIndex.value += 1
  if (currentIndex.value >= sessionQueue.value.length) {
    completed.value = true
    clearTimer()
    return
  }

  sourceSquare.value = sessionQueue.value[currentIndex.value]
  selectedSquares.value = []
  feedback.value = null
  locked.value = false
  questionStart.value = Date.now()
}

function sameSelection(a: Square[], b: Square[]) {
  if (a.length !== b.length) return false
  const left = [...a].sort().join('|')
  const right = [...b].sort().join('|')
  return left === right
}

function recordAttempt(isCorrect: boolean, responseMs: number) {
  progress.totalAttempts += 1
  progress.totalCorrect += isCorrect ? 1 : 0
  progress.totalResponseMs += responseMs
  sessionTotalResponseMs.value += responseMs

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

function toggleSquare(square: Square) {
  if (locked.value || completed.value) return

  const index = selectedSquares.value.indexOf(square)
  if (index >= 0) {
    selectedSquares.value = selectedSquares.value.filter((item) => item !== square)
  } else {
    selectedSquares.value = [...selectedSquares.value, square]
  }
}

function submitAnswer() {
  if (locked.value || completed.value) return

  locked.value = true
  const solution = knightMoves(sourceSquare.value)
  const selected = [...selectedSquares.value]
  const isCorrect = sameSelection(selected, solution)
  const responseMs = Date.now() - questionStart.value
  const wrong = selected.filter((square) => !solution.includes(square))
  const missed = solution.filter((square) => !selected.includes(square))

  feedback.value = {
    selected,
    correct: solution,
    wrong,
    missed,
    isCorrect,
  }

  recordAttempt(isCorrect, responseMs)

  revealTimer = window.setTimeout(() => {
    nextQuestion()
  }, REVEAL_MS)
}

function handleKeydown(event: KeyboardEvent) {
  if (completed.value) {
    if (event.key === 'Enter') startSession()
    return
  }

  if (event.key === 'Enter') {
    submitAnswer()
    event.preventDefault()
  }
}

const answeredCount = computed(() => currentIndex.value + (feedback.value ? 1 : 0))

const sessionAccuracy = computed(() => {
  const attempts = Math.max(1, answeredCount.value)
  return Math.round((sessionCorrect.value / attempts) * 100)
})

const overallAccuracy = computed(() => {
  if (progress.totalAttempts === 0) return 0
  return Math.round((progress.totalCorrect / progress.totalAttempts) * 100)
})

const sessionAverage = computed(() => {
  const attempts = Math.max(1, answeredCount.value)
  return Math.round(sessionTotalResponseMs.value / attempts)
})

const overallAverage = computed(() => {
  if (progress.totalAttempts === 0) return 0
  return Math.round(progress.totalResponseMs / progress.totalAttempts)
})

const promptLabel = computed(() =>
  completed.value ? 'Drill complete' : `Knight on ${sourceSquare.value}`,
)

const moveCount = computed(() => knightMoves(sourceSquare.value).length)

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
        <div class="prompt">{{ promptLabel }}</div>
      </div>
      <button class="ghost-button" type="button" @click="startSession">New drill</button>
    </div>

    <div class="micro-copy">Select all legal knight moves. Press Enter to check.</div>

    <ChessBoard
      :selected-squares="selectedSquares"
      :correct-squares="feedback ? feedback.correct : []"
      :wrong-squares="feedback ? feedback.wrong : []"
      :missed-squares="feedback ? feedback.missed : []"
      :piece-square="sourceSquare"
      :piece-type="'knight'"
      :locked="locked || completed"
      @select="toggleSquare"
    />

    <div class="hint-row">
      <span>Selected {{ selectedSquares.length }} / {{ moveCount }}</span>
      <button class="primary-button" type="button" @click="submitAnswer">Check</button>
    </div>

    <div class="stat-strip">
      <div class="stat-chip">
        <span>Session</span>
        <strong>{{ answeredCount }} / {{ SESSION_LENGTH }}</strong>
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
        <span>Target</span>
        <strong>{{ moveCount }}</strong>
      </div>
    </div>
  </div>
</template>
