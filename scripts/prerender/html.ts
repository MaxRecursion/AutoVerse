/**
 * Pure document transforms for prerendering. Injected regions are wrapped in
 * marker comments so rerunning the prerender over an already-processed
 * dist/index.html restores the pristine template first (idempotent).
 */
import { escapeHtml, SITE_NAME, type LabMeta, type PrerenderRoute } from './routes'

export const NOSCRIPT_PLACEHOLDER = '<!--prerender:noscript-->'
const HEAD_START = '<!--prerender:head:start-->'
const HEAD_END = '<!--prerender:head:end-->'
const NOSCRIPT_START = '<!--prerender:noscript:start-->'
const NOSCRIPT_END = '<!--prerender:noscript:end-->'

const between = (start: string, end: string) => new RegExp(`${start}[\\s\\S]*?${end}`, 'g')

/** Undo a previous prerender pass so the template can be reused. */
export function restoreTemplate(html: string): string {
  return html
    .replace(new RegExp(`\\n?[ \\t]*${between(HEAD_START, HEAD_END).source}`, 'g'), '')
    .replace(between(NOSCRIPT_START, NOSCRIPT_END), NOSCRIPT_PLACEHOLDER)
}

/** Join a site origin and a route path (no trailing slash except for "/"). */
export function absoluteUrl(siteUrl: string, path: string): string {
  return `${siteUrl.replace(/\/+$/, '')}${path === '/' ? '/' : path}`
}

/** Readable fallback styles: the app's CSS resets lists and headings. */
const NOSCRIPT_STYLE =
  '<style>.prerender-fallback{max-width:46rem;margin:0 auto;padding:2rem 1rem 4rem;font:16px/1.65 system-ui,-apple-system,sans-serif;color:#ece8e1;background:#0b0c0f}' +
  '.prerender-fallback h1{font-size:1.9rem;line-height:1.2;margin:0 0 1rem}.prerender-fallback h2{font-size:1.25rem;margin:2rem 0 .5rem}' +
  '.prerender-fallback p{margin:0 0 1rem}.prerender-fallback ul,.prerender-fallback ol{margin:0 0 1rem;padding-left:1.25rem}' +
  '.prerender-fallback ul{list-style:disc}.prerender-fallback ol{list-style:decimal}.prerender-fallback li{margin:.25rem 0}' +
  '.prerender-fallback a{color:#38d7f2;text-decoration:underline}.prerender-fallback nav{margin-top:2.5rem;border-top:1px solid #2a2e36;padding-top:1rem}</style>'

export interface RenderOptions {
  siteUrl: string
  /** Adds <meta name="robots" content="noindex"> (used for 404.html). */
  noindex?: boolean
}

/** Produce the HTML for one route from the built index.html template. */
export function renderDocument(template: string, route: PrerenderRoute, { siteUrl, noindex = false }: RenderOptions): string {
  const base = restoreTemplate(template)
  if (!base.includes(NOSCRIPT_PLACEHOLDER)) throw new Error(`template is missing ${NOSCRIPT_PLACEHOLDER}`)
  if (!/<\/head>/i.test(base)) throw new Error('template has no </head>')

  const url = absoluteUrl(siteUrl, route.path)
  const title = escapeHtml(route.title)
  const description = escapeHtml(route.description)
  const head = [
    HEAD_START,
    noindex ? '<meta name="robots" content="noindex" />' : `<link rel="canonical" href="${escapeHtml(url)}" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:type" content="${route.ogType}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    noindex ? '' : `<meta property="og:url" content="${escapeHtml(url)}" />`,
    '<meta name="twitter:card" content="summary" />',
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    HEAD_END,
  ]
    .filter(Boolean)
    .join('\n    ')

  let html = base
  html = /<title>[\s\S]*?<\/title>/i.test(html)
    ? html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`)
    : html.replace(/<\/head>/i, `<title>${title}</title>\n  </head>`)
  const metaDescription = `<meta name="description" content="${description}" />`
  html = /<meta\s+name=["']description["'][^>]*>/i.test(html)
    ? html.replace(/<meta\s+name=["']description["'][^>]*>/i, metaDescription)
    : html.replace(/<\/head>/i, `${metaDescription}\n  </head>`)
  html = html.replace(/<\/head>/i, `  ${head}\n  </head>`)
  const noscript = `${NOSCRIPT_START}<noscript>${NOSCRIPT_STYLE}<main class="prerender-fallback">${route.bodyHtml}</main></noscript>${NOSCRIPT_END}`
  return html.replace(NOSCRIPT_PLACEHOLDER, () => noscript)
}

/** Output file for a route, relative to dist/: "/" → index.html, "/a/b" → a/b/index.html. */
export function outputFileFor(path: string): string {
  const clean = path.replace(/^\/+|\/+$/g, '')
  if (clean.split('/').some((seg) => seg === '..' || seg === '.')) throw new Error(`unsafe route path ${path}`)
  return clean ? `${clean}/index.html` : 'index.html'
}

const xmlEscape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!)

export function buildSitemap(routes: PrerenderRoute[], siteUrl: string, lastmod: string): string {
  const urls = routes
    .map(
      (r) =>
        `  <url>\n    <loc>${xmlEscape(absoluteUrl(siteUrl, r.path))}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <priority>${r.priority.toFixed(1)}</priority>\n  </url>`,
    )
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}

/**
 * Netlify-style _redirects: explicit 200 rewrites so "/topics/x" (no trailing
 * slash) is served from its prerendered file, followed by the existing rules
 * (normally the SPA fallback). Generated rules are replaced on rerun.
 */
export function buildRedirects(routes: PrerenderRoute[], existing: string): string {
  const START = '# prerender:start (generated by scripts/prerender — do not edit)'
  const END = '# prerender:end'
  const kept = existing.replace(new RegExp(`${START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${END}\\n?`), '').trim()
  const rules = routes.filter((r) => r.path !== '/').map((r) => `${r.path} /${outputFileFor(r.path)} 200`)
  return `${START}\n${rules.join('\n')}\n${END}\n${kept ? `${kept}\n` : ''}`
}

/**
 * Lab titles and summaries from src/features/labs/registry.ts, read as text
 * because the registry imports React modules. Objects are matched by their
 * `id`, `title` and `summary` string literals.
 */
export function parseLabMeta(source: string): LabMeta[] {
  const unquote = (s: string) => s.replace(/\\(['"\\])/g, '$1')
  const str = `'((?:[^'\\\\]|\\\\.)*)'`
  const re = new RegExp(`\\{\\s*id:\\s*${str},\\s*title:\\s*${str},[\\s\\S]*?summary:\\s*${str}`, 'g')
  const labs: LabMeta[] = []
  for (const m of source.matchAll(re)) {
    labs.push({ id: unquote(m[1]!), title: unquote(m[2]!), summary: unquote(m[3]!) })
  }
  return labs
}
