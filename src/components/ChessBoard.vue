<script setup lang="ts">
import { computed } from 'vue'
import { files, ranks, type PieceType, type Square, isDarkSquare } from '../lib/chess'

const props = defineProps<{
  selectedSquares?: Square[]
  correctSquares?: Square[]
  wrongSquares?: Square[]
  missedSquares?: Square[]
  pieceSquare?: Square | null
  pieceType?: PieceType | null
  friendlySquares?: Square[]
  enemySquares?: Square[]
  locked: boolean
}>()

const emit = defineEmits<{
  select: [square: Square]
}>()

const pieceSpriteIds: Record<PieceType, string> = {
  pawn: 'wp',
  knight: 'wn',
  bishop: 'wb',
  rook: 'wr',
  queen: 'wq',
  king: 'wk',
}

const pieceSpriteUrl = `${import.meta.env.BASE_URL}chess-pieces-standard.svg`

const squares = computed(() =>
  ranks.flatMap((rank) =>
    files.map((file) => {
      const square = `${file}${rank}` as Square
      return {
        square,
        isDark: isDarkSquare(square),
        isSelected: props.selectedSquares?.includes(square) ?? false,
        isCorrect: props.correctSquares?.includes(square) ?? false,
        isWrong: props.wrongSquares?.includes(square) ?? false,
        isMissed: props.missedSquares?.includes(square) ?? false,
        hasPiece: props.pieceSquare === square,
        pieceType: props.pieceType ?? null,
        isFriendly: props.friendlySquares?.includes(square) ?? false,
        isEnemy: props.enemySquares?.includes(square) ?? false,
      }
    }),
  ),
)
</script>

<template>
  <div class="board-shell">
    <div class="board" aria-label="Chess board">
      <button
        v-for="cell in squares"
        :key="cell.square"
        class="square"
        :class="{
          dark: cell.isDark,
          selected: cell.isSelected,
          correct: cell.isCorrect,
          wrong: cell.isWrong,
          missed: cell.isMissed,
          piece: cell.hasPiece,
          friendly: cell.isFriendly,
          enemy: cell.isEnemy,
        }"
        :aria-label="cell.square"
        :disabled="locked"
        @click="emit('select', cell.square)"
      >
        <svg
          v-if="cell.hasPiece && cell.pieceType"
          class="piece-icon"
          viewBox="0 0 40 40"
          aria-hidden="true"
          focusable="false"
        >
          <use
            :href="`${pieceSpriteUrl}#${pieceSpriteIds[cell.pieceType]}`"
            x="0"
            y="0"
            width="40"
            height="40"
          />
        </svg>
        <span v-else-if="cell.isFriendly" class="piece-marker friendly"></span>
        <span v-else-if="cell.isEnemy" class="piece-marker enemy"></span>
      </button>
    </div>
  </div>
</template>
