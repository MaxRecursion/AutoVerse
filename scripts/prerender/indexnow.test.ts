import { describe, expect, it } from 'vitest'
import { buildSitemap } from './html'
import { changedSince, indexNowPayload, parseSitemap } from './indexnow'
import type { PrerenderRoute } from './routes'

const route = (path: string, modified?: string, noindex = false): PrerenderRoute => ({
  path,
  title: path,
  description: 'A page.',
  ogType: 'website',
  bodyHtml: '',
  priority: 0.5,
  modified,
  noindex,
})

const site = 'https://example.github.io/AutoVerse'
const sitemap = buildSitemap(
  [route('/', '2026-10-25T09:00:00Z'), route('/topics/clutch', '2026-10-26T08:30:00+01:00'), route('/topics/old', '2026-09-01T12:00:00Z'), route('/progress', undefined, true)],
  site,
  '2026-10-26',
)

describe('IndexNow submission', () => {
  it('reads the sitemap the prerender step writes', () => {
    expect(parseSitemap(sitemap)).toEqual([
      { loc: `${site}/`, lastmod: '2026-10-25' },
      { loc: `${site}/topics/clutch`, lastmod: '2026-10-26' },
      { loc: `${site}/topics/old`, lastmod: '2026-09-01' },
    ])
  })

  it('submits only pages changed since the given day', () => {
    const entries = parseSitemap(sitemap)
    expect(changedSince(entries, new Date('2026-10-25T23:59:00Z'))).toEqual([`${site}/`, `${site}/topics/clutch`])
    expect(changedSince(entries, new Date('2026-10-27T00:00:00Z'))).toEqual([])
  })

  it('points at the key file under the site path', () => {
    expect(indexNowPayload(`${site}/`, 'abc12345', [`${site}/`])).toEqual({
      host: 'example.github.io',
      key: 'abc12345',
      keyLocation: 'https://example.github.io/AutoVerse/abc12345.txt',
      urlList: [`${site}/`],
    })
  })
})
