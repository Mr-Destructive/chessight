type SquareStats = {
  attempts: number
  correct: number
  totalResponseMs: number
}

type PieceProgressBlob = {
  totalAttempts: number
  totalCorrect: number
  totalResponseMs: number
  bestStreak: number
  sessionsCompleted: number
  byPiece: Record<string, SquareStats>
  byContext: Record<string, SquareStats>
}

type CoordinateProgressBlob = {
  totalAttempts: number
  totalCorrect: number
  totalResponseMs: number
  bestStreak: number
  sessionsCompleted: number
  squareStats: Record<string, SquareStats>
  dark: SquareStats
  light: SquareStats
}

export type ProfilePieceRow = {
  label: string
  attempts: number
  accuracy: number
}

export type ProfileSummary = {
  drillsCompleted: number
  totalAttempts: number
  overallAccuracy: number
  averageResponseMs: number
  bestStreak: number
  pieceBestStreak: number
  coordinateBestStreak: number
  xp: number
  level: number
  league: string
  piecesMastered: number
  squaresMastered: number
  strongestSquare: string
  strongestPiece: string
  weakestPiece: string
  weakestSquare: string
  darkAccuracy: number | null
  lightAccuracy: number | null
  pieceRows: ProfilePieceRow[]
}

const PIECE_LABELS: Record<string, string> = {
  pawn: 'Pawn',
  knight: 'Knight',
  bishop: 'Bishop',
  rook: 'Rook',
  queen: 'Queen',
  king: 'King',
}

function emptySquareStats(): SquareStats {
  return { attempts: 0, correct: 0, totalResponseMs: 0 }
}

function emptyPieceProgress(): PieceProgressBlob {
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

function emptyCoordinateProgress(): CoordinateProgressBlob {
  return {
    totalAttempts: 0,
    totalCorrect: 0,
    totalResponseMs: 0,
    bestStreak: 0,
    sessionsCompleted: 0,
    squareStats: {},
    dark: emptySquareStats(),
    light: emptySquareStats(),
  }
}

function loadJson<T>(key: string): T | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function percent(correct: number, attempts: number): number {
  if (!attempts) return 0
  return Math.round((correct / attempts) * 100)
}

function strongestRow(rows: ProfilePieceRow[]): string {
  const strongest = rows
    .filter((row) => row.attempts >= 3)
    .sort((a, b) => b.accuracy - a.accuracy || b.attempts - a.attempts)[0]

  return strongest ? strongest.label : 'Not enough data yet'
}

function weakestRow(rows: ProfilePieceRow[]): string {
  const weakest = rows
    .filter((row) => row.attempts >= 3)
    .sort((a, b) => a.accuracy - b.accuracy || a.attempts - b.attempts)[0]

  return weakest ? weakest.label : 'Not enough data yet'
}

function weakestSquare(entries: Array<[string, SquareStats]>): string {
  const weakest = entries
    .filter(([, stats]) => stats.attempts >= 3)
    .map(([square, stats]) => ({ square, accuracy: stats.correct / stats.attempts }))
    .sort((a, b) => a.accuracy - b.accuracy)[0]

  return weakest ? weakest.square : 'Not enough data yet'
}

function strongestSquare(entries: Array<[string, SquareStats]>): string {
  const strongest = entries
    .filter(([, stats]) => stats.attempts >= 3)
    .map(([square, stats]) => ({ square, accuracy: stats.correct / stats.attempts }))
    .sort((a, b) => b.accuracy - a.accuracy)[0]

  return strongest ? strongest.square : 'Not enough data yet'
}

function leagueFor(totalAttempts: number, accuracy: number): string {
  if (totalAttempts < 20 || accuracy < 60) return 'Bronze'
  if (accuracy < 72) return 'Silver'
  if (accuracy < 84) return 'Gold'
  if (accuracy < 92) return 'Platinum'
  return 'Diamond'
}

export function deriveProfileSummary(
  pieceProgressInput: Partial<PieceProgressBlob> = {},
  coordinateProgressInput: Partial<CoordinateProgressBlob> = {},
): ProfileSummary {
  const pieceProgress = {
    ...emptyPieceProgress(),
    ...pieceProgressInput,
  }
  const coordinateProgress = {
    ...emptyCoordinateProgress(),
    ...coordinateProgressInput,
  }

  const pieceRows = Object.entries(pieceProgress.byPiece)
    .map(([piece, stats]) => ({
      label: PIECE_LABELS[piece] ?? piece,
      attempts: stats.attempts,
      accuracy: percent(stats.correct, stats.attempts),
    }))
    .filter((row) => row.attempts > 0)
    .sort((a, b) => b.attempts - a.attempts || b.accuracy - a.accuracy)

  const coordinateRows = Object.entries(coordinateProgress.squareStats)
    .map(([square, stats]) => ({
      label: square,
      attempts: stats.attempts,
      accuracy: percent(stats.correct, stats.attempts),
    }))
    .filter((row) => row.attempts > 0)
    .sort((a, b) => b.attempts - a.attempts || b.accuracy - a.accuracy)

  const totalAttempts = pieceProgress.totalAttempts + coordinateProgress.totalAttempts
  const totalCorrect = pieceProgress.totalCorrect + coordinateProgress.totalCorrect
  const totalResponseMs = pieceProgress.totalResponseMs + coordinateProgress.totalResponseMs
  const drillsCompleted = pieceProgress.sessionsCompleted + coordinateProgress.sessionsCompleted
  const bestStreak = Math.max(pieceProgress.bestStreak, coordinateProgress.bestStreak)
  const overallAccuracy = percent(totalCorrect, totalAttempts)
  const xp = totalCorrect * 100 + drillsCompleted * 250 + bestStreak * 50
  const level = Math.floor(xp / 1000) + 1

  return {
    drillsCompleted,
    totalAttempts,
    overallAccuracy,
    averageResponseMs: totalAttempts ? Math.round(totalResponseMs / totalAttempts) : 0,
    bestStreak,
    pieceBestStreak: pieceProgress.bestStreak,
    coordinateBestStreak: coordinateProgress.bestStreak,
    xp,
    level,
    league: leagueFor(totalAttempts, overallAccuracy),
    piecesMastered: pieceRows.filter((row) => row.attempts >= 5 && row.accuracy >= 75).length,
    squaresMastered: coordinateRows.filter((row) => row.attempts >= 4 && row.accuracy >= 75).length,
    strongestSquare: strongestSquare(Object.entries(coordinateProgress.squareStats)),
    strongestPiece: strongestRow(pieceRows),
    weakestPiece: weakestRow(pieceRows),
    weakestSquare: weakestSquare(Object.entries(coordinateProgress.squareStats)),
    darkAccuracy:
      coordinateProgress.dark.attempts > 0
        ? percent(coordinateProgress.dark.correct, coordinateProgress.dark.attempts)
        : null,
    lightAccuracy:
      coordinateProgress.light.attempts > 0
        ? percent(coordinateProgress.light.correct, coordinateProgress.light.attempts)
        : null,
    pieceRows,
  }
}

export function loadProfileSummary(storageKey: string): ProfileSummary {
  const pieceProgress = loadJson<Partial<PieceProgressBlob>>(`${storageKey}.piece`) ?? {}
  const coordinateProgress = loadJson<Partial<CoordinateProgressBlob>>(`${storageKey}.coordinates`) ?? {}
  return deriveProfileSummary(pieceProgress, coordinateProgress)
}
