import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
// The real manifest the site serves at /models/manifest.json.
import manifest from '../../public/models/manifest.json'
import AboutPage from './AboutPage'

const ready = manifest.assets.filter((a) => a.status === 'ready')

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function renderAbout() {
  render(
    <MemoryRouter>
      <AboutPage />
    </MemoryRouter>,
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('AboutPage model credits', () => {
  it('reads /models/manifest.json and credits only the models marked ready', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(manifest))
    vi.stubGlobal('fetch', fetchMock)
    renderAbout()

    const credits = within(screen.getByRole('region', { name: '3D model credits' }))
    for (const asset of ready) expect(await credits.findByRole('heading', { level: 3, name: asset.name })).toBeInTheDocument()
    expect(credits.getAllByRole('heading', { level: 3 })).toHaveLength(ready.length)
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/models\/manifest\.json$/), expect.anything())
  })

  it('shows an error with a working retry when the manifest fails to load', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({}, 500)).mockResolvedValue(jsonResponse(manifest))
    vi.stubGlobal('fetch', fetchMock)
    renderAbout()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('HTTP 500')
    await user.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { level: 3, name: ready[0].name })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('shows an empty state when there is no manifest', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Not found', { status: 404 })))
    renderAbout()
    expect(await screen.findByText(/No third-party 3D models are in use/)).toBeInTheDocument()
  })
})
