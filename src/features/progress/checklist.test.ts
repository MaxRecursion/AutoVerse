import { describe, expect, it } from 'vitest'
import { gettingStartedDone, gettingStartedSteps, type GettingStartedEvidence } from './checklist'

const NOTHING: GettingStartedEvidence = { tourStatus: 'new', recent: [], lessons: {}, quizScores: {}, completed: {}, certificates: {} }
const done = (e: Partial<GettingStartedEvidence>) => gettingStartedSteps({ ...NOTHING, ...e }).filter((s) => s.done).map((s) => s.id)

describe('gettingStartedSteps', () => {
  it('lists six steps in order, none done for a new visitor', () => {
    const steps = gettingStartedSteps(NOTHING)
    expect(steps.map((s) => s.id)).toEqual(['tour', 'lesson', 'lab', 'quiz', 'finish', 'certificate'])
    expect(gettingStartedDone(steps)).toBe(0)
  })

  it('counts the tour only when it was taken, not when it was skipped or declined', () => {
    expect(done({ tourStatus: 'completed' })).toEqual(['tour'])
    expect(done({ tourStatus: 'skipped' })).toEqual([])
    expect(done({ tourStatus: 'declined' })).toEqual([])
  })

  it('counts a lab only when the learner did something in it', () => {
    expect(done({ lessons: { a: { steps: ['s1'], overview: true } } })).toEqual([])
    expect(done({ lessons: { a: { steps: [] }, b: { steps: [], lab: true } } })).toEqual(['lab'])
  })

  it('reads lessons, quizzes, finished lessons and certificates from the record', () => {
    expect(
      done({
        recent: [{ topicId: 'a', at: 'x' }],
        quizScores: { a: { score: 1, total: 2, at: 'x' } },
        completed: { a: 'x' },
        certificates: { c: { earnedAt: 'x' } },
      }),
    ).toEqual(['lesson', 'quiz', 'finish', 'certificate'])
  })
})
