import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePreferences } from '@/stores/preferences'
import { useProgress } from '@/stores/progress'
import { TOUR_LENGTH, TOUR_STEPS } from './steps'
import { TourHost } from './TourHost'
import { useTour } from './tourStore'

const rect = (top: number, left: number, width: number, height: number) =>
  ({ top, left, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {} }) as DOMRect

/** A page with a header-ish anchor inside #root, and the tour host outside it, as in the app. */
function setup(initial = '/') {
  const root = document.body.appendChild(Object.assign(document.createElement('div'), { id: 'root' }))
  const router = createMemoryRouter(
    [
      {
        path: '*',
        element: (
          <>
            <button data-tour="nav">Nav</button>
            <button data-tour="progress-pill">Pill</button>
            <TourHost />
          </>
        ),
      },
    ],
    { initialEntries: [initial] },
  )
  const view = render(<RouterProvider router={router} />, { container: root })
  for (const el of root.querySelectorAll<HTMLElement>('[data-tour]')) el.getBoundingClientRect = () => rect(100, 200, 90, 40)
  return { router, root, ...view }
}

const goTo = (id: string) => act(() => useTour.setState({ active: true, index: TOUR_STEPS.findIndex((s) => s.id === id) }))

describe('TourHost', () => {
  beforeEach(() => {
    useTour.setState({ active: false, index: 0, origin: null })
    usePreferences.setState({ tourStatus: 'new' })
    useProgress.getState().clearAll()
  })
  afterEach(() => {
    cleanup()
    document.getElementById('root')?.remove()
    vi.restoreAllMocks()
  })

  it('renders nothing until the tour is started', () => {
    setup()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens as a labelled modal dialog, makes the page inert and puts focus on the step heading', () => {
    const { root } = setup()
    act(() => useTour.getState().start('/'))
    const dialog = screen.getByRole('dialog', { name: 'Welcome to AutoVerse' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleDescription(/60-second tour/)
    expect(root).toHaveAttribute('inert')
    expect(screen.getByRole('heading', { name: 'Welcome to AutoVerse' })).toHaveFocus()
    expect(screen.getByText(/Welcome · 1 of /)).toBeInTheDocument()
  })

  it('spotlights the step target and puts the card next to it', async () => {
    setup()
    goTo('progress-pill')
    const spot = await screen.findByTestId('tour-spotlight')
    // Target box (100, 200, 90×40) plus 8px padding on each side.
    expect(spot).toHaveStyle({ top: '92px', left: '192px', width: '106px', height: '56px' })
    expect(screen.getByRole('dialog', { name: 'Always know what is next' })).toHaveAttribute('data-placement', 'bottom')
  })

  it('shows a centred card with no spotlight on steps that have no target', () => {
    setup()
    act(() => useTour.getState().start('/'))
    expect(screen.queryByTestId('tour-spotlight')).not.toBeInTheDocument()
    expect(screen.getByRole('dialog')).toHaveAttribute('data-placement', 'center')
  })

  it('says it is getting ready while a target has not appeared, then falls back to a centred card', async () => {
    setup()
    let clock = 0
    vi.spyOn(performance, 'now').mockImplementation(() => (clock += 6000))
    goTo('stages') // route /topics/four-stroke-cycle, anchor not present in this test page
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveAttribute('data-placement', 'center'), { timeout: 3000 })
    expect(screen.queryByTestId('tour-spotlight')).not.toBeInTheDocument()
  })

  it('moves with the arrow keys and the buttons, and Back is disabled on the first step', async () => {
    const user = userEvent.setup()
    setup()
    act(() => useTour.getState().start('/'))
    expect(screen.getByRole('button', { name: /back/i })).toBeDisabled()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('dialog', { name: 'Five doors, in order' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^next/i }))
    expect(screen.getByRole('dialog', { name: 'Always know what is next' })).toBeInTheDocument()
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('dialog', { name: 'Five doors, in order' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Five doors, in order' })).toHaveFocus()
  })

  it('Esc closes, remembers it was skipped, restores the page and puts the learner back where they were', async () => {
    const user = userEvent.setup()
    const { router, root } = setup('/learn')
    act(() => useTour.getState().start('/learn'))
    await user.keyboard('{ArrowRight}')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(root).not.toHaveAttribute('inert')
    expect(usePreferences.getState().tourStatus).toBe('skipped')
    await waitFor(() => expect(router.state.location.pathname).toBe('/learn'))
  })

  it('takes the learner to the page a step is about, and back to where they started on close', async () => {
    const user = userEvent.setup()
    const { router } = setup('/progress')
    act(() => useTour.getState().start('/progress'))
    goTo('stages')
    await waitFor(() => expect(router.state.location.pathname).toBe('/topics/four-stroke-cycle'))
    await user.click(screen.getByRole('button', { name: 'Close the tour' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/progress'))
  })

  it('stops quietly, without recording a decision, if the learner leaves the page by themselves', async () => {
    const { router } = setup('/')
    goTo('stages')
    await waitFor(() => expect(router.state.location.pathname).toBe('/topics/four-stroke-cycle'))
    await act(() => router.navigate('/learn'))
    await waitFor(() => expect(useTour.getState().active).toBe(false))
    expect(usePreferences.getState().tourStatus).toBe('new')
    expect(router.state.location.pathname).toBe('/learn')
  })

  it('ends on a card that offers to start learning, and finishing records the tour as completed', async () => {
    const user = userEvent.setup()
    const { router } = setup('/')
    act(() => useTour.setState({ active: true, index: TOUR_LENGTH - 1, origin: '/' }))
    expect(screen.queryByRole('button', { name: /skip tour/i })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /start learning/i }))
    expect(usePreferences.getState().tourStatus).toBe('completed')
    await waitFor(() => expect(router.state.location.pathname).toBe('/topics/how-a-car-works'))
  })

  it('keeps Tab inside the card', async () => {
    const user = userEvent.setup()
    setup()
    act(() => useTour.getState().start('/'))
    const buttons = within(screen.getByRole('dialog')).getAllByRole('button')
    buttons.at(-1)!.focus()
    await user.tab()
    expect(buttons[0]).toHaveFocus()
    await user.tab({ shift: true })
    expect(buttons.at(-1)).toHaveFocus()
  })
})
