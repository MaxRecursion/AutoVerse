/**
 * URL normalisation used to dedupe discovered links. Pure functions only.
 *
 * The same article can be linked as AMP (`/foo.amp`, `/foo/amp`, `?amp=1`),
 * with or without a trailing slash, a fragment, tracking parameters or a
 * bare (non-www) host. All of those collapse to one canonical key.
 */

export interface NormaliseOptions {
  /**
   * Host aliases rewritten to their canonical host, e.g.
   * `{ 'howacarworks.com': 'www.howacarworks.com' }`.
   */
  hostAliases?: Record<string, string>
  /** Strip AMP markers so AMP and canonical variants dedupe (default true). */
  stripAmp?: boolean
}

const TRACKING_PARAMS = /^(utm_[a-z]+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|ref|_ga)$/i
const NON_HTTP_SCHEME = /^(mailto|tel|javascript|data|ftp|sms|whatsapp|file):/i

/**
 * Resolve `href` against `base` and return a canonical absolute URL string, or
 * `null` for non-http(s) links, malformed URLs and empty hrefs.
 */
export function normaliseUrl(href: string, base?: string, options: NormaliseOptions = {}): string | null {
  const stripAmp = options.stripAmp ?? true
  const trimmed = href.trim()
  if (!trimmed || trimmed.startsWith('#') || NON_HTTP_SCHEME.test(trimmed)) return null

  let url: URL
  try {
    url = base ? new URL(trimmed, base) : new URL(trimmed)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null

  url.protocol = 'https:'
  url.hash = ''
  url.username = ''
  url.password = ''
  let host = url.hostname.toLowerCase().replace(/\.$/, '')
  host = options.hostAliases?.[host] ?? host
  url.hostname = host
  if (url.port === '443' || url.port === '80') url.port = ''

  // Query: drop tracking + AMP markers, sort for stable keys.
  const params = [...url.searchParams.entries()]
    .filter(([key]) => !TRACKING_PARAMS.test(key))
    .filter(([key]) => !(stripAmp && key.toLowerCase() === 'amp'))
    .sort(([a], [b]) => a.localeCompare(b))
  url.search = ''
  for (const [key, value] of params) url.searchParams.append(key, value)

  url.pathname = normalisePath(url.pathname, stripAmp)
  return url.toString()
}

export function normalisePath(pathname: string, stripAmp = true): string {
  let path = pathname.replace(/\/{2,}/g, '/')
  if (!path.startsWith('/')) path = `/${path}`
  if (stripAmp) {
    path = path.replace(/\.amp$/i, '').replace(/\/amp\/?$/i, '/')
  }
  path = path.replace(/\/index(?:\.(?:html?|php))?$/i, '/')
  path = path.replace(/\.html?$/i, '')
  if (path.length > 1) path = path.replace(/\/+$/, '')
  return path || '/'
}

/** True when `url` is on exactly `host` (already-normalised hostnames). */
export function isSameHost(url: string, host: string): boolean {
  try {
    return new URL(url).hostname === host
  } catch {
    return false
  }
}

/** Path + query of an absolute URL, for robots matching. */
export function pathWithQuery(url: string): string {
  const u = new URL(url)
  return `${u.pathname}${u.search}`
}

/** Path segments without empty parts: "/engine/pistons" → ["engine", "pistons"]. */
export function pathSegments(url: string): string[] {
  return new URL(url).pathname.split('/').filter(Boolean)
}

/** Likely binary / non-HTML resources we never request. */
export function looksLikeAsset(url: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg|avif|ico|pdf|zip|mp4|webm|mp3|css|js|json|xml|woff2?|ttf|eot)$/i.test(
    new URL(url).pathname,
  )
}

/** Derive the AMP variant that the site publishes for a canonical page path. */
export function toAmpVariant(canonicalUrl: string): string {
  const u = new URL(canonicalUrl)
  u.pathname = u.pathname === '/' ? '/index.amp' : `${u.pathname}.amp`
  return u.toString()
}
