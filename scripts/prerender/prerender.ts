/**
 * Static prerender — runs after `vite build` (see "build" in package.json).
 *
 * Reads dist/index.html and the content JSON, then writes
 * dist/<route>/index.html for every app route with its own <title>, meta
 * description, canonical link, Open Graph tags and a <noscript> text version,
 * plus dist/404.html, dist/sitemap.xml, dist/_redirects (Netlify) and, if
 * public/ did not provide one, dist/robots.txt.
 *
 * Canonical and sitemap URLs need the production origin: set SITE_URL
 * (e.g. SITE_URL=https://example.org npm run build). Netlify's URL and
 * Vercel's VERCEL_PROJECT_PRODUCTION_URL are picked up automatically.
 * `--dist=<dir>` prerenders another build directory (used for local checks).
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { loadContent, ROOT } from '../validation/load-content'
import { buildRedirects, buildSitemap, outputFileFor, parseLabMeta, renderDocument } from './html'
import { buildRoutes, escapeHtml, SITE_NAME, type PrerenderRoute } from './routes'

const distArg = process.argv.find((a) => a.startsWith('--dist='))?.slice('--dist='.length)
const DIST = distArg ? path.resolve(distArg) : path.join(ROOT, 'dist')
const REGISTRY = path.join(ROOT, 'src/features/labs/registry.ts')
const PREVIEW_ORIGIN = 'http://localhost:4173'

function resolveSiteUrl(): { url: string; fromEnv: boolean } {
  const env = process.env
  const candidates = [env.SITE_URL, env.URL, env.VERCEL_PROJECT_PRODUCTION_URL && `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`]
  for (const c of candidates) {
    if (!c) continue
    try {
      const u = new URL(c)
      if (u.protocol === 'http:' || u.protocol === 'https:') return { url: u.origin, fromEnv: true }
    } catch {
      /* try the next candidate */
    }
  }
  return { url: PREVIEW_ORIGIN, fromEnv: false }
}

async function main() {
  const templatePath = path.join(DIST, 'index.html')
  if (!existsSync(templatePath)) throw new Error(`${templatePath} not found — run \`vite build\` first`)
  const template = await readFile(templatePath, 'utf8')

  const content = loadContent()
  if (content.errors.length) {
    content.errors.forEach((e) => console.error(`[prerender] ${e.file}: ${e.message}`))
    throw new Error(`${content.errors.length} content file(s) failed validation; run npm run validate:content`)
  }
  const labs = existsSync(REGISTRY) ? parseLabMeta(await readFile(REGISTRY, 'utf8')) : []
  if (!labs.length) console.warn('[prerender] warning: no labs parsed from src/features/labs/registry.ts; /labs/<id> pages skipped')

  const { url: siteUrl, fromEnv } = resolveSiteUrl()
  if (!fromEnv) console.warn(`[prerender] warning: SITE_URL not set; canonical and sitemap URLs use ${PREVIEW_ORIGIN}`)

  const routes = buildRoutes({ categories: content.categories, topics: content.topics, labs })
  const seen = new Set<string>()
  for (const route of routes) {
    if (seen.has(route.path)) throw new Error(`duplicate route ${route.path}`)
    seen.add(route.path)
    const file = path.join(DIST, outputFileFor(route.path))
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, renderDocument(template, route, { siteUrl }))
  }

  const notFound: PrerenderRoute = {
    path: '/404',
    title: `Page not found · ${SITE_NAME}`,
    description: 'This page does not exist. Browse AutoVerse lessons and laboratories instead.',
    ogType: 'website',
    bodyHtml: `<h1>Page not found</h1><p>${escapeHtml('There is no page at this address.')}</p><ul><li><a href="/">Home</a></li><li><a href="/learn">All topics</a></li><li><a href="/labs">Labs</a></li></ul>`,
    priority: 0,
  }
  await writeFile(path.join(DIST, '404.html'), renderDocument(template, notFound, { siteUrl, noindex: true }))

  const lastmod = new Date().toISOString().slice(0, 10)
  await writeFile(path.join(DIST, 'sitemap.xml'), buildSitemap(routes, siteUrl, lastmod))

  const redirectsPath = path.join(DIST, '_redirects')
  const existing = existsSync(redirectsPath) ? await readFile(redirectsPath, 'utf8') : '/*  /index.html  200\n'
  await writeFile(redirectsPath, buildRedirects(routes, existing))

  const robotsPath = path.join(DIST, 'robots.txt')
  if (!existsSync(robotsPath)) await writeFile(robotsPath, `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`)

  const count = (prefix: string) => routes.filter((r) => r.path.startsWith(prefix)).length
  console.log(
    `[prerender] ${routes.length} pages (${count('/topics/')} topics, ${count('/learn/')} categories, ${count('/labs/')} labs) + 404.html, sitemap.xml, _redirects → ${path.relative(ROOT, DIST) || '.'}/ (origin ${siteUrl})`,
  )
}

main().catch((error: unknown) => {
  console.error('[prerender] failed:', error instanceof Error ? error.message : error)
  process.exitCode = 1
})
