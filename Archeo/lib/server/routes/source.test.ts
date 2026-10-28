// @vitest-environment node
import { handleSource } from './source.ts'

const COMMIT = 'a'.repeat(40)
const BLOB = 'b'.repeat(40)

describe('source endpoint', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('checks repository path and blob membership at the pinned commit', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input.toString() : input.url)
      if (url.pathname.endsWith('/repos/acme/demo')) return Response.json({ default_branch: 'main', private: false, size: 1 })
      if (url.pathname.endsWith(`/git/trees/${COMMIT}`)) return Response.json({ truncated: false, tree: [{ path: 'src/index.ts', sha: BLOB, size: 20, type: 'blob' }] })
      if (url.pathname.endsWith(`/git/blobs/${BLOB}`)) return Response.json({ encoding: 'base64', size: 19, content: Buffer.from('export const ok = true').toString('base64') })
      return Response.json({ message: 'Not Found' }, { status: 404 })
    }))
    const response = await handleSource(new Request('http://localhost/api/source', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ owner: 'acme', repository: 'demo', commitSha: COMMIT, path: 'src/index.ts', blobSha: BLOB }) }))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ path: 'src/index.ts', code: 'export const ok = true', url: `https://github.com/acme/demo/blob/${COMMIT}/src/index.ts` })
  })

  it('does not fetch a blob when the path is not in the pinned tree', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input.toString() : input.url)
      if (url.pathname.endsWith('/repos/acme/demo')) return Response.json({ default_branch: 'main', private: false, size: 1 })
      return Response.json({ truncated: false, tree: [] })
    })
    vi.stubGlobal('fetch', fetchMock)
    const response = await handleSource(new Request('http://localhost/api/source', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ owner: 'acme', repository: 'demo', commitSha: COMMIT, path: 'src/index.ts', blobSha: BLOB }) }))
    expect(response.status).toBe(404)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
