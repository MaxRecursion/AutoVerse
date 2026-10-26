import { beforeEach, describe, expect, it } from 'vitest'
import { usePreferences } from '@/stores/preferences'
import { useProgress } from '@/stores/progress'
import { TOUR_LENGTH } from './steps'
import { useTour } from './tourStore'

describe('tour store', () => {
  beforeEach(() => {
    useTour.setState({ active: false, index: 0, origin: null })
    usePreferences.setState({ tourStatus: 'new' })
  })

  it('starts at the first step and remembers where the learner was', () => {
    useTour.getState().start('/learn/engine?x=1')
    expect(useTour.getState()).toMatchObject({ active: true, index: 0, origin: '/learn/engine?x=1' })
  })

  it('never moves past either end', () => {
    useTour.getState().start()
    useTour.getState().back()
    expect(useTour.getState().index).toBe(0)
    for (let i = 0; i < TOUR_LENGTH + 5; i++) useTour.getState().next()
    expect(useTour.getState().index).toBe(TOUR_LENGTH - 1)
  })

  it('remembers finishing or skipping, so the invitation is not shown again', () => {
    useTour.getState().start()
    useTour.getState().stop('skipped')
    expect(usePreferences.getState().tourStatus).toBe('skipped')
    expect(useTour.getState().active).toBe(false)

    useTour.getState().start()
    useTour.getState().stop('completed')
    expect(usePreferences.getState().tourStatus).toBe('completed')
  })

  it('leaves the status alone when the tour is interrupted by the learner navigating away', () => {
    useTour.getState().start()
    useTour.getState().stop('interrupted')
    expect(usePreferences.getState().tourStatus).toBe('new')
    expect(useTour.getState().active).toBe(false)
  })

  it('ignores stop when no tour is running (no stray status writes)', () => {
    useTour.getState().stop('completed')
    expect(usePreferences.getState().tourStatus).toBe('new')
  })

  it('suspends passive progress while open, so the tour leaves no trace, and resumes afterwards', () => {
    useProgress.getState().clearAll()
    useTour.getState().start()
    const p = useProgress.getState()
    p.visit('four-stroke-cycle')
    p.signal('four-stroke-cycle', 'overview')
    p.seeStep('four-stroke-cycle', 'intake')
    p.completeMission('engine', 'watch-cycle')
    expect(useProgress.getState()).toMatchObject({ recent: [], lessons: {}, missions: {} })

    useTour.getState().stop('skipped')
    useProgress.getState().visit('four-stroke-cycle')
    expect(useProgress.getState().recent.map((r) => r.topicId)).toEqual(['four-stroke-cycle'])
  })

  it('also resumes after an interrupted tour', () => {
    useProgress.getState().clearAll()
    useTour.getState().start()
    useTour.getState().stop('interrupted')
    useProgress.getState().signal('four-stroke-cycle', 'overview')
    expect(useProgress.getState().lessons['four-stroke-cycle']?.overview).toBe(true)
  })

  it('restarts from the beginning', () => {
    useTour.getState().start()
    useTour.getState().next()
    useTour.getState().stop('skipped')
    useTour.getState().start()
    expect(useTour.getState().index).toBe(0)
  })
})
