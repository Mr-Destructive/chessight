export const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const
export const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'] as const
export type BoardSide = 'white' | 'black'

export type Square = `${(typeof files)[number]}${(typeof ranks)[number]}`
export type PieceType = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king'
export type PieceContext = 'isolated' | 'position'

export type PieceDrill = {
  pieceType: PieceType
  context: PieceContext
  origin: Square
  friendlySquares: Square[]
  enemySquares: Square[]
  legalMoves: Square[]
}

const knightOffsets = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
] as const

const kingOffsets = [
  [1, 1],
  [1, 0],
  [1, -1],
  [0, 1],
  [0, -1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
] as const

const bishopDirections = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const

const rookDirections = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const

const pawnStartRanks = new Set<Square[1]>(['2'])

export const allSquares: Square[] = files.flatMap((file) =>
  ranks.map((rank) => `${file}${rank}` as Square),
)

export function squareToCoords(square: Square): { file: number; rank: number } {
  return {
    file: files.indexOf(square[0] as (typeof files)[number]),
    rank: ranks.indexOf(square[1] as (typeof ranks)[number]),
  }
}

export function coordsToSquare(file: number, rank: number): Square | null {
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null
  return `${files[file]}${ranks[rank]}` as Square
}

export function isDarkSquare(square: Square): boolean {
  const { file, rank } = squareToCoords(square)
  const rankIndex = 7 - rank
  const fileIndex = file
  return (fileIndex + rankIndex) % 2 === 1
}

export function randomSquare(): Square {
  return allSquares[Math.floor(Math.random() * allSquares.length)]
}

export function shuffleSquares(source: Square[]): Square[] {
  const copy = [...source]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

export function normalizeSquare(value: string): Square | null {
  const lower = value.trim().toLowerCase()
  if (lower.length !== 2) return null
  if (!files.includes(lower[0] as (typeof files)[number])) return null
  if (!ranks.includes(lower[1] as (typeof ranks)[number])) return null
  return lower as Square
}

export function knightMoves(square: Square): Square[] {
  const { file, rank } = squareToCoords(square)
  return knightOffsets
    .map(([df, dr]) => coordsToSquare(file + df, rank + dr))
    .filter((next): next is Square => Boolean(next))
}

export const pieceSymbols: Record<PieceType, string> = {
  pawn: '♟',
  knight: '♞',
  bishop: '♝',
  rook: '♜',
  queen: '♛',
  king: '♚',
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randomChoice<T>(values: T[]): T {
  return values[Math.floor(Math.random() * values.length)]
}

function buildMoveLine(
  origin: Square,
  directions: readonly (readonly [number, number])[],
  friendly: Set<Square>,
  enemy: Set<Square>,
): Square[] {
  const { file, rank } = squareToCoords(origin)
  const moves: Square[] = []

  for (const [df, dr] of directions) {
    let nextFile = file + df
    let nextRank = rank + dr
    while (true) {
      const next = coordsToSquare(nextFile, nextRank)
      if (!next) break
      if (friendly.has(next)) break
      moves.push(next)
      if (enemy.has(next)) break
      nextFile += df
      nextRank += dr
    }
  }

  return moves
}

function legalMovesForPosition(
  pieceType: PieceType,
  origin: Square,
  friendly: Set<Square>,
  enemy: Set<Square>,
): Square[] {
  const { file, rank } = squareToCoords(origin)

  if (pieceType === 'pawn') {
    const moves: Square[] = []
    const oneStep = coordsToSquare(file, rank - 1)
    if (oneStep && !friendly.has(oneStep) && !enemy.has(oneStep)) {
      moves.push(oneStep)

      const startRank = origin[1] as Square[1]
      const twoStep = coordsToSquare(file, rank - 2)
      if (pawnStartRanks.has(startRank) && twoStep && !friendly.has(twoStep) && !enemy.has(twoStep)) {
        moves.push(twoStep)
      }
    }

    const leftCapture = coordsToSquare(file - 1, rank - 1)
    const rightCapture = coordsToSquare(file + 1, rank - 1)
    if (leftCapture && enemy.has(leftCapture)) moves.push(leftCapture)
    if (rightCapture && enemy.has(rightCapture)) moves.push(rightCapture)
    return moves
  }

  if (pieceType === 'knight') {
    return knightOffsets
      .map(([df, dr]) => coordsToSquare(file + df, rank + dr))
      .filter((square): square is Square => {
        if (!square) return false
        return !friendly.has(square)
      })
  }

  if (pieceType === 'king') {
    return kingOffsets
      .map(([df, dr]) => coordsToSquare(file + df, rank + dr))
      .filter((square): square is Square => {
        if (!square) return false
        return !friendly.has(square)
      })
  }

  if (pieceType === 'bishop') {
    return buildMoveLine(origin, bishopDirections, friendly, enemy)
  }

  if (pieceType === 'rook') {
    return buildMoveLine(origin, rookDirections, friendly, enemy)
  }

  return buildMoveLine(origin, [...bishopDirections, ...rookDirections], friendly, enemy)
}

export function createPieceDrill(
  pieceType: PieceType | 'random' = 'random',
  context: PieceContext | 'random' = 'random',
): PieceDrill {
  const resolvedPieceType =
    pieceType === 'random'
      ? randomChoice<PieceType>(['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'])
      : pieceType
  const resolvedContext = context === 'random' ? randomChoice<PieceContext>(['isolated', 'position']) : context
  const origin =
    resolvedPieceType === 'pawn'
      ? randomChoice<Square>(
          allSquares.filter((square) => square[1] === '2' || square[1] === '3' || square[1] === '4'),
        )
      : randomSquare()

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const friendly = new Set<Square>()
    const enemy = new Set<Square>()

    if (resolvedContext === 'position') {
      const pool = shuffleSquares(allSquares.filter((square) => square !== origin))
      const blockerCount = randomInt(6, 14)
      for (let index = 0; index < blockerCount; index += 1) {
        const square = pool[index]
        if (!square) break
        if (Math.random() < 0.58) {
          friendly.add(square)
        } else {
          enemy.add(square)
        }
      }
    }

    const legalMoves = legalMovesForPosition(resolvedPieceType, origin, friendly, enemy)
    const minimumMoves = resolvedPieceType === 'pawn' ? 1 : 2
    if (legalMoves.length >= minimumMoves || resolvedContext === 'isolated') {
      return {
        pieceType: resolvedPieceType,
        context: resolvedContext,
        origin,
        friendlySquares: [...friendly],
        enemySquares: [...enemy],
        legalMoves,
      }
    }
  }

  return {
    pieceType: resolvedPieceType,
    context: resolvedContext,
    origin,
    friendlySquares: [],
    enemySquares: [],
    legalMoves: legalMovesForPosition(resolvedPieceType, origin, new Set(), new Set()),
  }
}
