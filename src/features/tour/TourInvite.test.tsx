import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePreferences } from '@/stores/preferences'
import { useProgress } from '@/stores/progress'
import { TourInvite } from './TourInvite'
import { useTour } from './tourStore'

const renderAt = (path = '/') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <TourInvite />
    </MemoryRouter>,
  )
const wait = () => act(() => void vi.advanceTimersByTime(2600))

describe('TourInvite', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    useTour.setState({ active: false, index: 0, origin: null })
    usePreferences.setState({ tourStatus: 'new' })
    useProgress.getState().clearAll()
  })
  afterEach(() => vi.useRealTimers())

  it('waits a moment, then offers the tour to a brand-new visitor on the home page', () => {
    renderAt()
    expect(screen.queryByRole('region', { name: 'Product tour invitation' })).not.toBeInTheDocument()
    wait()
    expect(screen.getByRole('region', { name: 'Product tour invitation' })).toBeInTheDocument()
  })

  it('does not steal focus', () => {
    renderAt()
    wait()
    expect(document.body).toHaveFocus()
  })

  it('stays away once the learner has any progress', () => {
    useProgress.getState().visit('how-a-car-works')
    renderAt()
    wait()
    expect(screen.queryByRole('region', { name: 'Product tour invitation' })).not.toBeInTheDocument()
  })

  it('stays away on other pages', () => {
    renderAt('/learn')
    wait()
    expect(screen.queryByRole('region', { name: 'Product tour invitation' })).not.toBeInTheDocument()
  })

  it('never returns once answered', () => {
    usePreferences.setState({ tourStatus: 'declined' })
    renderAt()
    wait()
    expect(screen.queryByRole('region', { name: 'Product tour invitation' })).not.toBeInTheDocument()
  })

  it('"No thanks" is remembered', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderAt()
    wait()
    await user.click(screen.getByRole('button', { name: 'No thanks' }))
    expect(usePreferences.getState().tourStatus).toBe('declined')
    expect(screen.queryByRole('region', { name: 'Product tour invitation' })).not.toBeInTheDocument()
  })

  it('"Show me around" starts the tour from the current page', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderAt()
    wait()
    await user.click(screen.getByRole('button', { name: 'Show me around' }))
    expect(useTour.getState()).toMatchObject({ active: true, index: 0, origin: '/' })
    expect(screen.queryByRole('region', { name: 'Product tour invitation' })).not.toBeInTheDocument()
  })
})
