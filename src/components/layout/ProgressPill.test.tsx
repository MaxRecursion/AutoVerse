import { act, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { topics } from '@/lib/content'
import { useProgress } from '@/stores/progress'
import { ProgressPill } from './ProgressPill'

const renderPill = () => render(<MemoryRouter><ProgressPill /></MemoryRouter>)

describe('ProgressPill', () => {
  beforeEach(() => useProgress.getState().clearAll())

  it('points a brand-new learner at the first lesson', () => {
    renderPill()
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/topics/how-a-car-works')
    expect(link).toHaveAccessibleName(`Start here: How a Car Works: The Big Picture. 0 of ${topics.length} lessons complete.`)
  })

  it('offers to continue a lesson that was opened but not finished', () => {
    useProgress.getState().visit('four-stroke-cycle')
    renderPill()
    expect(screen.getByRole('link')).toHaveAccessibleName(/^Continue: The Four-Stroke Cycle/)
    expect(screen.getByRole('link')).toHaveAttribute('href', '/topics/four-stroke-cycle')
  })

  it('updates as lessons are completed, without a reload', () => {
    renderPill()
    act(() => useProgress.getState().setCompleted('how-a-car-works', true))
    expect(screen.getByRole('link')).toHaveAccessibleName(new RegExp(`1 of ${topics.length} lessons complete`))
    expect(screen.getByRole('link')).not.toHaveAttribute('href', '/topics/how-a-car-works')
  })

  it('sends a learner who has finished everything to their progress page', () => {
    act(() => {
      for (const t of topics) useProgress.getState().setCompleted(t.id, true)
    })
    renderPill()
    expect(screen.getByRole('link')).toHaveAttribute('href', '/progress')
    expect(screen.getByRole('link')).toHaveAccessibleName(/All lessons done/)
  })
})
