/**
 * Pure document transforms for prerendering. Injected regions are wrapped in
 * marker comments so rerunning the prerender over an already-processed
 * dist/index.html restores the pristine template first (idempotent).
 */
import { escapeHtml, SITE_NAME, type LabMeta, type PrerenderRoute } from './routes'

export const NOSCRIPT_PLACEHOLDER = '<!--prerender:noscript-->'
export const ROOT_ELEMENT = '<div id="root"></div>'
const HEAD_START = '<!--prerender:head:start-->'
const HEAD_END = '<!--prerender:head:end-->'
const NOSCRIPT_START = '<!--prerender:noscript:start-->'
const NOSCRIPT_END = '<!--prerender:noscript:end-->'
const ROOT_START = '<div id="root"><!--prerender:app:start-->'
const ROOT_END = '<!--prerender:app:end--></div>'

const between = (start: string, end: string) => new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}`, 'g')
function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Undo a previous prerender pass so the template can be reused. */
export function restoreTemplate(html: string): string {
  return html
    .replace(new RegExp(`\\n?[ \\t]*${between(HEAD_START, HEAD_END).source}`, 'g'), '')
    .replace(between(NOSCRIPT_START, NOSCRIPT_END), NOSCRIPT_PLACEHOLDER)
    .replace(between(ROOT_START, ROOT_END), ROOT_ELEMENT)
}

/** Join a site URL prefix and route path (no trailing slash except for "/"). */
export function absoluteUrl(siteUrl: string, path: string): string {
  return `${siteUrl.replace(/\/+$/, '')}${path === '/' ? '/' : path}`
}

function prefixLocalLinks(html: string, basePath: string): string {
  const prefix = basePath === '/' ? '' : `/${basePath.split('/').filter(Boolean).join('/')}`
  if (!prefix) return html
  return html.replace(/\bhref=(["'])\/(?!\/)([^"']*)\1/g, (_match, quote: string, path: string) => `href=${quote}${prefix}/${path}${quote}`)
}

/** Readable fallback styles for pages that are not statically rendered: the app's CSS resets lists and headings. */
const NOSCRIPT_STYLE =
  '<style>.prerender-fallback{max-width:46rem;margin:0 auto;padding:2rem 1rem 4rem;font:16px/1.65 system-ui,-apple-system,sans-serif;color:#ece8e1;background:#0b0c0f}' +
  '.prerender-fallback h1{font-size:1.9rem;line-height:1.2;margin:0 0 1rem}.prerender-fallback h2{font-size:1.25rem;margin:2rem 0 .5rem}' +
  '.prerender-fallback p{margin:0 0 1rem}.prerender-fallback ul,.prerender-fallback ol{margin:0 0 1rem;padding-left:1.25rem}' +
  '.prerender-fallback ul{list-style:disc}.prerender-fallback ol{list-style:decimal}.prerender-fallback li{margin:.25rem 0}' +
  '.prerender-fallback a{color:#38d7f2;text-decoration:underline}.prerender-fallback nav{margin-top:2.5rem;border-top:1px solid #2a2e36;padding-top:1rem}</style>'

/** JSON for a <script> element: `<` is escaped so content can never close the element. */
export const jsonForScript = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c')

export interface RenderOptions {
  siteUrl: string
  /** Repository subpath for hosts such as GitHub Pages. */
  basePath?: string
  /** The page as rendered by the app at build time; placed inside #root. */
  appHtml?: string
  /** Site-wide JSON-LD nodes (organisation, website) merged into every page's graph. */
  siteJsonLd?: object[]
  /** Search engine ownership tags (Search Console, Bing Webmaster Tools). */
  verification?: { google?: string; bing?: string }
  /** Extra markup at the end of <head> (e.g. the 404 trailing-slash redirect). */
  extraHead?: string
}

const ROBOTS_INDEX = 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1'

/** Produce the HTML for one route from the built index.html template. */
export function renderDocument(template: string, route: PrerenderRoute, options: RenderOptions): string {
  const { siteUrl, basePath = '/', appHtml, siteJsonLd = [], verification = {}, extraHead = '' } = options
  const base = restoreTemplate(template)
  if (!base.includes(NOSCRIPT_PLACEHOLDER)) throw new Error(`template is missing ${NOSCRIPT_PLACEHOLDER}`)
  if (!base.includes(ROOT_ELEMENT)) throw new Error(`template is missing ${ROOT_ELEMENT}`)
  if (!/<\/head>/i.test(base)) throw new Error('template has no </head>')

  const noindex = !!route.noindex
  const url = absoluteUrl(siteUrl, route.path)
  const title = escapeHtml(route.title)
  const description = escapeHtml(route.description)
  const image = route.image ? { ...route.image, url: absoluteUrl(siteUrl, route.image.path) } : undefined
  const graph = noindex ? [] : [...siteJsonLd, ...(route.jsonLd ?? [])]
  const meta = (attr: 'name' | 'property', key: string, value: string | undefined) =>
    value ? `<meta ${attr}="${key}" content="${escapeHtml(value)}" />` : ''

  const head = [
    HEAD_START,
    `<meta name="robots" content="${noindex ? 'noindex, follow' : ROBOTS_INDEX}" />`,
    noindex ? '' : `<link rel="canonical" href="${escapeHtml(url)}" />`,
    !noindex && route.markdownPath ? `<link rel="alternate" type="text/markdown" href="${escapeHtml(absoluteUrl(siteUrl, route.markdownPath))}" title="${title} (Markdown)" />` : '',
    meta('name', 'google-site-verification', verification.google),
    meta('name', 'msvalidate.01', verification.bing),
    meta('property', 'og:site_name', SITE_NAME),
    meta('property', 'og:locale', 'en_GB'),
    meta('property', 'og:type', route.ogType),
    meta('property', 'og:title', route.title),
    meta('property', 'og:description', route.description),
    noindex ? '' : meta('property', 'og:url', url),
    image ? meta('property', 'og:image', image.url) : '',
    image ? meta('property', 'og:image:width', String(image.width)) : '',
    image ? meta('property', 'og:image:height', String(image.height)) : '',
    image ? meta('property', 'og:image:alt', image.alt) : '',
    route.ogType === 'article' ? meta('property', 'article:published_time', route.published) : '',
    route.ogType === 'article' ? meta('property', 'article:modified_time', route.modified) : '',
    route.ogType === 'article' ? meta('property', 'article:section', route.section) : '',
    meta('name', 'twitter:card', image ? 'summary_large_image' : 'summary'),
    meta('name', 'twitter:title', route.title),
    meta('name', 'twitter:description', route.description),
    image ? meta('name', 'twitter:image', image.url) : '',
    image ? meta('name', 'twitter:image:alt', image.alt) : '',
    graph.length ? `<script type="application/ld+json">${jsonForScript({ '@context': 'https://schema.org', '@graph': graph })}</script>` : '',
    extraHead,
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

  if (appHtml !== undefined) {
    // The real page, rendered by the app: crawlers read it; the browser replaces it with the same page.
    html = html.replace(ROOT_ELEMENT, () => `${ROOT_START}${appHtml}${ROOT_END}`)
    // Empty markers (not a deletion) so a rerun can restore the placeholder.
    return html.replace(NOSCRIPT_PLACEHOLDER, `${NOSCRIPT_START}${NOSCRIPT_END}`)
  }
  const noscript = `${NOSCRIPT_START}<noscript>${NOSCRIPT_STYLE}<main class="prerender-fallback">${prefixLocalLinks(route.bodyHtml, basePath)}</main></noscript>${NOSCRIPT_END}`
  return html.replace(NOSCRIPT_PLACEHOLDER, () => noscript)
}

/**
 * Output file for a route, relative to dist/: "/" → index.html, "/a/b" → a/b.html.
 * A file (not a directory index) makes "/a/b" itself answer 200 on GitHub Pages,
 * Netlify and Vercel clean URLs, so canonical URLs never redirect.
 */
export function outputFileFor(path: string): string {
  const clean = path.replace(/^\/+|\/+$/g, '')
  if (clean.split('/').some((seg) => seg === '..' || seg === '.')) throw new Error(`unsafe route path ${path}`)
  return clean ? `${clean}.html` : 'index.html'
}

/** Where a page's share image lives under public/ (drawn by `npm run og:images`): "/" → og/home.png, "/topics/x" → og/topics/x.png. */
export function ogImageFile(path: string): string {
  const clean = path.replace(/^\/+|\/+$/g, '')
  if (clean.split('/').some((seg) => seg === '..' || seg === '.')) throw new Error(`unsafe route path ${path}`)
  return `og/${clean || 'home'}.png`
}

const xmlEscape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!)

/** Sitemap of indexable pages; each page's lastmod is its own content date when known. */
export function buildSitemap(routes: PrerenderRoute[], siteUrl: string, fallbackLastmod: string): string {
  const urls = routes
    .filter((r) => !r.noindex)
    .map((r) => {
      const lastmod = (r.modified ?? fallbackLastmod).slice(0, 10)
      return `  <url>\n    <loc>${xmlEscape(absoluteUrl(siteUrl, r.path))}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <priority>${r.priority.toFixed(1)}</priority>\n  </url>`
    })
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}

/**
 * Netlify-style _redirects: explicit 200 rewrites so "/topics/x" is served
 * from its prerendered file, followed by the existing rules (normally the SPA
 * fallback). Generated rules are replaced on rerun.
 */
export function buildRedirects(routes: PrerenderRoute[], existing: string): string {
  const START = '# prerender:start (generated by scripts/prerender — do not edit)'
  const END = '# prerender:end'
  const kept = existing.replace(new RegExp(`${escapeRegExp(START)}[\\s\\S]*?${END}\\n?`), '').trim()
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

/**
 * 404.html is also the single-page fallback for paths that have no file. A
 * trailing-slash URL ("/topics/x/") is sent to its canonical form, which
 * search engines treat as a redirect.
 */
export function trailingSlashRedirect(basePath: string): string {
  const base = basePath.endsWith('/') ? basePath : `${basePath}/`
  return `<script>(function(){var p=location.pathname;if(p.length>1&&p!==${JSON.stringify(base)}&&p.charAt(p.length-1)==='/'){location.replace(p.replace(/\\/+$/,'')+location.search+location.hash)}})()</script>`
}
