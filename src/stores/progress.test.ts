import { beforeEach, describe, expect, it } from 'vitest'
import { progressSnapshot, useProgress } from './progress'

beforeEach(() => useProgress.getState().clearAll())

describe('flashcard practice record', () => {
  it('stores the last answer per term, with when it was given', () => {
    useProgress.getState().reviewTerm('torque', false)
    expect(useProgress.getState().practice.torque).toMatchObject({ known: false })
    useProgress.getState().reviewTerm('torque', true)
    const { known, reviewedAt } = useProgress.getState().practice.torque!
    expect(known).toBe(true)
    expect(Number.isNaN(Date.parse(reviewedAt))).toBe(false)
  })

  it('is cleared with everything else, and put back by Undo', () => {
    useProgress.getState().reviewTerm('torque', true)
    const before = progressSnapshot()
    useProgress.getState().clearAll()
    expect(useProgress.getState().practice).toEqual({})
    useProgress.getState().restore(before)
    expect(useProgress.getState().practice.torque?.known).toBe(true)
  })

  it('loads progress saved before practice existed, with an empty record', async () => {
    localStorage.setItem('autoverse.progress', JSON.stringify({ state: { recent: [], completed: { a: '2026-10-01T00:00:00.000Z' }, bookmarks: [], quizScores: {}, lessons: {}, missions: {}, certificates: {} }, version: 1 }))
    await useProgress.persist.rehydrate()
    expect(useProgress.getState().completed).toEqual({ a: '2026-10-01T00:00:00.000Z' })
    expect(useProgress.getState().practice).toEqual({})
    localStorage.clear()
  })
})
