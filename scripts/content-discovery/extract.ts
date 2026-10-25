/**
 * Tiny, dependency-free HTML metadata extraction. We only ever read link
 * targets, anchor text, titles, canonical links and breadcrumb labels — never
 * article bodies or images. Regex-based on purpose: the inputs are
 * server-rendered pages and we need a handful of well-delimited tags.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  hellip: '…',
  copy: '©',
  reg: '®',
  trade: '™',
  deg: '°',
  times: '×',
  middot: '·',
  raquo: '»',
  laquo: '«',
}

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const code = entity[1]?.toLowerCase() === 'x' ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match
  })
}

/** Strip tags, decode entities and collapse whitespace. */
export function textContent(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim()
}

/** Parse the attributes of a start tag's inner text (`a href="x" class=y`). */
export function parseAttributes(attrText: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const re = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(attrText))) {
    const name = m[1]!.toLowerCase()
    if (name in attrs) continue
    attrs[name] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '')
  }
  return attrs
}

export interface ExtractedLink {
  href: string
  /** Visible anchor text, falling back to title / aria-label / img alt. */
  text: string
  rel?: string
}

/** All `<a href>` links in document order (raw hrefs, not yet resolved). */
export function extractLinks(html: string): ExtractedLink[] {
  const links: ExtractedLink[] = []
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const attrs = parseAttributes(m[1] ?? '')
    const href = attrs.href
    if (!href) continue
    const inner = m[2] ?? ''
    // Card-style anchors wrap a heading plus a teaser paragraph: keep only the
    // heading so no third-party body text is ever captured.
    const heading = /<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/i.exec(inner)?.[2] ?? /<[a-z0-9-]+\b[^>]*class\s*=\s*["'][^"']*\btitle\b[^"']*["'][^>]*>([\s\S]*?)<\//i.exec(inner)?.[1]
    let text = textContent(heading ?? inner)
    if (!text) text = attrs['aria-label'] ?? attrs.title ?? ''
    if (!text) {
      const alt = /<(?:img|amp-img)\b[^>]*\balt\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(inner)
      text = decodeEntities(alt?.[1] ?? alt?.[2] ?? '').trim()
    }
    links.push({ href, text, ...(attrs.rel ? { rel: attrs.rel } : {}) })
  }
  return links
}

function metaContent(html: string, key: 'property' | 'name', value: string): string | undefined {
  const re = /<meta\b([^>]*)>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const attrs = parseAttributes(m[1] ?? '')
    if (attrs[key]?.toLowerCase() === value && attrs.content) return attrs.content.trim()
  }
  return undefined
}

export interface PageTitles {
  /** `<title>` text. */
  document?: string
  /** `og:title` meta. */
  openGraph?: string
  /** First `<h1>` text. */
  heading?: string
}

export function extractTitles(html: string): PageTitles {
  const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]
  const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1]
  const og = metaContent(html, 'property', 'og:title')
  const out: PageTitles = {}
  if (title && textContent(title)) out.document = textContent(title)
  if (og) out.openGraph = decodeEntities(og)
  if (h1 && textContent(h1)) out.heading = textContent(h1)
  return out
}

/**
 * Remove a trailing/leading site-name decoration from a document title,
 * e.g. "Pistons | How a Car Works" → "Pistons".
 */
export function cleanTitle(raw: string, siteNames: readonly string[]): string {
  let title = raw.replace(/\s+/g, ' ').trim()
  for (const name of siteNames) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    title = title
      .replace(new RegExp(`\\s*[|\\-–—:·•]\\s*${escaped}\\s*$`, 'i'), '')
      .replace(new RegExp(`^${escaped}\\s*[|\\-–—:·•]\\s*`, 'i'), '')
  }
  return title.trim()
}

/** Best human title: h1, then og:title, then cleaned <title>. */
export function bestPageTitle(titles: PageTitles, siteNames: readonly string[]): string | undefined {
  const candidates = [titles.heading, titles.openGraph, titles.document]
    .filter((t): t is string => !!t)
    .map((t) => cleanTitle(t, siteNames))
    .filter((t) => t.length > 0)
  return candidates[0]
}

export function extractCanonical(html: string): string | undefined {
  const re = /<link\b([^>]*)>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const attrs = parseAttributes(m[1] ?? '')
    const rel = attrs.rel?.toLowerCase().split(/\s+/) ?? []
    if (rel.includes('canonical') && attrs.href) return attrs.href.trim()
  }
  return undefined
}

/** `<link rel="amphtml">` target, if the page advertises an AMP variant. */
export function extractAmpHtml(html: string): string | undefined {
  const re = /<link\b([^>]*)>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const attrs = parseAttributes(m[1] ?? '')
    const rel = attrs.rel?.toLowerCase().split(/\s+/) ?? []
    if (rel.includes('amphtml') && attrs.href) return attrs.href.trim()
  }
  return undefined
}

export interface Breadcrumb {
  name: string
  url?: string
}

/**
 * Breadcrumb trail from JSON-LD `BreadcrumbList` (preferred) or a
 * `breadcrumb`-classed / labelled list of links.
 */
export function extractBreadcrumbs(html: string): Breadcrumb[] {
  const scripts = html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
  for (const s of scripts) {
    try {
      const crumbs = findBreadcrumbList(JSON.parse(s[1] ?? ''))
      if (crumbs.length) return crumbs
    } catch {
      // malformed JSON-LD is ignored
    }
  }
  const container =
    /<(nav|ol|ul|div)\b[^>]*(?:class\s*=\s*["'][^"']*breadcrumb[^"']*["']|aria-label\s*=\s*["']breadcrumbs?["'])[^>]*>([\s\S]*?)<\/\1>/i.exec(
      html,
    )
  if (!container) return []
  return extractLinks(container[2] ?? '')
    .filter((l) => l.text)
    .map((l) => ({ name: l.text, url: l.href }))
}

function findBreadcrumbList(node: unknown): Breadcrumb[] {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findBreadcrumbList(child)
      if (found.length) return found
    }
    return []
  }
  if (!node || typeof node !== 'object') return []
  const obj = node as Record<string, unknown>
  if (obj['@type'] === 'BreadcrumbList' && Array.isArray(obj.itemListElement)) {
    return (obj.itemListElement as Array<Record<string, unknown>>)
      .slice()
      .sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0))
      .map((el) => {
        const item = el.item
        const itemObj = item && typeof item === 'object' ? (item as Record<string, unknown>) : undefined
        const name = String(el.name ?? itemObj?.name ?? '').trim()
        const url = typeof item === 'string' ? item : typeof itemObj?.['@id'] === 'string' ? (itemObj['@id'] as string) : undefined
        return { name: decodeEntities(name), ...(url ? { url } : {}) }
      })
      .filter((c) => c.name)
  }
  if (obj['@graph']) return findBreadcrumbList(obj['@graph'])
  return []
}

export interface ReuseSignals {
  mentionsCopyright: boolean
  mentionsAllRightsReserved: boolean
  mentionsCreativeCommons: boolean
  mentionsPermissionRequired: boolean
  mentionsOpenLicence: boolean
}

/** Does the visible page text mention licensing / reuse terms? Flags only — no text is kept. */
export function detectReuseSignals(html: string): ReuseSignals {
  const text = textContent(html).toLowerCase()
  return {
    mentionsCopyright: /copyright|©/.test(text),
    mentionsAllRightsReserved: /all rights reserved/.test(text),
    mentionsCreativeCommons: /creative\s*commons|\bcc[- ]by\b/.test(text),
    mentionsPermissionRequired: /(without|prior|written)\s+(the\s+)?(express\s+)?(written\s+)?permission|may not be (re)?(produced|copied|used)|not\s+(be\s+)?reproduced/.test(
      text,
    ),
    mentionsOpenLicence: /\b(public domain|mit licen[cs]e|gnu free documentation|open licen[cs]e)\b/.test(text),
  }
}
