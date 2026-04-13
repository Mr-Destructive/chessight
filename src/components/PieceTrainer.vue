<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import ChessBoard from './ChessBoard.vue'
import {
  createPieceDrill,
  normalizeSquare,
  type PieceContext,
  type PieceDrill,
  type PieceType,
  type Square,
} from '../lib/chess'

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
  byPiece: Record<string, SquareStats>
  byContext: Record<string, SquareStats>
}

type FeedbackState = {
  selected: Square[]
  correct: Square[]
  wrong: Square[]
  missed: Square[]
  isCorrect: boolean
} | null

type InputMode = 'click' | 'keyboard' | 'both'

const SESSION_LENGTH = 10

const props = defineProps<{
  storageKey: string
}>()

const PIECES: Array<{ value: PieceType | 'random'; label: string }> = [
  { value: 'random', label: 'Random' },
  { value: 'pawn', label: 'Pawn' },
  { value: 'knight', label: 'Knight' },
  { value: 'bishop', label: 'Bishop' },
  { value: 'rook', label: 'Rook' },
  { value: 'queen', label: 'Queen' },
  { value: 'king', label: 'King' },
]

const CONTEXTS: Array<{ value: PieceContext | 'random'; label: string }> = [
  { value: 'random', label: 'Mixed' },
  { value: 'isolated', label: 'Isolated' },
  { value: 'position', label: 'Position' },
]

const INPUT_MODES: Array<{ value: InputMode; label: string; note: string }> = [
  { value: 'keyboard', label: 'Keyboard', note: 'Type squares like e3 g4' },
  { value: 'both', label: 'Both', note: 'Tap or type' },
  { value: 'click', label: 'Tap', note: 'Board only' },
]

const progress = reactive<ProgressState>(loadProgress())
const drill = ref<PieceDrill>(createPieceDrill('random', 'random'))
const currentIndex = ref(0)
const sessionAttempts = ref(0)
const sessionCorrect = ref(0)
const sessionStreak = ref(0)
const sessionBestStreak = ref(0)
const sessionTotalResponseMs = ref(0)
const questionStart = ref(Date.now())
const selectedSquares = ref<Square[]>([])
const feedback = ref<FeedbackState>(null)
const locked = ref(false)
const completed = ref(false)
const pieceSelection = ref<PieceType | 'random'>('random')
const contextSelection = ref<PieceContext | 'random'>('random')
const inputMode = ref<InputMode>('keyboard')
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
      byPiece: {},
      byContext: {},
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
      byPiece: parsed.byPiece ?? {},
      byContext: parsed.byContext ?? {},
    }
  } catch {
    return {
      totalAttempts: 0,
      totalCorrect: 0,
      totalResponseMs: 0,
      bestStreak: 0,
      sessionsCompleted: 0,
      byPiece: {},
      byContext: {},
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
  if (!supportsKeyboardInput()) return
  keyboardInput.value?.focus({ preventScroll: true })
}

function startDrill() {
  clearTimer()
  drill.value = createPieceDrill(pieceSelection.value, contextSelection.value)
  currentIndex.value = 0
  sessionAttempts.value = 0
  sessionCorrect.value = 0
  sessionStreak.value = 0
  sessionBestStreak.value = 0
  sessionTotalResponseMs.value = 0
  completed.value = false
  feedback.value = null
  locked.value = false
  selectedSquares.value = []
  answerBuffer.value = ''
  questionStart.value = Date.now()
  void nextTick(focusKeyboardInput)
}

function nextQuestion() {
  currentIndex.value += 1
  if (currentIndex.value >= SESSION_LENGTH) {
    progress.sessionsCompleted += 1
    saveProgress()
    completed.value = true
    clearTimer()
    return
  }

  drill.value = createPieceDrill(pieceSelection.value, contextSelection.value)
  selectedSquares.value = []
  feedback.value = null
  locked.value = false
  answerBuffer.value = ''
  questionStart.value = Date.now()
  void nextTick(focusKeyboardInput)
}

function sameSelection(a: Square[], b: Square[]) {
  if (a.length !== b.length) return false
  return [...a].sort().join('|') === [...b].sort().join('|')
}

function supportsKeyboardInput() {
  return inputMode.value !== 'click'
}

function supportsTapInput() {
  return inputMode.value !== 'keyboard'
}

function recordAttempt(isCorrect: boolean, responseMs: number) {
  progress.totalAttempts += 1
  progress.totalCorrect += isCorrect ? 1 : 0
  progress.totalResponseMs += responseMs
  sessionTotalResponseMs.value += responseMs
  sessionAttempts.value += 1

  if (isCorrect) {
    sessionCorrect.value += 1
    sessionStreak.value += 1
    sessionBestStreak.value = Math.max(sessionBestStreak.value, sessionStreak.value)
  } else {
    sessionStreak.value = 0
  }

  progress.bestStreak = Math.max(progress.bestStreak, sessionBestStreak.value)

  const pieceBucket = progress.byPiece[drill.value.pieceType] ?? {
    attempts: 0,
    correct: 0,
    totalResponseMs: 0,
  }
  pieceBucket.attempts += 1
  pieceBucket.correct += isCorrect ? 1 : 0
  pieceBucket.totalResponseMs += responseMs
  progress.byPiece[drill.value.pieceType] = pieceBucket

  const contextBucket = progress.byContext[drill.value.context] ?? {
    attempts: 0,
    correct: 0,
    totalResponseMs: 0,
  }
  contextBucket.attempts += 1
  contextBucket.correct += isCorrect ? 1 : 0
  contextBucket.totalResponseMs += responseMs
  progress.byContext[drill.value.context] = contextBucket

  saveProgress()
}

function submitAnswer() {
  if (locked.value || completed.value) return

  locked.value = true
  const solution = drill.value.legalMoves
  const selected = [...selectedSquares.value]
  const isCorrect = sameSelection(selected, solution)
  const responseMs = Date.now() - questionStart.value

  feedback.value = {
    selected,
    correct: solution,
    wrong: selected.filter((square) => !solution.includes(square)),
    missed: solution.filter((square) => !selected.includes(square)),
    isCorrect,
  }

  recordAttempt(isCorrect, responseMs)
}

function toggleSquare(square: Square) {
  if (locked.value || completed.value || !supportsTapInput()) return

  const index = selectedSquares.value.indexOf(square)
  if (index >= 0) {
    selectedSquares.value = selectedSquares.value.filter((item) => item !== square)
  } else {
    selectedSquares.value = [...selectedSquares.value, square]
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (completed.value) {
    if (event.key === 'Enter') startDrill()
    return
  }

  if (feedback.value) {
    if (event.key === 'Enter' || event.key === ' ') {
      nextQuestion()
      event.preventDefault()
    }
    return
  }

  if (!supportsKeyboardInput()) return

  const target = event.target as HTMLElement | null
  if (target && ['SELECT', 'BUTTON'].includes(target.tagName)) return

  const key = event.key.toLowerCase()
  if (key === 'enter') {
    submitAnswer()
    event.preventDefault()
    return
  }

  if (key === 'backspace') {
    if (answerBuffer.value.length > 0) {
      answerBuffer.value = answerBuffer.value.slice(0, -1)
    } else {
      selectedSquares.value = selectedSquares.value.slice(0, -1)
    }
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
      const square = normalizeSquare(answerBuffer.value)
      if (square && !selectedSquares.value.includes(square)) {
        selectedSquares.value = [...selectedSquares.value, square]
      }
      answerBuffer.value = ''
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
  const pieceEntries = Object.entries(progress.byPiece)
    .filter(([, value]) => value.attempts >= 3)
    .map(([key, value]) => ({ key, rate: value.correct / value.attempts }))
    .sort((a, b) => a.rate - b.rate)

  if (pieceEntries[0]) {
    return `Weakest piece: ${pieceEntries[0].key}`
  }

  const contextEntries = Object.entries(progress.byContext)
    .filter(([, value]) => value.attempts >= 3)
    .map(([key, value]) => ({ key, rate: value.correct / value.attempts }))
    .sort((a, b) => a.rate - b.rate)

  if (contextEntries[0]) {
    return `Weakest context: ${contextEntries[0].key}`
  }

  return 'No clear weak spot yet'
})

const promptLabel = computed(() => {
  const name = drill.value.pieceType
  const piece = pieceSelection.value === 'random' ? `Random ${name}` : `${name[0].toUpperCase()}${name.slice(1)}`
  const context = drill.value.context === 'isolated' ? 'open board' : 'position'
  return completed.value ? 'Drill complete' : `${piece} in a ${context}`
})

const inputModeLabel = computed(() => {
  if (inputMode.value === 'keyboard') return 'Keyboard'
  if (inputMode.value === 'both') return 'Both'
  return 'Tap'
})

const inputModeNote = computed(
  () => INPUT_MODES.find((option) => option.value === inputMode.value)?.note ?? '',
)

const boardLocked = computed(() => locked.value || completed.value || inputMode.value === 'keyboard')

const actionLabel = computed(() => (feedback.value ? 'Next' : 'Check'))

const resultSummary = computed(() => {
  if (!feedback.value) return ''
  return feedback.value.isCorrect
    ? `Correct: ${feedback.value.correct.join(', ')}`
    : `Missed: ${feedback.value.missed.join(', ')}`
})

onMounted(() => {
  startDrill()
  window.addEventListener('keydown', handleKeydown)
})

watch(inputMode, () => {
  void nextTick(focusKeyboardInput)
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
        <div class="micro-copy">
          {{ drill.context === 'position' ? 'Real position with blockers' : 'Empty board drill' }}
        </div>
      </div>
      <button class="ghost-button" type="button" @click="startDrill">New drill</button>
    </div>

    <div class="control-row">
      <label class="select-chip">
        <span>Piece</span>
        <select v-model="pieceSelection" @change="startDrill">
          <option v-for="option in PIECES" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>
      <label class="select-chip">
        <span>Context</span>
        <select v-model="contextSelection" @change="startDrill">
          <option v-for="option in CONTEXTS" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>
      <label class="select-chip">
        <span>Input</span>
        <select v-model="inputMode">
          <option v-for="option in INPUT_MODES" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>
    </div>

    <div class="micro-copy">
      {{ inputModeNote }}
    </div>

    <input
      v-if="supportsKeyboardInput()"
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

    <ChessBoard
      :selected-squares="selectedSquares"
      :correct-squares="feedback ? feedback.correct : []"
      :wrong-squares="feedback ? feedback.wrong : []"
      :missed-squares="feedback ? feedback.missed : []"
      :piece-square="drill.origin"
      :friendly-squares="drill.context === 'position' ? drill.friendlySquares : []"
      :enemy-squares="drill.context === 'position' ? drill.enemySquares : []"
      :piece-type="drill.pieceType"
      :locked="boardLocked"
      @select="toggleSquare"
    />

    <div class="hint-row">
      <span>Selected {{ selectedSquares.length }} / {{ drill.legalMoves.length }}</span>
      <div class="hint-actions">
        <span v-if="supportsKeyboardInput()">{{ answerBuffer ? `Buffer ${answerBuffer}` : inputModeLabel }}</span>
        <button
          v-if="supportsKeyboardInput()"
          class="ghost-button"
          type="button"
          @click="focusKeyboardInput"
        >
          Type
        </button>
        <button
          class="primary-button"
          type="button"
          @click="feedback ? nextQuestion() : submitAnswer()"
        >
          {{ actionLabel }}
        </button>
      </div>
    </div>

    <div v-if="supportsKeyboardInput()" class="keyboard-row">
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
        placeholder="Type squares like e3 g4"
        aria-label="Type legal move squares"
        @focus="focusKeyboardInput"
        @keydown.enter.prevent="submitAnswer"
      />
      <button class="ghost-button" type="button" @click="focusKeyboardInput">Open keyboard</button>
    </div>

    <div v-if="resultSummary" class="result-line">
      {{ resultSummary }}
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
