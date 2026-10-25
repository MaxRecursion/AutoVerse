import { describe, expect, it } from 'vitest'
import { lessonStages, summariseStages, type LessonFacts } from './stages'

const facts: LessonFacts = { hasLab: true, stepIds: ['a', 'b'], hasFlow: true, hasDeeper: true, hasQuiz: true, hasStory: true }
const ids = (f: LessonFacts, s?: Parameters<typeof lessonStages>[1], q = false) => lessonStages(f, s, q).map((x) => `${x.id}:${x.done ? 'done' : 'todo'}`)

describe('lessonStages', () => {
  it('starts with nothing done and lists every stage the lesson has', () => {
    expect(ids(facts)).toEqual(['overview:todo', 'see:todo', 'deeper:todo', 'check:todo', 'story:todo'])
  })

  it('needs every step AND lab activity for "See it work"', () => {
    expect(ids(facts, { steps: ['a', 'b'] })[1]).toBe('see:todo')
    expect(ids(facts, { steps: ['a'], lab: true })[1]).toBe('see:todo')
    expect(ids(facts, { steps: ['a', 'b'], lab: true })[1]).toBe('see:done')
  })

  it('says exactly what is left', () => {
    const see = lessonStages(facts, { steps: ['a'] }, false)[1]!
    expect(see.detail).toBe('1 step left to read; try the lab (play, scrub or select a part)')
  })

  it('uses the lab only when there are no steps, and the diagram only when there is neither', () => {
    const labOnly = { ...facts, stepIds: [] }
    expect(ids(labOnly, { steps: [], lab: true })[1]).toBe('see:done')
    const flowOnly = { ...facts, hasLab: false, stepIds: [] }
    expect(ids(flowOnly, { steps: [] })[1]).toBe('see:todo')
    expect(ids(flowOnly, { steps: [], flow: true })[1]).toBe('see:done')
  })

  it('omits stages a lesson does not have', () => {
    const bare: LessonFacts = { hasLab: false, stepIds: [], hasFlow: false, hasDeeper: false, hasQuiz: false, hasStory: false }
    expect(ids(bare)).toEqual(['overview:todo'])
  })

  it('completes Check from the quiz result', () => {
    expect(ids(facts, undefined, true)[3]).toBe('check:done')
  })
})

describe('summariseStages', () => {
  it('is ready when core stages are done, even if optional ones are not', () => {
    const stages = lessonStages(facts, { overview: true, steps: ['a', 'b'], lab: true }, true)
    const sum = summariseStages(stages)
    expect(sum).toMatchObject({ coreDone: 3, coreTotal: 3, ready: true, percent: 60 })
    expect(sum.next?.id).toBe('deeper')
  })

  it('points at the first unfinished core stage', () => {
    const sum = summariseStages(lessonStages(facts, { overview: true, steps: [] }, false))
    expect(sum.ready).toBe(false)
    expect(sum.next?.id).toBe('see')
  })
})
