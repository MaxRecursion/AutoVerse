import { beforeEach, describe, expect, it } from 'vitest'
import { usePreferences } from '@/stores/preferences'
import { useProgress } from '@/stores/progress'
import { useToasts } from '@/stores/toasts'
import { clearAllProgress, completeLesson, removeBookmark, reopenLesson, UNDO_MS } from './actions'

describe('completeLesson', () => {
  beforeEach(() => {
    useProgress.getState().clearAll()
    useToasts.getState().clear()
  })

  it('marks the lesson done and says what is next', () => {
    completeLesson('how-a-car-works')
    expect(useProgress.getState().completed['how-a-car-works']).toBeTruthy()
    const t = useToasts.getState().toasts.at(-1)!
    expect(t.title).toBe('Lesson complete: How a Car Works: The Big Picture')
    expect(t.description).toMatch(/^1 of \d+ lessons done\.$/)
    expect(t.action?.to).toMatch(/^\/topics\//)
    expect(t.action?.label).toMatch(/^(After this lesson|Next lesson|Skipped earlier|Start “.+”)/)
    expect(t.action?.to).not.toBe('/topics/how-a-car-works')
  })

  it('can be undone without a celebration', () => {
    completeLesson('how-a-car-works')
    useToasts.getState().clear()
    reopenLesson('how-a-car-works')
    expect(useProgress.getState().completed['how-a-car-works']).toBeUndefined()
    expect(useToasts.getState().toasts).toEqual([])
  })
})

describe('undoable removals', () => {
  beforeEach(() => {
    useProgress.getState().clearAll()
    useToasts.getState().clear()
  })
  const undo = () => useToasts.getState().toasts.at(-1)!.action!.onClick!()

  it('removes a bookmark at once and puts it back in the same place', () => {
    for (const id of ['tyres-and-grip', 'disc-brakes', 'clutch']) useProgress.getState().toggleBookmark(id)
    removeBookmark('disc-brakes')
    expect(useProgress.getState().bookmarks).toEqual(['clutch', 'tyres-and-grip'])
    const t = useToasts.getState().toasts.at(-1)!
    expect(t).toMatchObject({ title: 'Bookmark removed', description: 'Disc Brakes', duration: UNDO_MS.bookmark })
    undo()
    expect(useProgress.getState().bookmarks).toEqual(['clutch', 'disc-brakes', 'tyres-and-grip'])
  })

  it('clears everything at once and Undo restores it, certificate name included', () => {
    completeLesson('how-a-car-works')
    useProgress.getState().recordQuiz('how-a-car-works', 3, 4)
    usePreferences.getState().setLearnerName('Ada')
    const before = useProgress.getState()
    clearAllProgress()
    expect(useProgress.getState().completed).toEqual({})
    expect(usePreferences.getState().learnerName).toBe('')
    const t = useToasts.getState().toasts.at(-1)!
    expect(t.duration).toBeGreaterThanOrEqual(5000)
    expect(t.duration).toBeLessThanOrEqual(10_000)
    undo()
    expect(useProgress.getState().completed).toEqual(before.completed)
    expect(useProgress.getState().quizScores).toEqual(before.quizScores)
    expect(usePreferences.getState().learnerName).toBe('Ada')
  })
})
