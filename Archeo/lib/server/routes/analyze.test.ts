// @vitest-environment node
import { handleAnalyze } from './analyze.ts'

describe('analysis endpoint failures', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('rejects unsupported hosts before contacting GitHub', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const response = await handleAnalyze(post({ repository: 'https://github.com.evil.test/org/repo', branch: 'main' }))
    expect(response.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toMatchObject({ code: 'INVALID_INPUT' })
  })

  it('maps a missing branch to an actionable error', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input.toString() : input.url)
      if (url.pathname.endsWith('/repos/acme/demo')) return Response.json({ default_branch: 'main', private: false, size: 1 })
      return Response.json({ message: 'Not Found' }, { status: 404 })
    }))
    const response = await handleAnalyze(post({ repository: 'acme/demo', branch: 'deleted' }))
    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toMatchObject({ code: 'BRANCH_NOT_FOUND', error: expect.stringContaining('deleted') })
  })

  it('surfaces GitHub anonymous API rate limits', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ message: 'rate limit exceeded' }, { status: 403, headers: { 'x-ratelimit-remaining': '0' } })))
    const response = await handleAnalyze(post({ repository: 'acme/demo', branch: 'main' }))
    expect(response.status).toBe(429)
    await expect(response.json()).resolves.toMatchObject({ code: 'RATE_LIMITED' })
  })
})

function post(body: unknown): Request {
  return new Request('http://localhost/api/analyze', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
}
