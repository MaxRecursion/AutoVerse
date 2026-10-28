// @vitest-environment node
import { analyzeRepository } from './analyze'
import type { GitHubTreeEntry } from '../github/client'

const COMMIT = 'a'.repeat(40)
const BLOB_MAIN = 'b'.repeat(40)
const BLOB_UTIL = 'c'.repeat(40)
const BLOB_MANIFEST = 'd'.repeat(40)
const BLOB_CONFIG = 'e'.repeat(40)

describe('analyzeRepository', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('pins source reads to the resolved commit and records import evidence', async () => {
    const entries: GitHubTreeEntry[] = [
      { path: 'src/index.ts', sha: BLOB_MAIN, size: 126, type: 'blob', mode: '100644' },
      { path: 'src/core/util.ts', sha: BLOB_UTIL, size: 28, type: 'blob', mode: '100644' },
      { path: 'package.json', sha: BLOB_MANIFEST, size: 58, type: 'blob', mode: '100644' },
      { path: 'tsconfig.json', sha: BLOB_CONFIG, size: 68, type: 'blob', mode: '100644' },
    ]
    mockGitHub(entries, {
      [BLOB_MAIN]: `import { value } from './core/util'\nimport React from 'react'\nimport fs from 'node:fs'\nimport './missing'\nexport { value }`,
      [BLOB_UTIL]: 'export const value = 42',
      [BLOB_MANIFEST]: JSON.stringify({ dependencies: { react: '^19.0.0' } }),
      [BLOB_CONFIG]: JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] } } }),
    })

    const result = await analyzeRepository({ owner: 'acme', repository: 'demo', branch: 'main' })
    expect(result.commitSha).toBe(COMMIT)
    expect(result.counts.analyzedFiles).toBe(2)
    expect(result.frameworks).toContain('React')
    expect(result.packageManagers).toContain('npm (inferred from package.json)')
    expect(result.nodes.some((node) => node.id === `file:src/core/util.ts`)).toBe(true)
    expect(result.nodes.some((node) => node.id === 'package:npm:react')).toBe(true)
    expect(result.nodes.some((node) => node.id === 'package:builtin:node:fs' && node.packageKind === 'builtin')).toBe(true)
    expect(result.nodes.find((node) => node.id === 'file:src/index.ts')?.exports).toContain('value')
    const internal = result.edges.find((edge) => edge.source === 'file:src/index.ts' && edge.target === 'file:src/core/util.ts')
    expect(internal?.evidence[0]).toMatchObject({ path: 'src/index.ts', line: 1, specifier: './core/util', relation: 'static-import' })
    expect(result.edges.some((edge) => edge.status === 'unresolved' && edge.evidence[0]?.specifier === './missing')).toBe(true)
    expect(result.edges.some((edge) => edge.source === 'file:src/index.ts' && edge.target === 'file:src/core/util.ts' && edge.status === 'verified')).toBe(true)
    const urls = mockedUrls()
    expect(urls.some((url) => url.pathname.endsWith(`/git/trees/${COMMIT}`))).toBe(true)
    expect(urls.some((url) => url.pathname.endsWith(`/git/blobs/${BLOB_MAIN}`))).toBe(true)
  })

  it('marks oversized source files as skipped and partial', async () => {
    const large = { path: 'src/large.ts', sha: BLOB_MAIN, size: 90 * 1_024, type: 'blob' as const, mode: '100644' }
    const small = { path: 'src/small.ts', sha: BLOB_UTIL, size: 24, type: 'blob' as const, mode: '100644' }
    mockGitHub([large, small], { [BLOB_UTIL]: 'export const ok = true' })
    const result = await analyzeRepository({ owner: 'acme', repository: 'demo', branch: 'main' })
    expect(result.partial).toBe(true)
    expect(result.counts.discoveredFiles).toBe(2)
    expect(result.counts.analyzedFiles).toBe(1)
    expect(result.counts.skippedFiles).toBe(1)
    expect(result.warnings.join(' ')).toContain('exceeded the per-file or total byte budget')
  })

  it('uses tsconfig path aliases to resolve imports without inventing matches', async () => {
    mockGitHub([
      { path: 'src/app.ts', sha: BLOB_MAIN, size: 36, type: 'blob', mode: '100644' },
      { path: 'src/lib/math.ts', sha: BLOB_UTIL, size: 23, type: 'blob', mode: '100644' },
      { path: 'tsconfig.json', sha: BLOB_CONFIG, size: 66, type: 'blob', mode: '100644' },
    ], {
      [BLOB_MAIN]: `import { add } from '@/lib/math'`,
      [BLOB_UTIL]: 'export const add = () => 1',
      [BLOB_CONFIG]: JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] } } }),
    })
    const result = await analyzeRepository({ owner: 'acme', repository: 'demo', branch: 'main' })
    expect(result.edges.some((edge) => edge.source === 'file:src/app.ts' && edge.target === 'file:src/lib/math.ts' && edge.status === 'verified')).toBe(true)
  })

  it('keeps an undeclared bare import unresolved instead of naming an external package', async () => {
    mockGitHub([
      { path: 'src/app.ts', sha: BLOB_MAIN, size: 28, type: 'blob', mode: '100644' },
      { path: 'package.json', sha: BLOB_MANIFEST, size: 20, type: 'blob', mode: '100644' },
    ], { [BLOB_MAIN]: `import mystery from 'mystery-lib'`, [BLOB_MANIFEST]: JSON.stringify({ dependencies: {} }) })
    const result = await analyzeRepository({ owner: 'acme', repository: 'demo', branch: 'main' })
    expect(result.nodes.some((node) => node.id === 'package:npm:mystery-lib')).toBe(false)
    expect(result.edges.some((edge) => edge.status === 'unresolved' && edge.resolutionNote?.includes('declares this bare module'))).toBe(true)
  })
})

function mockGitHub(entries: GitHubTreeEntry[], sources: Record<string, string>) {
  const urls: URL[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input.toString() : input.url)
    urls.push(url)
    if (url.pathname.endsWith('/repos/acme/demo')) return Response.json({ default_branch: 'main', private: false, size: 10 })
    if (url.pathname.endsWith('/branches/main')) return Response.json({ commit: { sha: COMMIT } })
    if (url.pathname.endsWith(`/git/trees/${COMMIT}`)) return Response.json({ truncated: false, tree: entries })
    const sha = url.pathname.split('/').at(-1) ?? ''
    if (sha in sources) return Response.json({ encoding: 'base64', size: Buffer.byteLength(sources[sha]!), content: Buffer.from(sources[sha]!).toString('base64') })
    return Response.json({ message: 'Not Found' }, { status: 404 })
  }))
  requestedUrls.current = urls
}

const requestedUrls: { current: URL[] } = { current: [] }
function mockedUrls(): URL[] { return requestedUrls.current }
