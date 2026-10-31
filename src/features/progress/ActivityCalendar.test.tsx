import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useProgress } from '@/stores/progress'
import { ActivityCalendar } from './ActivityCalendar'

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).toISOString()

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 26, 15)) // Monday 26 October 2026
  useProgress.getState().clearAll()
})
afterEach(() => vi.useRealTimers())

describe('ActivityCalendar', () => {
  it('shows the current month with a day button for every day, and says what happened on busy days', () => {
    useProgress.setState({
      completed: { 'how-a-car-works': at(2026, 10, 25) },
      quizScores: { 'how-a-car-works': { score: 4, total: 5, at: at(2026, 10, 25) } },
    })
    render(<ActivityCalendar />)
    expect(screen.getByRole('heading', { name: 'October 2026' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^25 October: Finished How a Car Works: The Big Picture; Quiz: How a Car Works: The Big Picture, 4 of 5$/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '24 October: no activity' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '26 October: no activity' })).toHaveAttribute('aria-current', 'date')
  })

  it('counts the streak up to yesterday while today is still empty, and remembers the best run', () => {
    useProgress.setState({
      completed: { a: at(2026, 10, 23), b: at(2026, 10, 24), c: at(2026, 10, 25), d: at(2026, 10, 1), e: at(2026, 10, 2) },
    })
    render(<ActivityCalendar />)
    const stats = within(screen.getByText('Current streak').closest('dl')!)
    expect(stats.getByText('Current streak').nextSibling).toHaveTextContent('3 days')
    expect(stats.getByText('Best streak').nextSibling).toHaveTextContent('3 days')
  })

  it('shows the chosen day’s details', async () => {
    useProgress.setState({ practice: { torque: { known: true, reviewedAt: at(2026, 10, 20) }, slip: { known: false, reviewedAt: at(2026, 10, 20) } } })
    render(<ActivityCalendar />)
    expect(screen.getByText('Choose a day to see what you did.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^20 October/ }))
    expect(screen.getByText('Tuesday 20 October')).toBeInTheDocument()
    expect(screen.getByText('Practised 2 terms', { selector: 'li' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '21 October: no activity' }))
    expect(screen.getByText('Nothing recorded this day.')).toBeInTheDocument()
  })

  it('moves between months, and returns to this one', async () => {
    render(<ActivityCalendar />)
    await userEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(screen.getByRole('heading', { name: 'September 2026' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'This month' })).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: 'This month' }))
    expect(screen.getByRole('heading', { name: 'October 2026' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'This month' })).toBeDisabled()
  })
})
