/**
 * Minimal, dependency-free robots.txt parser and matcher following
 * RFC 9309 (groups, longest-match precedence, `*` and `$` patterns), plus the
 * widely used non-standard `Crawl-delay` and `Sitemap` lines.
 *
 * Everything here is pure so it can be unit tested without network access.
 */

export interface RobotsRule {
  type: 'allow' | 'disallow'
  /** Raw path pattern as written in the file (may contain `*` and a trailing `$`). */
  pattern: string
}

export interface RobotsGroup {
  /** Lower-cased user-agent tokens this group applies to (`*` for everyone). */
  agents: string[]
  rules: RobotsRule[]
  /** Seconds, if the group declared a valid Crawl-delay. */
  crawlDelay?: number
}

export interface ParsedRobots {
  groups: RobotsGroup[]
  sitemaps: string[]
}

/** Parse robots.txt text into groups. Unknown fields are ignored. */
export function parseRobots(text: string): ParsedRobots {
  const groups: RobotsGroup[] = []
  const sitemaps: string[] = []
  let current: RobotsGroup | null = null
  // A user-agent line directly after another user-agent line extends the same
  // group; after any rule it starts a new one.
  let lastWasAgent = false

  // Strip a UTF-8 BOM, then split on any line ending.
  const lines = text.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/)
  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/, '').trim()
    if (!line) continue
    const sep = line.indexOf(':')
    if (sep === -1) continue
    const field = line.slice(0, sep).trim().toLowerCase()
    const value = line.slice(sep + 1).trim()

    switch (field) {
      case 'user-agent': {
        const agent = value.toLowerCase()
        if (!current || !lastWasAgent) {
          current = { agents: [], rules: [] }
          groups.push(current)
        }
        if (agent) current.agents.push(agent)
        lastWasAgent = true
        break
      }
      case 'allow':
      case 'disallow': {
        lastWasAgent = false
        if (!current) break // rules before any user-agent line are ignored (RFC 9309 §2.2)
        // An empty Disallow means "allow everything" and contributes no rule.
        if (!value) break
        current.rules.push({ type: field, pattern: value })
        break
      }
      case 'crawl-delay': {
        lastWasAgent = false
        if (!current) break
        const seconds = Number.parseFloat(value)
        if (Number.isFinite(seconds) && seconds >= 0) current.crawlDelay = seconds
        break
      }
      case 'sitemap': {
        // Sitemap lines are global and do not end a group.
        if (value) sitemaps.push(value)
        break
      }
      default:
        // Unknown fields neither start nor end a group.
        break
    }
  }
  return { groups, sitemaps }
}

/** Product token of a user-agent string: "Foo/1.0 (+info)" → "foo". */
export function productToken(userAgent: string): string {
  return userAgent.trim().split(/[\s/]/)[0]?.toLowerCase() ?? ''
}

/**
 * Groups that apply to `userAgent`. Specific groups (matching the product
 * token, case-insensitively) win over the `*` group; multiple matching groups
 * are merged as RFC 9309 requires.
 */
export function groupsFor(robots: ParsedRobots, userAgent: string): RobotsGroup[] {
  const token = productToken(userAgent)
  const specific = robots.groups.filter((g) => g.agents.some((a) => a !== '*' && a === token))
  if (specific.length) return specific
  return robots.groups.filter((g) => g.agents.includes('*'))
}

/** Escape a robots pattern into an anchored RegExp (`*` wildcard, trailing `$`). */
export function patternToRegExp(pattern: string): RegExp {
  const anchored = pattern.endsWith('$')
  const body = anchored ? pattern.slice(0, -1) : pattern
  const escaped = body
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*')
  return new RegExp(`^${escaped}${anchored ? '$' : ''}`)
}

/** Percent-decode unreserved characters so `/a%62c` and `/abc` compare equal. */
function normalisePathForMatching(path: string): string {
  return path.replace(/%([0-9a-fA-F]{2})/g, (match, hex: string) => {
    const ch = String.fromCharCode(Number.parseInt(hex, 16))
    return /[A-Za-z0-9\-._~]/.test(ch) ? ch : match.toUpperCase()
  })
}

export interface RobotsDecision {
  allowed: boolean
  /** The rule that decided the outcome, if any. */
  rule?: RobotsRule
}

/**
 * Decide whether `pathWithQuery` (e.g. "/engine/pistons?x=1") may be fetched.
 * Longest matching pattern wins; on a tie, `allow` wins. No match → allowed.
 * `/robots.txt` itself is always allowed.
 */
export function checkRobots(robots: ParsedRobots, userAgent: string, pathWithQuery: string): RobotsDecision {
  const path = normalisePathForMatching(pathWithQuery || '/')
  if (path === '/robots.txt') return { allowed: true }
  let best: RobotsRule | undefined
  let bestLength = -1
  for (const group of groupsFor(robots, userAgent)) {
    for (const rule of group.rules) {
      const pattern = normalisePathForMatching(rule.pattern)
      if (!patternToRegExp(pattern).test(path)) continue
      const length = pattern.length
      if (length > bestLength || (length === bestLength && rule.type === 'allow')) {
        best = rule
        bestLength = length
      }
    }
  }
  return best ? { allowed: best.type === 'allow', rule: best } : { allowed: true }
}

export const isAllowed = (robots: ParsedRobots, userAgent: string, pathWithQuery: string) =>
  checkRobots(robots, userAgent, pathWithQuery).allowed

/** Largest Crawl-delay (seconds) declared by the groups that apply to us, if any. */
export function crawlDelayFor(robots: ParsedRobots, userAgent: string): number | undefined {
  const delays = groupsFor(robots, userAgent)
    .map((g) => g.crawlDelay)
    .filter((d): d is number => d !== undefined)
  return delays.length ? Math.max(...delays) : undefined
}
