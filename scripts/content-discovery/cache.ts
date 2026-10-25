import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Breadcrumb, ExtractedLink, PageTitles, ReuseSignals } from './extract'

/**
 * On-disk cache (`.content-cache/`, gitignored) so reruns do not refetch.
 * It stores *metadata only* — status, titles, canonical, breadcrumbs and the
 * outgoing links of a page — never article bodies or images. robots.txt is
 * the one exception: its text is a machine-readable policy file.
 */

export const CACHE_VERSION = 2

export interface CachedPage {
  cacheVersion: number
  requestedUrl: string
  status: number
  ok: boolean
  contentType?: string
  location?: string
  retrievedAt: string
  titles?: PageTitles
  canonical?: string
  ampHtml?: string
  breadcrumbs?: Breadcrumb[]
  links?: ExtractedLink[]
  reuseSignals?: ReuseSignals
  /** Raw robots.txt text (only for /robots.txt). */
  robotsText?: string
  bodyBytes?: number
}

export class PageCache {
  constructor(
    private readonly dir: string,
    private readonly ttlMs: number,
    private readonly enabled = true,
  ) {}

  private fileFor(url: string): string {
    const hash = createHash('sha256').update(url).digest('hex').slice(0, 32)
    return path.join(this.dir, `${hash}.json`)
  }

  async get(url: string, now = Date.now()): Promise<CachedPage | undefined> {
    if (!this.enabled) return undefined
    try {
      const page = JSON.parse(await readFile(this.fileFor(url), 'utf8')) as CachedPage
      if (page.cacheVersion !== CACHE_VERSION || page.requestedUrl !== url) return undefined
      if (now - Date.parse(page.retrievedAt) > this.ttlMs) return undefined
      return page
    } catch {
      return undefined
    }
  }

  async set(page: CachedPage): Promise<void> {
    if (!this.enabled) return
    await mkdir(this.dir, { recursive: true })
    await writeFile(this.fileFor(page.requestedUrl), `${JSON.stringify(page)}\n`, 'utf8')
  }
}
