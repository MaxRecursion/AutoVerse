import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import ExplorePage from '@/pages/ExplorePage'

// jsdom has no WebGL: the explorer shows its 2D side-view fallback, driven by the same store.
vi.mock('@/lib/webgl', () => ({ hasWebGL: () => false }))

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

function renderAt(path: string) {
  const router = createMemoryRouter([{ path: '/explore', element: <ExplorePage /> }], { initialEntries: [path] })
  render(
    <TooltipProvider>
      <RouterProvider router={router} />
    </TooltipProvider>,
  )
  return router
}

describe('ExplorePage', () => {
  it('opens on the whole car with every system listed and the fallback diagram', () => {
    renderAt('/explore')
    expect(screen.getByRole('heading', { level: 1, name: 'Explore the whole car' })).toBeInTheDocument()
    expect(screen.getByTestId('explorer-fallback')).toBeInTheDocument()
    const list = screen.getByRole('list', { name: 'Vehicle systems' })
    expect(within(list).getAllByRole('button')).toHaveLength(9)
    // Text alternative: every system in words.
    const text = screen.getByRole('region', { name: 'The car, system by system' })
    expect(within(text).getAllByRole('heading', { level: 3 })).toHaveLength(9)
  })

  it('resolves ?component=brake-disc to the brakes with the discs selected', () => {
    renderAt('/explore?component=brake-disc')
    expect(screen.getByRole('heading', { level: 2, name: 'Brakes' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Brake discs', pressed: true })).toBeInTheDocument()
    expect(screen.getByTestId('explorer-selected-component')).toHaveTextContent('Brake discs')
    // The lab and lesson links in the panel are real routes.
    const panel = within(screen.getByTestId('explorer-sheet'))
    expect(panel.getByRole('link', { name: /Disc Brake Laboratory/ })).toHaveAttribute('href', '/labs/braking')
    expect(panel.getByRole('link', { name: /Lesson/ })).toHaveAttribute('href', expect.stringMatching(/^\/topics\//))
    expect(panel.getByRole('link', { name: /How the systems connect/ })).toHaveAttribute('href', '/map')
  })

  it('keeps the URL in step with choices made in the panel', async () => {
    const router = renderAt('/explore?system=cooling')
    expect(screen.getByRole('heading', { level: 2, name: 'Cooling system' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Radiator' }))
    expect(router.state.location.search).toBe('?component=radiator')
    fireEvent.click(screen.getByRole('button', { name: /All systems/ }))
    expect(router.state.location.search).toBe('')
    fireEvent.click(within(screen.getByRole('list', { name: 'Vehicle systems' })).getByRole('button', { name: /Exhaust system/ }))
    expect(router.state.location.search).toBe('?system=exhaust')
    // Back / forward style navigation updates the panel too.
    await act(() => router.navigate('/explore?system=steering'))
    expect(screen.getByRole('heading', { level: 2, name: 'Steering' })).toBeInTheDocument()
  })

  it('shows the model attribution, including the modification notice, and the illustrative-values note', () => {
    renderAt('/explore')
    const credit = screen.getByTestId('model-attribution')
    expect(credit).toHaveTextContent('Car Concept')
    expect(credit).toHaveTextContent('CC BY 4.0')
    expect(credit).toHaveTextContent('Modified for AutoVerse')
    expect(within(credit).getByRole('link', { name: 'CC BY 4.0' })).toHaveAttribute('href', 'https://creativecommons.org/licenses/by/4.0/')
    expect(screen.getAllByText(/illustrative/i).length).toBeGreaterThan(0)
  })

  it('switches view mode and toggles doors from the toolbar', () => {
    renderAt('/explore')
    const cutaway = screen.getByRole('radio', { name: /Cutaway/ })
    fireEvent.click(cutaway)
    expect(cutaway).toHaveAttribute('aria-checked', 'true')
    const doors = screen.getByRole('button', { name: 'Open doors and clamshells' })
    expect(doors).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(doors)
    expect(doors).toHaveAttribute('aria-pressed', 'true')
  })
})
