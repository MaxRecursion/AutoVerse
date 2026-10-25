import { describe, expect, it } from 'vitest'
import { topics as realTopics, learningPaths as realPaths } from '@/lib/content'
import type { LearningPath, Topic } from '@/lib/schemas'
import { buildLadder, ladderOrder, layerOf, layerProgress, overallProgress, resolveNextUp, type NextUpContext } from './curriculum'

const mk = (id: string, o: Partial<Topic> = {}): Topic =>
  ({
    id,
    slug: id,
    title: id,
    summary: id,
    categoryId: 'engine',
    difficulty: 'beginner',
    layer: 'surface',
    estimatedDuration: 10,
    tags: [],
    learningObjectives: [],
    beginnerExplanation: 'b',
    technicalExplanation: 't',
    steps: [],
    componentIds: [],
    keyConcepts: [],
    misconceptions: [],
    practicalExamples: [],
    relatedTopicIds: [],
    prerequisiteTopicIds: [],
    quiz: [],
    sourceReferences: [],
    licence: { name: 'x' },
    contentStatus: 'complete',
    ...o,
  }) as Topic

const a = mk('a')
const b = mk('b', { layer: 'mechanism', difficulty: 'intermediate' })
const c = mk('c', { layer: 'engineering', difficulty: 'intermediate' })
const x = mk('x', { categoryId: 'brakes' })
const topics = [a, b, c, x]
const path: LearningPath = { id: 'p', title: 'Path P', summary: 's', level: 'beginner', order: 0, topicIds: ['a', 'b', 'c'] }
const getTopic = (id: string) => topics.find((t) => t.id === id)

const ctx = (o: Partial<NextUpContext> = {}): NextUpContext => ({ topics, paths: [path], completed: {}, recent: [], getTopic, ...o })
const done = (...ids: string[]) => Object.fromEntries(ids.map((i) => [i, 'now']))

describe('layers & ladder', () => {
  it('falls back to difficulty when a lesson has no layer', () => {
    expect(layerOf({ difficulty: 'beginner' })).toBe('surface')
    expect(layerOf({ difficulty: 'intermediate' })).toBe('mechanism')
    expect(layerOf({ difficulty: 'advanced' })).toBe('engineering')
    expect(layerOf({ layer: 'engineering', difficulty: 'beginner' })).toBe('engineering')
  })

  it('orders surface → mechanism → engineering and builds rungs with their own progress', () => {
    expect(ladderOrder([c, a, b]).map((t) => t.id)).toEqual(['a', 'b', 'c'])
    const ladder = buildLadder([a, b, c], done('a'))
    expect(ladder.map((r) => [r.layer.id, r.completed, r.next?.id])).toEqual([
      ['surface', 1, undefined],
      ['mechanism', 0, 'b'],
      ['engineering', 0, 'c'],
    ])
  })

  it('skips empty rungs', () => {
    expect(buildLadder([a], {}).map((r) => r.layer.id)).toEqual(['surface'])
  })

  it('reports per-layer and overall completion', () => {
    const lp = layerProgress(topics, done('a', 'b'))
    expect(lp.map((l) => [l.layer.id, l.completed, l.total])).toEqual([['surface', 1, 2], ['mechanism', 1, 1], ['engineering', 0, 1]])
    expect(overallProgress(topics, done('a'))).toEqual({ completed: 1, total: 4, percent: 25 })
  })
})

describe('resolveNextUp (global)', () => {
  it('sends a brand-new learner to the first step of the beginner path', () => {
    const n = resolveNextUp(ctx())
    expect([n.kind, n.topic?.id, n.label]).toEqual(['start', 'a', 'Start here'])
  })

  it('continues the most recent unfinished lesson', () => {
    const n = resolveNextUp(ctx({ recent: [{ topicId: 'b' }, { topicId: 'a' }], completed: done('a') }))
    expect([n.kind, n.topic?.id]).toEqual(['continue', 'b'])
  })

  it('moves to the next unfinished path step when nothing is open', () => {
    const n = resolveNextUp(ctx({ completed: done('a'), recent: [{ topicId: 'a' }] }))
    expect([n.kind, n.topic?.id]).toEqual(['next', 'b'])
  })

  it('reports done when every route is complete', () => {
    const n = resolveNextUp(ctx({ completed: done('a', 'b', 'c'), recent: [{ topicId: 'c' }] }))
    expect(n.kind).toBe('done')
  })
})

describe('resolveNextUp (within a lesson)', () => {
  it('names the step after the current one — not the first unfinished step', () => {
    // Regression: on step 2 with step 1 undone, "next" used to be step 1.
    const n = resolveNextUp(ctx({ currentTopicId: 'b' }))
    expect(n.kind).toBe('next')
    expect(n.topic?.id).toBe('c')
    expect(n.skipped.map((t) => t.id)).toEqual(['a'])
    expect(n.label).toBe('After this lesson')
  })

  it('uses "Next lesson" once the current lesson is complete', () => {
    const n = resolveNextUp(ctx({ currentTopicId: 'a', completed: done('a') }))
    expect([n.topic?.id, n.label]).toEqual(['b', 'Next lesson'])
  })

  it('offers skipped steps only after everything ahead is finished', () => {
    const n = resolveNextUp(ctx({ currentTopicId: 'c', completed: done('b') }))
    expect([n.kind, n.topic?.id]).toEqual(['revisit', 'a'])
  })

  it('reports prerequisites that are not done', () => {
    const withPre = mk('d', { prerequisiteTopicIds: ['a'], layer: 'mechanism' })
    const t = [...topics, withPre]
    const n = resolveNextUp({ ...ctx({ currentTopicId: 'd' }), topics: t, getTopic: (id) => t.find((q) => q.id === id) })
    expect(n.unmetPrerequisites.map((p) => p.id)).toEqual(['a'])
  })

  it('falls back to the system ladder for lessons outside any path', () => {
    const brakes2 = mk('y', { categoryId: 'brakes', layer: 'mechanism', difficulty: 'intermediate' })
    const t = [...topics, brakes2]
    const n = resolveNextUp({ ...ctx({ currentTopicId: 'x' }), topics: t, getTopic: (id) => t.find((q) => q.id === id) })
    expect(n.route?.kind).toBe('system')
    expect(n.topic?.id).toBe('y')
  })

  it('hands over to the next unfinished path when this one is complete', () => {
    const p2: LearningPath = { id: 'p2', title: 'Path 2', summary: 's', level: 'beginner', order: 1, topicIds: ['x', 'a'] }
    const n = resolveNextUp({ ...ctx({ currentTopicId: 'c', completed: done('a', 'b') }), paths: [path, p2] })
    expect([n.kind, n.topic?.id]).toEqual(['new-route', 'x'])
  })
})

describe('real content', () => {
  it('assigns every lesson a layer', () => {
    expect(realTopics.filter((t) => !t.layer).map((t) => t.id)).toEqual([])
  })

  it('gives every lab-backed lesson a layer above surface or an explicit surface reason', () => {
    // Labs show mechanisms; a surface lab lesson is allowed (e.g. four-stroke-cycle) but must exist at most once per system.
    const bySystem = new Map<string, number>()
    for (const t of realTopics.filter((q) => q.labId && q.layer === 'surface')) bySystem.set(t.categoryId, (bySystem.get(t.categoryId) ?? 0) + 1)
    for (const n of bySystem.values()) expect(n).toBeLessThanOrEqual(1)
  })

  it('resolves a next action for every lesson without throwing, and never points at itself', () => {
    for (const t of realTopics) {
      const n = resolveNextUp({ topics: realTopics, paths: realPaths, completed: {}, recent: [], getTopic: (id) => realTopics.find((q) => q.id === id), currentTopicId: t.id })
      expect(n.topic?.id).not.toBe(t.id)
    }
  })
})
