import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'
import { pioneers } from '@/lib/content'
import PioneersPage from './PioneersPage'

function renderAt(url: string) {
  const router = createMemoryRouter([{ path: '/pioneers', element: <PioneersPage /> }], { initialEntries: [url] })
  render(<RouterProvider router={router} />)
  return router
}

describe('PioneersPage', () => {
  it('lists every engineer on a timeline grouped by era, oldest first', () => {
    renderAt('/pioneers')
    expect(screen.getByRole('heading', { level: 1, name: /engineers behind the parts/i })).toBeInTheDocument()
    const eras = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(eras).toEqual(['Before the car', 'The automobile arrives', 'Motoring for everyone', 'Modern engineering'])
    expect(screen.getAllByRole('article')).toHaveLength(pioneers.length)
  })

  it('keeps stories closed until asked, then shows the story, the caveat and the sources', async () => {
    const user = userEvent.setup()
    renderAt('/pioneers')
    const card = within(document.getElementById('pioneer-james-watt')!)
    // The story is in the page (for search engines and AI crawlers) but hidden until asked for.
    expect(card.getByText(/brewery horse/)).not.toBeVisible()
    await user.click(card.getByRole('button', { name: /read the story/i }))
    expect(card.getByText(/brewery horse/)).toBeVisible()
    expect(card.getByText(/Worth knowing/)).toBeInTheDocument()
    const source = card.getByRole('link', { name: /Horsepower/ })
    expect(source).toHaveAttribute('href', 'https://en.wikipedia.org/wiki/Horsepower')
    expect(source).toHaveAttribute('target', '_blank')
    expect(card.getByRole('link', { name: /Torque and Power/ })).toHaveAttribute('href', '/topics/torque-and-power')
  })

  it('filters by system and keeps the choice in the URL', async () => {
    const user = userEvent.setup()
    const router = renderAt('/pioneers')
    await user.click(screen.getByRole('button', { name: /^Brakes/ }))
    expect(router.state.location.search).toBe('?system=brakes')
    const shown = screen.getAllByRole('article').length
    expect(shown).toBe(pioneers.filter((p) => p.categoryId === 'brakes').length)
    expect(screen.getByRole('button', { name: /^Brakes/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('searches names and stories', async () => {
    const user = userEvent.setup()
    renderAt('/pioneers')
    await user.type(screen.getByRole('searchbox', { name: /search engineers/i }), 'Wankel')
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.getByRole('heading', { name: 'Felix Wankel' })).toBeInTheDocument()
    await user.clear(screen.getByRole('searchbox'))
    await user.type(screen.getByRole('searchbox'), 'zzzzqx')
    expect(screen.queryAllByRole('article')).toHaveLength(0)
    expect(screen.getByText(/No engineers match/)).toBeInTheDocument()
  })

  it('opens a deep-linked card (from search, a lesson or the part inspector)', () => {
    renderAt('/pioneers?focus=gottlob-honold')
    const card = within(document.getElementById('pioneer-gottlob-honold')!)
    expect(card.getByRole('button', { name: /hide the story/i })).toHaveAttribute('aria-expanded', 'true')
    expect(card.getByText(/non-moving electrodes/)).toBeInTheDocument()
  })

  it('opens and collapses everything at once', async () => {
    const user = userEvent.setup()
    renderAt('/pioneers')
    await user.click(screen.getByRole('button', { name: /open all stories/i }))
    expect(screen.getAllByRole('button', { name: /hide the story/i })).toHaveLength(pioneers.length)
    await user.click(screen.getByRole('button', { name: /collapse all/i }))
    expect(screen.queryAllByRole('button', { name: /hide the story/i })).toHaveLength(0)
  })
})
