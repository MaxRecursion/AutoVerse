import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { engineLabConfig } from '@/features/engine-lab/config'
import { labs } from '@/features/labs/registry'
import { OPEN_SEARCH_EVENT, type OpenSearchDetail } from '@/features/search/events'
import { getTopic } from '@/lib/content'
import LabPage from '@/pages/LabPage'
import LabsPage from '@/pages/LabsPage'
import NotFoundPage from '@/pages/NotFoundPage'
import { getLabOverviews } from './labOverview'

// The real engine view is a 3D workbench; this probe exposes the lab store LabPage hands to LabHost.
vi.mock('@/features/engine-lab/EngineLabView', async () => {
  const { useLab } = await import('@/components/three/LabContext')
  return {
    default: function ProbeLabView() {
      const cue = useLab((s) => s.cue)
      const selectedId = useLab((s) => s.selectedId)
      const isolatedId = useLab((s) => s.isolatedId)
      const playing = useLab((s) => s.playing)
      return (
        <div data-testid="lab-view" data-cue={cue ?? ''} data-selected={selectedId ?? ''} data-isolated={isolatedId ?? ''} data-playing={String(playing)} />
      )
    },
  }
})

beforeAll(() => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
})

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/labs', element: <LabsPage /> },
      { path: '/labs/:labId', element: <LabPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
    { initialEntries: [path] },
  )
  render(
    <TooltipProvider>
      <RouterProvider router={router} />
    </TooltipProvider>,
  )
  return router
}

const probe = () => screen.findByTestId('lab-view')

describe('LabPage (/labs/:labId)', () => {
  it('mounts the lab with breadcrumbs and a link to its lesson', async () => {
    renderAt('/labs/engine')
    expect(screen.getByRole('heading', { level: 1, name: 'Four-Stroke Engine Laboratory' })).toBeInTheDocument()
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(crumbs).getByRole('link', { name: 'Labs' })).toHaveAttribute('href', '/labs')
    expect(screen.getByRole('link', { name: /Read the lesson/ })).toHaveAttribute('href', '/topics/four-stroke-cycle')
    const view = await probe()
    // No query: the store is untouched (autoplaying from the start of the cycle).
    expect(view).toHaveAttribute('data-playing', 'true')
    expect(view).toHaveAttribute('data-selected', '')
    expect(document.title).toBe('Four-Stroke Engine Laboratory · AutoVerse')
  })

  it('applies ?cue and ?component to the lab store', async () => {
    const user = userEvent.setup()
    renderAt('/labs/engine?cue=exhaust&component=piston')
    const view = await probe()
    expect(view).toHaveAttribute('data-cue', 'exhaust')
    expect(view).toHaveAttribute('data-playing', 'false')
    expect(view).toHaveAttribute('data-selected', 'piston')
    expect(view).toHaveAttribute('data-isolated', '')

    // The linked part is announced and can be cleared.
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Piston')
    await user.click(within(status).getByRole('button', { name: 'Clear selection: Piston' }))
    expect(view).toHaveAttribute('data-selected', '')
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('ignores unknown cue and component ids', async () => {
    renderAt('/labs/engine?cue=warp&component=flux-capacitor')
    const view = await probe()
    expect(view).toHaveAttribute('data-cue', engineLabConfig.deriveCue!(0, engineLabConfig.initialParams) ?? '')
    expect(view).toHaveAttribute('data-playing', 'true')
    expect(view).toHaveAttribute('data-selected', '')
  })

  it('re-applies the deep link when the query changes', async () => {
    const router = renderAt('/labs/engine?cue=intake')
    const view = await probe()
    expect(view).toHaveAttribute('data-cue', 'intake')
    await act(() => router.navigate('/labs/engine?cue=power&component=spark-plug'))
    expect(view).toHaveAttribute('data-cue', 'power')
    expect(view).toHaveAttribute('data-selected', 'spark-plug')
  })

  it('shows a friendly not-found state for an unknown lab', async () => {
    const user = userEvent.setup()
    const queries: (string | undefined)[] = []
    const onOpen = (e: Event) => queries.push((e as CustomEvent<OpenSearchDetail>).detail.query)
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen)
    try {
      renderAt('/labs/warp-drive')
      expect(screen.getByRole('heading', { level: 1, name: 'We couldn’t find that lab' })).toBeInTheDocument()
      expect(screen.queryByTestId('lab-view')).toBeNull()
      for (const lab of labs) expect(screen.getByRole('link', { name: lab.title })).toHaveAttribute('href', `/labs/${lab.id}`)
      expect(document.title).toBe('Lab not found · AutoVerse')
      await user.click(screen.getByRole('button', { name: 'Search AutoVerse' }))
      expect(queries).toEqual(['warp drive'])
    } finally {
      window.removeEventListener(OPEN_SEARCH_EVENT, onOpen)
    }
  })
})

describe('LabsPage (/labs)', () => {
  it('lists every lab with what it covers, its status and links', () => {
    renderAt('/labs')
    expect(screen.getByRole('heading', { level: 1, name: 'Interactive engineering labs' })).toBeInTheDocument()
    expect(screen.getByText(/illustrative teaching values/)).toBeInTheDocument()
    for (const { lab, lesson, system } of getLabOverviews()) {
      const card = screen.getByRole('article', { name: lab.title })
      expect(within(card).getByRole('link', { name: `Open ${lab.shortTitle} lab` })).toHaveAttribute('href', `/labs/${lab.id}`)
      expect(within(card).getByText(lab.summary)).toBeInTheDocument()
      expect(within(card).getByText(lab.status === 'complete' ? 'Complete' : 'Beta')).toBeInTheDocument()
      if (system) expect(within(card).getByRole('link', { name: `${system.title} lessons` })).toHaveAttribute('href', `/learn/${system.slug}`)
      if (lesson) expect(within(card).getByRole('link', { name: `Lesson: ${lesson.title}` })).toHaveAttribute('href', `/topics/${lesson.slug}`)
      else expect(within(card).getByText('Lesson coming soon')).toBeInTheDocument()
    }
    expect(document.title).toBe('Labs · AutoVerse')
  })
})

describe('NotFoundPage (*)', () => {
  it('explains the miss, offers a pre-filled search and popular links', async () => {
    const user = userEvent.setup()
    const queries: (string | undefined)[] = []
    const onOpen = (e: Event) => queries.push((e as CustomEvent<OpenSearchDetail>).detail.query)
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen)
    try {
      renderAt('/topics/brake-pads')
      expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument()
      expect(screen.getByText('/topics/brake-pads')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Search for “brake pads”' }))
      expect(queries).toEqual(['brake pads'])

      const start = screen.getByRole('navigation', { name: 'Start points' })
      expect(within(start).getByRole('link', { name: 'All lessons' })).toHaveAttribute('href', '/learn')
      expect(within(start).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/')
      const lessons = screen.getByRole('navigation', { name: 'Popular lessons' })
      const fourStroke = getTopic('four-stroke-cycle')!
      expect(within(lessons).getByRole('link', { name: fourStroke.title })).toHaveAttribute('href', '/topics/four-stroke-cycle')
      const labNav = screen.getByRole('navigation', { name: 'Laboratories' })
      for (const lab of labs) expect(within(labNav).getByRole('link', { name: lab.title })).toHaveAttribute('href', `/labs/${lab.id}`)
      expect(document.title).toBe('Page not found · AutoVerse')
    } finally {
      window.removeEventListener(OPEN_SEARCH_EVENT, onOpen)
    }
  })
})
