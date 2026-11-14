import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToString } from 'react-dom/server'
import { createMemoryRouter, createStaticHandler, createStaticRouter, RouterProvider, StaticRouterProvider } from 'react-router'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { engines } from './engines'
import SoundLabPage from './SoundLabPage'

const routes = [{ path: '/sound-lab', element: <SoundLabPage /> }]

function renderAt(url: string) {
  const router = createMemoryRouter(routes, { initialEntries: [url] })
  render(<RouterProvider router={router} />)
  return router
}

describe('SoundLabPage', () => {
  // jsdom has no canvas; the oscilloscope simply draws nothing.
  beforeAll(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  })

  it('renders the heading, every engine and the honesty note', () => {
    renderAt('/sound-lab')
    expect(screen.getByRole('heading', { level: 1, name: 'Engine Sound Lab' })).toBeInTheDocument()
    for (const e of engines) expect(screen.getByTestId(`sound-lab-engine-${e.id}`)).toBeInTheDocument()
    expect(screen.getByText(/Synthesised, not recorded/)).toBeInTheDocument()
    expect(screen.getByTestId('sound-lab-start')).toHaveTextContent(/Start engine/)
  })

  it('opens the engine named in ?engine= and switches on pick', async () => {
    const user = userEvent.setup()
    const router = renderAt('/sound-lab?engine=v10-lfa')
    expect(screen.getByTestId('sound-lab-intervals')).toHaveTextContent('even, every 72°')
    await user.click(screen.getByTestId('sound-lab-engine-v10-viper'))
    expect(router.state.location.search).toBe('?engine=v10-viper')
    expect(screen.getByTestId('sound-lab-intervals')).toHaveTextContent('alternating 54° and 90°')
  })

  it('lets the reader make a 90° V10 fire evenly, and go back to production', async () => {
    const user = userEvent.setup()
    renderAt('/sound-lab?engine=v10-viper')
    await user.click(screen.getByRole('button', { name: 'Make it fire evenly' }))
    expect(screen.getByTestId('sound-lab-intervals')).toHaveTextContent('even, every 72°')
    expect(screen.getByText(/Experiment · not production/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Back to production/ }))
    expect(screen.getByTestId('sound-lab-intervals')).toHaveTextContent('54°')
  })

  it('falls back to the default engine for an unknown id', () => {
    renderAt('/sound-lab?engine=nope')
    expect(screen.getByRole('heading', { level: 2, name: '90° V10 odd-fire' })).toBeInTheDocument()
  })

  it('renders on the server without touching browser audio', async () => {
    const handler = createStaticHandler(routes)
    const context = await handler.query(new Request('https://e.test/sound-lab'))
    if (context instanceof Response) throw new Error('unexpected redirect')
    const html = renderToString(<StaticRouterProvider router={createStaticRouter(handler.dataRoutes, context)} context={context} />)
    expect(html).toContain('Engine Sound Lab')
    expect(html).toContain('sound-lab-start')
  })
})
