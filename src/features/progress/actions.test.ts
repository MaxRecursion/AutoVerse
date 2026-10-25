import { beforeEach, describe, expect, it } from 'vitest'
import { useProgress } from '@/stores/progress'
import { useToasts } from '@/stores/toasts'
import { completeLesson, reopenLesson } from './actions'

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
