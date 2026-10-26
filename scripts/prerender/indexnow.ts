/**
 * Tells IndexNow engines (Bing, Yandex, Seznam, Naver and others; Bing's index
 * also feeds ChatGPT search and Copilot) which pages changed, so they are
 * recrawled within hours rather than weeks. Runs after a deploy (see
 * .github/workflows/deploy-pages.yml):
 *
 *   INDEXNOW_KEY=… SITE_URL=https://example.org node --experimental-strip-types scripts/prerender/indexnow.ts [--all]
 *
 * Reads the live sitemap and submits the pages whose lastmod is today or
 * yesterday (content changed in this push), or every page with --all. The key
 * file is published by the prerender step when INDEXNOW_KEY is set at build
 * time. No dependencies, so CI runs it without installing packages.
 */
import { pathToFileURL } from 'node:url'

const ENDPOINT = 'https://api.indexnow.org/indexnow'
const DAY_MS = 24 * 60 * 60 * 1000

export interface SitemapEntry {
  loc: string
  lastmod?: string
}

const unescapeXml = (s: string) =>
  s.replace(/&(amp|lt|gt|quot|apos);/g, (_, e: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[e]!)

export function parseSitemap(xml: string): SitemapEntry[] {
  return [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)]
    .map((m) => ({
      loc: unescapeXml(/<loc>([^<]+)<\/loc>/.exec(m[1]!)?.[1]?.trim() ?? ''),
      lastmod: /<lastmod>([^<]+)<\/lastmod>/.exec(m[1]!)?.[1]?.trim(),
    }))
    .filter((e) => e.loc)
}

/** Pages whose lastmod (a date or a timestamp) falls on or after `since`'s UTC day. */
export function changedSince(entries: SitemapEntry[], since: Date): string[] {
  const day = Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), since.getUTCDate())
  return entries.filter((e) => e.lastmod && Date.parse(e.lastmod) >= day).map((e) => e.loc)
}

/** The key file sits next to the site's pages, which allows URLs anywhere under the site's path. */
export function indexNowPayload(siteUrl: string, key: string, urls: string[]) {
  const site = new URL(siteUrl)
  return { host: site.host, key, keyLocation: `${site.origin}${site.pathname.replace(/\/+$/, '')}/${key}.txt`, urlList: urls }
}

/** GitHub Pages can take a minute to serve a new deploy; retry until the expected text is live. */
async function fetchLive(url: string, check: (body: string) => boolean): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${url}?t=${Date.now()}`)
    const body = res.ok ? await res.text() : ''
    if (res.ok && check(body)) return body
    if (attempt === 6) throw new Error(`${url} is not live (HTTP ${res.status})`)
    await new Promise((resolve) => setTimeout(resolve, 10_000))
  }
}

async function main() {
  const key = process.env.INDEXNOW_KEY?.trim()
  const siteUrl = process.env.SITE_URL?.trim().replace(/\/+$/, '')
  if (!key || !siteUrl) {
    console.log('[indexnow] INDEXNOW_KEY or SITE_URL is not set; nothing submitted')
    return
  }
  const entries = parseSitemap(await fetchLive(`${siteUrl}/sitemap.xml`, (xml) => xml.includes('<urlset')))
  const urls = process.argv.includes('--all') ? entries.map((e) => e.loc) : changedSince(entries, new Date(Date.now() - DAY_MS))
  if (!urls.length) {
    console.log('[indexnow] no page content changed today or yesterday; nothing submitted (use --all to submit every page)')
    return
  }
  await fetchLive(`${siteUrl}/${key}.txt`, (body) => body.trim() === key)
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(indexNowPayload(siteUrl, key, urls)),
  })
  // 200 OK and 202 Accepted both mean the list was received.
  if (res.status !== 200 && res.status !== 202) throw new Error(`IndexNow answered HTTP ${res.status}: ${await res.text()}`)
  console.log(`[indexnow] submitted ${urls.length} page(s) (HTTP ${res.status})`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error('[indexnow] failed:', error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
