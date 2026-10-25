import { beforeEach, describe, expect, it } from 'vitest'
import { LearningPathSchema, TopicSchema, type Topic } from '@/lib/schemas'
import { useProgress } from '@/stores/progress'
import { resolvePathProgress } from './paths'
import { formatRelativeTime } from './time'

const state = () => useProgress.getState()

describe('progress store', () => {
  beforeEach(() => state().clearAll())

  it('records visits most-recent-first without duplicates', () => {
    state().visit('a')
    state().visit('b')
    state().visit('a')
    expect(state().recent.map((r) => r.topicId)).toEqual(['a', 'b'])
  })

  it('caps the recently-viewed list', () => {
    for (let i = 0; i < 20; i++) state().visit(`topic-${i}`)
    expect(state().recent).toHaveLength(12)
    expect(state().recent[0]?.topicId).toBe('topic-19')
  })

  it('toggles bookmarks', () => {
    state().toggleBookmark('a')
    state().toggleBookmark('b')
    expect(state().bookmarks).toEqual(['b', 'a'])
    state().toggleBookmark('a')
    expect(state().bookmarks).toEqual(['b'])
  })

  it('marks and unmarks completion', () => {
    state().setCompleted('a', true)
    expect(state().completed.a).toBeTruthy()
    state().setCompleted('a', false)
    expect(state().completed).toEqual({})
  })

  it('keeps the best quiz score', () => {
    state().recordQuiz('a', 2, 5)
    state().recordQuiz('a', 4, 5)
    state().recordQuiz('a', 3, 5)
    expect(state().quizScores.a).toMatchObject({ score: 4, total: 5 })
  })

  it('clears everything', () => {
    state().visit('a')
    state().toggleBookmark('a')
    state().setCompleted('a', true)
    state().recordQuiz('a', 1, 2)
    state().clearAll()
    expect(state()).toMatchObject({ recent: [], bookmarks: [], completed: {}, quizScores: {} })
  })

  it('persists to localStorage only', () => {
    state().toggleBookmark('persisted')
    expect(localStorage.getItem('autoverse.progress')).toContain('persisted')
  })
})

describe('learning path progress', () => {
  const mk = (id: string): Topic =>
    TopicSchema.parse({
      id,
      slug: id,
      title: id,
      summary: 's',
      categoryId: 'engine',
      difficulty: 'beginner',
      estimatedDuration: 3,
      beginnerExplanation: 'b',
      technicalExplanation: 't',
      licence: { name: 'AutoVerse original content' },
      contentStatus: 'complete',
    })
  const existing = new Map(['one', 'two', 'three'].map((id) => [id, mk(id)]))
  const path = LearningPathSchema.parse({
    id: 'p',
    title: 'Path',
    summary: 'A path',
    level: 'beginner',
    topicIds: ['one', 'not-written-yet', 'two', 'three', 'two'],
  })

  it('skips ids that do not exist yet and de-duplicates', () => {
    const p = resolvePathProgress(path, (id) => existing.get(id), {})
    expect(p.topics.map((t) => t.id)).toEqual(['one', 'two', 'three'])
    expect(p.missing).toBe(1)
    expect(p).toMatchObject({ completed: 0, total: 3, percent: 0 })
    expect(p.next?.id).toBe('one')
  })

  it('counts completed topics and finds the next one', () => {
    const p = resolvePathProgress(path, (id) => existing.get(id), { one: '2026-01-01', three: '2026-01-02' })
    expect(p).toMatchObject({ completed: 2, total: 3, percent: 67 })
    expect(p.next?.id).toBe('two')
  })

  it('handles a path with nothing written yet', () => {
    const p = resolvePathProgress(path, () => undefined, {})
    expect(p).toMatchObject({ total: 0, percent: 0, missing: 4 })
    expect(p.next).toBeUndefined()
  })
})

describe('formatRelativeTime', () => {
  const now = Date.parse('2026-05-10T12:00:00Z')
  it('formats recent and older timestamps', () => {
    expect(formatRelativeTime('2026-05-10T11:59:50Z', now)).toBe('just now')
    expect(formatRelativeTime('2026-05-08T12:00:00Z', now)).toMatch(/2 days ago/)
    expect(formatRelativeTime('nonsense', now)).toBe('')
  })
})
