<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import ChessBoard from './ChessBoard.vue'
import {
  createPieceDrill,
  normalizeSquare,
  type BoardSide,
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
  timedOut?: boolean
} | null

type InputMode = 'click' | 'keyboard' | 'both'
type TrainingMode = 'normal' | 'timed' | 'rapid'

const SESSION_LENGTHS: Record<TrainingMode, number> = {
  normal: 10,
  timed: 10,
  rapid: 6,
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
  { value: 'isolated', label: 'Open board' },
  { value: 'position', label: 'Position' },
]

const PLAY_MODES: Array<{ value: TrainingMode; label: string; note: string }> = [
  { value: 'normal', label: 'Practice', note: 'No timer' },
  { value: 'timed', label: 'Timed', note: '15 seconds per round' },
  { value: 'rapid', label: 'Rapid', note: '8 seconds per round' },
]

const INPUT_MODES: Array<{ value: InputMode; label: string; note: string }> = [
  { value: 'both', label: 'Both', note: 'Tap or type' },
  { value: 'keyboard', label: 'Keyboard', note: 'Type squares like e3 g4' },
  { value: 'click', label: 'Tap', note: 'Board only' },
]

const BOARD_SIDES: Array<{ value: BoardSide; label: string }> = [
  { value: 'white', label: 'White' },
  { value: 'black', label: 'Black' },
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
const playMode = ref<TrainingMode>('normal')
const boardSide = ref<BoardSide>('white')
const inputMode = ref<InputMode>('both')
const answerBuffer = ref('')
const keyboardInput = ref<HTMLInputElement | null>(null)
const questionDeadline = ref<number | null>(null)
const timerNow = ref(Date.now())

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

function focusKeyboardInput() {
  if (!supportsKeyboardInput()) return
  keyboardInput.value?.focus({ preventScroll: true })
}

function startDrill() {
  clearRevealTimer()
  clearQuestionTimer()
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
  startQuestionTimer()
  void nextTick(focusKeyboardInput)
}

function nextQuestion() {
  clearRevealTimer()
  clearQuestionTimer()
  currentIndex.value += 1

  if (currentIndex.value >= sessionLength.value) {
    progress.sessionsCompleted += 1
    saveProgress()
    completed.value = true
    return
  }

  drill.value = createPieceDrill(pieceSelection.value, contextSelection.value)
  selectedSquares.value = []
  feedback.value = null
  locked.value = false
  answerBuffer.value = ''
  questionStart.value = Date.now()
  startQuestionTimer()
  void nextTick(focusKeyboardInput)
}

function sameSelection(a: Square[], b: Square[]) {
  if (a.length !== b.length) return false
  return [...a].sort().join('|') === [...b].sort().join('|')
}

function parseAnswerBuffer(raw: string): Square[] {
  return raw
    .toLowerCase()
    .split(/[\s,;]+/)
    .map((part) => normalizeSquare(part))
    .filter((square): square is Square => Boolean(square))
}

function supportsKeyboardInput() {
  return inputMode.value !== 'click'
}

function supportsTapInput() {
  return inputMode.value !== 'keyboard'
}

function resolveSelectedSquares() {
  if (supportsKeyboardInput() && answerBuffer.value.trim()) {
    const parsed = parseAnswerBuffer(answerBuffer.value)
    if (parsed.length > 0) return parsed
  }

  return [...selectedSquares.value]
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

function finalizeAnswer(fromTimeout = false) {
  if (locked.value || completed.value) return

  clearRevealTimer()
  clearQuestionTimer()
  locked.value = true

  const solution = drill.value.legalMoves
  const selected = resolveSelectedSquares()
  const isCorrect = sameSelection(selected, solution)
  const responseMs = fromTimeout && QUESTION_LIMITS_MS[playMode.value] > 0
    ? QUESTION_LIMITS_MS[playMode.value]
    : Date.now() - questionStart.value

  feedback.value = {
    selected,
    correct: solution,
    wrong: selected.filter((square) => !solution.includes(square)),
    missed: solution.filter((square) => !selected.includes(square)),
    isCorrect,
    timedOut: fromTimeout,
  }

  recordAttempt(isCorrect, responseMs)

  revealTimer = window.setTimeout(() => {
    nextQuestion()
  }, REVEAL_MS[playMode.value])
}

function submitAnswer() {
  finalizeAnswer(false)
}

function handleTimeout() {
  finalizeAnswer(true)
}

function toggleSquare(square: Square) {
  if (locked.value || completed.value || !supportsTapInput()) return

  answerBuffer.value = ''
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
  if (target && ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName)) return

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
    const parsed = parseAnswerBuffer(answerBuffer.value)
    if (parsed.length > 0) {
      selectedSquares.value = parsed
    }
    answerBuffer.value = ''
    event.preventDefault()
    return
  }

  if (/^[a-h1-8]$/.test(key)) {
    answerBuffer.value += key
    event.preventDefault()
  }
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

const playModeLabel = computed(
  () => PLAY_MODES.find((option) => option.value === playMode.value)?.label ?? 'Practice',
)

const playModeNote = computed(
  () => PLAY_MODES.find((option) => option.value === playMode.value)?.note ?? '',
)

const inputModeLabel = computed(() => {
  if (inputMode.value === 'keyboard') return 'Keyboard'
  if (inputMode.value === 'both') return 'Both'
  return 'Tap'
})

const inputModeNote = computed(
  () => INPUT_MODES.find((option) => option.value === inputMode.value)?.note ?? '',
)

const timeLabel = computed(() => {
  const limit = QUESTION_LIMITS_MS[playMode.value]
  if (!limit) return 'Unlimited'
  return `${Math.ceil(Math.max(0, (questionDeadline.value ?? 0) - timerNow.value) / 1000)}s left`
})

const boardLocked = computed(() => locked.value || completed.value || inputMode.value === 'keyboard')

const actionLabel = computed(() => (feedback.value ? 'Next' : 'Check'))

const resultSummary = computed(() => {
  if (!feedback.value) return ''
  const prefix = feedback.value.timedOut ? 'Time up. ' : ''
  return feedback.value.isCorrect
    ? `${prefix}Correct: ${feedback.value.correct.join(', ')}`
    : `${prefix}Missed: ${feedback.value.missed.join(', ')}`
})

onMounted(() => {
  startDrill()
  window.addEventListener('keydown', handleKeydown)
})

watch([pieceSelection, contextSelection], startDrill)

watch(playMode, () => {
  startDrill()
})

watch(inputMode, () => {
  if (supportsKeyboardInput()) {
    void nextTick(focusKeyboardInput)
  }
})

onBeforeUnmount(() => {
  clearRevealTimer()
  clearQuestionTimer()
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
        <span>Mode</span>
        <select v-model="playMode">
          <option v-for="option in PLAY_MODES" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>
      <label class="select-chip">
        <span>Side</span>
        <select v-model="boardSide">
          <option v-for="option in BOARD_SIDES" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>
      <label class="select-chip">
        <span>Piece</span>
        <select v-model="pieceSelection">
          <option v-for="option in PIECES" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>
      <label class="select-chip">
        <span>Context</span>
        <select v-model="contextSelection">
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
      {{ playModeNote }} · {{ inputModeNote }} · {{ boardSide === 'white' ? 'White' : 'Black' }} side
    </div>

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
      :orientation="boardSide"
      @select="toggleSquare"
    />

    <div class="hint-row">
      <span>Selected {{ selectedSquares.length }} / {{ drill.legalMoves.length }}</span>
      <div class="hint-actions">
        <span>{{ timeLabel }}</span>
        <span v-if="supportsKeyboardInput()">
          {{ answerBuffer ? `Buffer ${answerBuffer}` : inputModeLabel }}
        </span>
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
        placeholder="Type squares like e3 g4 or e3, g4"
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
      <div class="stat-chip stat-chip-soft">
        <span>Mode</span>
        <strong>{{ playModeLabel }}</strong>
      </div>
    </div>
  </div>
</template>
