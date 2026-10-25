import { render, screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { routes } from '@/app/router'
import { TooltipProvider } from '@/components/ui/tooltip'
import { labs } from '@/features/labs/registry'

// jsdom has no WebGL: every SceneCanvas shows its 2D fallback, so the real lab views render here.
vi.mock('@/lib/webgl', () => ({ hasWebGL: () => false }))

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

describe('LabPage (/labs/:labId)', () => {
  it('mounts the full engine lab through LabHost, with a link to its lesson', async () => {
    renderAt('/labs/engine')
    expect(await screen.findByRole('heading', { level: 1, name: 'Four-Stroke Engine Laboratory' })).toBeInTheDocument()
    // The lazily loaded EngineLabView renders inside LabWorkbench (2D section fallback in jsdom).
    expect(await screen.findByRole('region', { name: 'Four-Stroke Engine Laboratory 3D scene' }, { timeout: 5000 })).toBeInTheDocument()
    expect(await screen.findByTestId('engine-readouts')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Read the lesson/ })).toHaveAttribute('href', '/topics/four-stroke-cycle')
    // Header search is mounted on every page.
    expect(within(screen.getByRole('banner')).getByRole('button', { name: 'Search lessons, labs and components' })).toBeInTheDocument()
  })

  it('shows a not-found state that links to every registered lab', async () => {
    renderAt('/labs/warp-drive')
    expect(await screen.findByRole('heading', { level: 1, name: 'We couldn’t find that lab' })).toBeInTheDocument()
    for (const lab of labs) expect(screen.getByRole('link', { name: lab.title })).toHaveAttribute('href', `/labs/${lab.id}`)
  })
})

describe('HomePage (/)', () => {
  it('lazy-mounts the engine hero with its own transport', async () => {
    renderAt('/')
    expect(await screen.findByRole('heading', { level: 1, name: /Understand Every Moving Part/ })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /(Play|Pause) engine animation/ }, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Open the engine lab/ })).toHaveAttribute('href', '/labs/engine')
  })
})
