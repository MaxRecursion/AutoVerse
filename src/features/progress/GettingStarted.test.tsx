import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { useTour } from '@/features/tour/tourStore'
import { usePreferences } from '@/stores/preferences'
import { useProgress } from '@/stores/progress'
import { GettingStarted } from './GettingStarted'

function setup(variant: 'home' | 'page') {
  return render(
    <MemoryRouter>
      <GettingStarted variant={variant} />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useProgress.getState().clearAll()
  usePreferences.setState({ tourStatus: 'new', checklistDismissed: false })
  useTour.setState({ active: false, index: 0, origin: null })
})

describe('GettingStarted', () => {
  it('starts a new visitor at 0 of 6, open, with a way into each open step', () => {
    setup('home')
    expect(screen.getByRole('button', { name: /^Getting started/ })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('0 of 6 done')).toBeInTheDocument()
    const steps = within(screen.getByRole('list'))
    expect(steps.getAllByRole('listitem')).toHaveLength(6)
    expect(steps.getByRole('button', { name: /Show me around/ })).toBeInTheDocument()
    expect(steps.getAllByRole('link').length).toBeGreaterThanOrEqual(4)
  })

  it('starts the tour from its step', async () => {
    setup('home')
    await userEvent.click(screen.getByRole('button', { name: /Show me around/ }))
    expect(useTour.getState().active).toBe(true)
  })

  it('ticks a step only from the learner’s own record', () => {
    useProgress.setState({ recent: [{ topicId: 'how-a-car-works', at: '2026-10-26T10:00:00.000Z' }], quizScores: { x: { score: 2, total: 3, at: '2026-10-26T10:00:00.000Z' } } })
    usePreferences.setState({ tourStatus: 'skipped' })
    setup('home')
    expect(screen.getByText('2 of 6 done')).toBeInTheDocument()
    const lesson = screen.getByText('Open a lesson').closest('li')!
    expect(lesson).toHaveTextContent('(done)')
    // A skipped tour is not a taken tour.
    expect(screen.getByText('Take the tour').closest('li')).not.toHaveTextContent('(done)')
  })

  it('can be hidden on the home page, and stays hidden', async () => {
    const { unmount } = setup('home')
    await userEvent.click(screen.getByRole('button', { name: 'Hide Getting started' }))
    expect(screen.queryByTestId('getting-started')).not.toBeInTheDocument()
    expect(usePreferences.getState().checklistDismissed).toBe(true)
    unmount()
    setup('home')
    expect(screen.queryByTestId('getting-started')).not.toBeInTheDocument()
  })

  it('folds away and opens again', async () => {
    setup('home')
    const header = screen.getByRole('button', { name: /^Getting started/ })
    await userEvent.click(header)
    expect(header).toHaveAttribute('aria-expanded', 'false')
    // The list leaves once its closing animation has finished.
    await waitFor(() => expect(screen.queryByRole('list')).not.toBeInTheDocument())
    await userEvent.click(header)
    expect(screen.getByRole('list')).toBeInTheDocument()
  })

  it('goes away on the home page once everything is done, but stays (folded) on the progress page', () => {
    usePreferences.setState({ tourStatus: 'completed' })
    useProgress.setState({
      recent: [{ topicId: 'a', at: 'x' }],
      lessons: { a: { steps: [], lab: true } },
      quizScores: { a: { score: 1, total: 1, at: 'x' } },
      completed: { a: 'x' },
      certificates: { c: { earnedAt: 'x' } },
    })
    const home = setup('home')
    expect(screen.queryByTestId('getting-started')).not.toBeInTheDocument()
    home.unmount()
    setup('page')
    expect(screen.getByText('6 of 6 done')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Getting started/ })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: 'Hide Getting started' })).not.toBeInTheDocument()
  })
})
