import { describe, expect, it } from 'vitest'
import { deriveProfileSummary } from './profile'

describe('deriveProfileSummary', () => {
  it('aggregates profile metrics from piece and coordinate progress', () => {
    const summary = deriveProfileSummary(
      {
        totalAttempts: 12,
        totalCorrect: 9,
        totalResponseMs: 12000,
        bestStreak: 4,
        sessionsCompleted: 2,
        byPiece: {
          pawn: { attempts: 5, correct: 4, totalResponseMs: 5000 },
          knight: { attempts: 4, correct: 2, totalResponseMs: 4000 },
          rook: { attempts: 3, correct: 1, totalResponseMs: 3000 },
        },
        byContext: {},
      },
      {
        totalAttempts: 10,
        totalCorrect: 8,
        totalResponseMs: 10000,
        bestStreak: 6,
        sessionsCompleted: 3,
        squareStats: {
          e4: { attempts: 4, correct: 4, totalResponseMs: 4000 },
          d5: { attempts: 3, correct: 2, totalResponseMs: 3000 },
          a1: { attempts: 3, correct: 1, totalResponseMs: 3000 },
        },
        dark: { attempts: 8, correct: 6, totalResponseMs: 8000 },
        light: { attempts: 2, correct: 2, totalResponseMs: 2000 },
      },
    )

    expect(summary.drillsCompleted).toBe(5)
    expect(summary.totalAttempts).toBe(22)
    expect(summary.overallAccuracy).toBe(77)
    expect(summary.averageResponseMs).toBe(1000)
    expect(summary.bestStreak).toBe(6)
    expect(summary.pieceBestStreak).toBe(4)
    expect(summary.coordinateBestStreak).toBe(6)
    expect(summary.xp).toBe(3250)
    expect(summary.level).toBe(4)
    expect(summary.league).toBe('Gold')
    expect(summary.piecesMastered).toBe(1)
    expect(summary.squaresMastered).toBe(1)
    expect(summary.strongestPiece).toBe('Pawn')
    expect(summary.weakestPiece).toBe('Rook')
    expect(summary.strongestSquare).toBe('e4')
    expect(summary.weakestSquare).toBe('a1')
    expect(summary.darkAccuracy).toBe(75)
    expect(summary.lightAccuracy).toBe(100)
    expect(summary.pieceRows).toEqual([
      { label: 'Pawn', attempts: 5, accuracy: 80 },
      { label: 'Knight', attempts: 4, accuracy: 50 },
      { label: 'Rook', attempts: 3, accuracy: 33 },
    ])
  })

  it('respects mastery thresholds and tie-breaks on stronger sample sizes', () => {
    const summary = deriveProfileSummary(
      {
        totalAttempts: 18,
        totalCorrect: 15,
        totalResponseMs: 18000,
        bestStreak: 5,
        sessionsCompleted: 1,
        byPiece: {
          rook: { attempts: 6, correct: 6, totalResponseMs: 6000 },
          queen: { attempts: 3, correct: 3, totalResponseMs: 3000 },
          bishop: { attempts: 5, correct: 3, totalResponseMs: 5000 },
          pawn: { attempts: 5, correct: 4, totalResponseMs: 4000 },
          knight: { attempts: 2, correct: 2, totalResponseMs: 2000 },
        },
        byContext: {},
      },
      {
        totalAttempts: 4,
        totalCorrect: 3,
        totalResponseMs: 4000,
        bestStreak: 2,
        sessionsCompleted: 0,
        squareStats: {
          e4: { attempts: 4, correct: 4, totalResponseMs: 4000 },
          d5: { attempts: 3, correct: 3, totalResponseMs: 3000 },
          a1: { attempts: 3, correct: 1, totalResponseMs: 3000 },
          h8: { attempts: 2, correct: 2, totalResponseMs: 2000 },
        },
        dark: { attempts: 3, correct: 2, totalResponseMs: 3000 },
        light: { attempts: 1, correct: 1, totalResponseMs: 1000 },
      },
    )

    expect(summary.league).toBe('Gold')
    expect(summary.piecesMastered).toBe(2)
    expect(summary.squaresMastered).toBe(1)
    expect(summary.strongestPiece).toBe('Rook')
    expect(summary.weakestPiece).toBe('Bishop')
    expect(summary.strongestSquare).toBe('e4')
    expect(summary.weakestSquare).toBe('a1')
    expect(summary.pieceRows).toEqual([
      { label: 'Rook', attempts: 6, accuracy: 100 },
      { label: 'Pawn', attempts: 5, accuracy: 80 },
      { label: 'Bishop', attempts: 5, accuracy: 60 },
      { label: 'Queen', attempts: 3, accuracy: 100 },
      { label: 'Knight', attempts: 2, accuracy: 100 },
    ])
  })

  it.each([
    ['Bronze', 19, 18],
    ['Bronze', 20, 11],
    ['Silver', 20, 12],
    ['Silver', 25, 17],
    ['Gold', 25, 18],
    ['Gold', 25, 20],
    ['Platinum', 25, 21],
    ['Platinum', 25, 22],
    ['Diamond', 25, 23],
  ])('assigns %s for %i attempts with %i correct answers', (league, totalAttempts, accuracy) => {
    const summary = deriveProfileSummary(
      {
        totalAttempts,
        totalCorrect: accuracy,
        totalResponseMs: totalAttempts * 1000,
        bestStreak: 0,
        sessionsCompleted: 0,
        byPiece: {},
        byContext: {},
      },
      {
        totalAttempts: 0,
        totalCorrect: 0,
        totalResponseMs: 0,
        bestStreak: 0,
        sessionsCompleted: 0,
        squareStats: {},
        dark: { attempts: 0, correct: 0, totalResponseMs: 0 },
        light: { attempts: 0, correct: 0, totalResponseMs: 0 },
      },
    )

    expect(summary.league).toBe(league)
  })

  it('falls back cleanly when there is no data', () => {
    const summary = deriveProfileSummary()

    expect(summary).toMatchObject({
      drillsCompleted: 0,
      totalAttempts: 0,
      overallAccuracy: 0,
      averageResponseMs: 0,
      bestStreak: 0,
      xp: 0,
      level: 1,
      league: 'Bronze',
      piecesMastered: 0,
      squaresMastered: 0,
      strongestSquare: 'Not enough data yet',
      strongestPiece: 'Not enough data yet',
      weakestPiece: 'Not enough data yet',
      weakestSquare: 'Not enough data yet',
      darkAccuracy: null,
      lightAccuracy: null,
    })
  })
})
