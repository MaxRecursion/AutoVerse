import { normaliseUrl, pathSegments, type NormaliseOptions } from './urls'

/**
 * Site profile for https://www.howacarworks.com — the only source the
 * discovery tool is pointed at. Classification rules are pure and tested.
 *
 * Observed structure (AMP start page):
 *   /<category>.amp            category index (e.g. /engine.amp)
 *   /<category>/<slug>.amp     article (e.g. /basics/how-a-diesel-engine-works.amp)
 * Non-article areas (paid course, account, tags, blog…) are never requested.
 */
export const SITE = {
  name: 'How a Car Works',
  host: 'www.howacarworks.com',
  origin: 'https://www.howacarworks.com',
  startUrl: 'https://www.howacarworks.com/index.amp',
  /** Canonical (non-AMP) home page; its footer is where policy links live. */
  canonicalHome: 'https://www.howacarworks.com/',
  siteNames: ['How a Car Works', 'HowACarWorks', 'howacarworks.com'],
  normalise: { hostAliases: { 'howacarworks.com': 'www.howacarworks.com' }, stripAmp: true } satisfies NormaliseOptions,
  /** First path segments that are never crawled (accounts, commerce, listings). */
  excludedFirstSegments: new Set([
    'login',
    'logout',
    'register',
    'signup',
    'account',
    'video-course',
    'jobs',
    'tag',
    'tags',
    'blog',
    '3d',
    'patents',
    'press',
    'contact',
    'search',
    'cart',
    'checkout',
    'shop',
    'api',
    'admin',
    'about',
    'terms',
    'privacy',
    'cookies',
  ]),
} as const

/** Path patterns that indicate a terms / copyright / about page worth reading for reuse terms. */
export const POLICY_LINK_PATTERN = /(terms|conditions|copyright|legal|licen[cs]e|disclaimer|privacy|about)/i

export type PageKind = 'home' | 'category' | 'article' | 'policy' | 'excluded' | 'external'

export const normalise = (href: string, base?: string) => normaliseUrl(href, base, SITE.normalise)

/** Classify a *normalised* URL from its path alone. */
export function classifyUrl(url: string): PageKind {
  const u = new URL(url)
  if (u.hostname !== SITE.host) return 'external'
  const segments = pathSegments(url)
  if (segments.length === 0) return 'home'
  const first = segments[0]!.toLowerCase()
  if (SITE.excludedFirstSegments.has(first)) {
    return POLICY_LINK_PATTERN.test(first) ? 'policy' : 'excluded'
  }
  if (POLICY_LINK_PATTERN.test(first) && segments.length === 1) return 'policy'
  // Category listings may paginate with ?page=N; any other query is out of scope.
  const params = [...u.searchParams.keys()]
  if (params.some((k) => k !== 'page')) return 'excluded'
  if (segments.length === 1) return 'category'
  if (segments.length === 2 && !params.length) return 'article'
  return 'excluded'
}

/** Category slug for a category or article URL ("/engine/pistons" → "engine"). */
export function categorySlugOf(url: string): string | undefined {
  const kind = classifyUrl(url)
  if (kind !== 'category' && kind !== 'article') return undefined
  return pathSegments(url)[0]?.toLowerCase()
}

/** Human title from a slug when nothing better is known: "how-a-clutch-works" → "How a clutch works". */
export function titleFromSlug(slug: string): string {
  const words = slug.replace(/[-_]+/g, ' ').trim()
  return words ? words[0]!.toUpperCase() + words.slice(1) : slug
}

/** Generic anchor texts that never make a good title. */
const GENERIC_ANCHORS = /^(read more|more|continue( reading)?|next|previous|prev|start watching.*|click here|here|view|see more|›|»|→)$/i

/**
 * Pick the best title from the anchor texts seen for a URL: the most frequent
 * non-generic text of sensible length (long texts are teasers, not titles).
 */
export function bestAnchorTitle(texts: string[]): string | undefined {
  const counts = new Map<string, number>()
  for (const raw of texts) {
    const t = raw.replace(/\s+/g, ' ').trim()
    if (!t || t.length > 120 || GENERIC_ANCHORS.test(t)) continue
    counts.set(t, (counts.get(t) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0]?.[0]
}
