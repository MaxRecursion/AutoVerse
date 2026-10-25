import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { routes } from '@/app/router'
import { TooltipProvider } from '@/components/ui/tooltip'

// Lessons are authored by other workstreams; merge schema-valid fixtures so these tests never depend on what exists.
vi.mock('@/lib/content', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/content')>()
  const { withFixtureContent, fixtureTopics, fixtureComponents, fixtureSourceArticles } = await import('./__fixtures__/content')
  return withFixtureContent(actual, { topics: fixtureTopics, components: fixtureComponents, sourceArticles: fixtureSourceArticles })
})

// jsdom has no WebGL / layout: the 3D view is replaced, scrolling is a no-op.
vi.mock('@/features/labs/useLabInstance', () => ({ useLabInstance: () => null }))
vi.mock('@/features/labs/LabHost', () => ({
  LabHost: () => <div data-testid="lab-host" />,
  LabSkeleton: () => null,
}))

beforeAll(() => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
  Element.prototype.scrollIntoView = vi.fn()
})

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <TooltipProvider>
      <RouterProvider router={router} />
    </TooltipProvider>,
  )
  return router
}

describe('learning navigation', () => {
  it('/learn lists topics and a topic link opens its lesson', async () => {
    const user = userEvent.setup()
    const router = renderAt('/learn')
    expect(await screen.findByRole('heading', { level: 1, name: 'Every lesson, one place' })).toBeInTheDocument()

    const engineGroup = within(screen.getByRole('region', { name: /^Engine/ }))
    const card = engineGroup.getByRole('link', { name: /Fixture engine cycle/ })
    await user.click(card)

    expect(await screen.findByRole('heading', { level: 1, name: 'Fixture engine cycle' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/topics/fixture-engine-cycle')
    expect(screen.getByRole('heading', { level: 2, name: 'Step by step' })).toBeInTheDocument()
  })

  it('keeps search and filters in the URL', async () => {
    const user = userEvent.setup()
    const router = renderAt('/learn?difficulty=advanced')
    const brakes = await screen.findByRole('region', { name: /^Brakes/ })
    expect(within(brakes).getByRole('link', { name: /Fixture outline/ })).toBeInTheDocument()
    const engine = screen.queryByRole('region', { name: /^Engine/ })
    if (engine) expect(within(engine).queryByRole('link', { name: /Fixture engine cycle/ })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Difficulty')).toHaveValue('advanced')

    await user.selectOptions(screen.getByLabelText('Difficulty'), '')
    await user.type(screen.getByLabelText('Search lessons'), 'fixture ignition')
    expect(router.state.location.search).toContain('q=fixture+ignition')
    expect(router.state.location.search).not.toContain('difficulty')
    const fuel = await screen.findByRole('region', { name: /^Fuel & Ignition/ })
    expect(within(fuel).getByRole('link', { name: /Fixture ignition/ })).toHaveAttribute('href', '/topics/fixture-ignition')
    expect(screen.queryByRole('region', { name: /^Brakes/ })).not.toBeInTheDocument()
  })

  it('shows a category page with its lessons and a further-reading section', async () => {
    renderAt('/learn/engine')
    expect(await screen.findByRole('heading', { level: 1, name: 'Engine' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Fixture engine cycle/ })).toHaveAttribute('href', '/topics/fixture-engine-cycle')
    expect(screen.getByRole('heading', { name: 'Further reading' })).toBeInTheDocument()
  })

  it('collapses long further-reading lists and labels the links as external', async () => {
    const user = userEvent.setup()
    renderAt('/learn/engine')
    const reading = within(await screen.findByRole('region', { name: 'Further reading' }))
    const links = () => reading.getAllByRole('link')
    expect(links()).toHaveLength(8)
    for (const link of links()) {
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
      expect(link).toHaveAccessibleName(/external site, opens in a new tab/)
    }
    const more = reading.getByRole('button', { name: /^Show all \d+ links$/ })
    expect(more).toHaveAttribute('aria-expanded', 'false')
    await user.click(more)
    expect(links().length).toBeGreaterThanOrEqual(12)
    expect(reading.getByRole('link', { name: /Fixture reading 12/ })).toBeInTheDocument()
    expect(reading.getByRole('button', { name: 'Show fewer' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('shows a friendly not-found state with suggestions for unknown lessons', async () => {
    renderAt('/topics/fixture-engine')
    expect(await screen.findByRole('heading', { level: 1, name: /couldn’t find that lesson/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Search for “fixture engine”/ })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Did you mean…' })).getByRole('link', { name: /Fixture engine cycle/ })).toBeInTheDocument()
  })
})
