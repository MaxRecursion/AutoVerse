/**
 * Shapes of the discovery outputs (docs/content-inventory.json / .csv and
 * docs/content-discovery-report.json) plus pure serialisers. The import step
 * reads these types back, so keep them stable.
 */

/** Discovery itself never concludes reuse is allowed; see content-import/authorizations.json. */
export type ReuseConclusion = 'metadata-only'

export interface InventoryCategory {
  url: string
  slug: string
  title: string
  httpStatus: number | null
  fetched: boolean
  retrievedAt: string | null
  articleCount: number
}

export interface InventoryArticle {
  /** Canonical (non-AMP, normalised) URL — the dedupe key and the link we publish. */
  url: string
  /** The exact URL requested / linked (usually the AMP variant). */
  fetchUrl: string
  title: string
  titleSource: 'page' | 'anchor' | 'slug'
  sourceCategory: string | null
  sourceCategorySlug: string | null
  sourceCategorySource: 'breadcrumb' | 'path' | null
  /** HTTP status of the article request; null when it was not requested. */
  httpStatus: number | null
  /** True when the article URL itself was requested (from network or cache). */
  fetched: boolean
  /** When the article page was retrieved; null if only seen listed on an index. */
  retrievedAt: string | null
  /** When the listing that revealed this article was retrieved. */
  listedAt: string | null
  robotsAllowed: boolean
  /** Up to three pages that linked here. */
  discoveredFrom: string[]
  redirectedTo?: string
  error?: string
}

export interface ContentInventory {
  generatedAt: string
  source: { name: string; origin: string; startUrl: string }
  reuse: { conclusion: ReuseConclusion; reason: string }
  categories: InventoryCategory[]
  articles: InventoryArticle[]
}

export interface PolicyCheck {
  url: string
  httpStatus: number | null
  linkText?: string
  signals?: {
    mentionsCopyright: boolean
    mentionsAllRightsReserved: boolean
    mentionsCreativeCommons: boolean
    mentionsPermissionRequired: boolean
    mentionsOpenLicence: boolean
  }
  error?: string
}

export interface DiscoveryReport {
  generatedAt: string
  durationSeconds: number
  userAgent: string
  source: { name: string; origin: string; startUrl: string }
  robots: {
    url: string
    httpStatus: number | null
    retrievedAt: string | null
    groupsApplyingToUs: string
    crawlDelaySeconds: number | null
    effectiveDelayMs: number
    sitemaps: string[]
    disallowRulesForUs: string[]
    note: string
  }
  limits: { maxRequests: number; maxRetries: number; timeoutMs: number; cacheTtlHours: number }
  requests: {
    network: number
    retries: number
    servedFromCache: number
    byStatus: Record<string, number>
    budgetExhausted: boolean
  }
  counts: {
    categories: number
    articles: number
    articlesFetched: number
    articlesListedOnly: number
    robotsBlocked: number
    inaccessible: number
  }
  robotsBlocked: string[]
  inaccessible: Array<{ url: string; httpStatus: number | null; error?: string }>
  failures: Array<{ url: string; error: string }>
  terms: {
    checked: PolicyCheck[]
    explicitLicenceFound: boolean
    conclusion: ReuseConclusion
    summary: string
  }
  notes: string[]
}

function csvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows: Array<Record<string, string | number | boolean | null | undefined>>, columns: string[]): string {
  const lines = [columns.join(',')]
  for (const row of rows) lines.push(columns.map((c) => csvCell(row[c])).join(','))
  return `${lines.join('\n')}\n`
}

export const INVENTORY_CSV_COLUMNS = [
  'kind',
  'url',
  'title',
  'sourceCategory',
  'httpStatus',
  'fetched',
  'retrievedAt',
  'robotsAllowed',
]

export function inventoryToCsv(inventory: ContentInventory): string {
  const rows = [
    ...inventory.categories.map((c) => ({
      kind: 'category',
      url: c.url,
      title: c.title,
      sourceCategory: c.title,
      httpStatus: c.httpStatus,
      fetched: c.fetched,
      retrievedAt: c.retrievedAt,
      robotsAllowed: true,
    })),
    ...inventory.articles.map((a) => ({
      kind: 'article',
      url: a.url,
      title: a.title,
      sourceCategory: a.sourceCategory,
      httpStatus: a.httpStatus,
      fetched: a.fetched,
      retrievedAt: a.retrievedAt,
      robotsAllowed: a.robotsAllowed,
    })),
  ]
  return toCsv(rows, INVENTORY_CSV_COLUMNS)
}

/** Interleave buckets (round-robin) so a request cap spreads across categories. */
export function roundRobin<T>(buckets: T[][]): T[] {
  const out: T[] = []
  const max = Math.max(0, ...buckets.map((b) => b.length))
  for (let i = 0; i < max; i++) for (const b of buckets) if (i < b.length) out.push(b[i]!)
  return out
}

const mdEscape = (s: string) => s.replace(/([\\|[\]*_`<>])/g, '\\$1').replace(/\s+/g, ' ').trim()

/**
 * Human-readable summary of an inventory + report (docs/content-inventory.md).
 * Titles and links only — the same metadata as the JSON, never article text.
 */
export function inventoryToMarkdown(inventory: ContentInventory, report: DiscoveryReport): string {
  const lines: string[] = []
  const push = (...l: string[]) => lines.push(...l)
  const { counts, requests, robots, terms } = report

  push(
    '# Content inventory',
    '',
    `> Generated by \`npm run content:discover\` (scripts/content-discovery) on ${inventory.generatedAt}. Do not edit by hand.`,
    '',
    `Source: [${mdEscape(inventory.source.name)}](${inventory.source.origin}) — start page ${inventory.source.startUrl}`,
    '',
    '## Reuse conclusion',
    '',
    `**${terms.conclusion}.** ${mdEscape(terms.summary)}`,
    '',
    'AutoVerse stores only URLs, titles, categories, HTTP statuses and timestamps. Lesson text is written independently; a discovered article may be linked as further reading, never reproduced. Full import requires an explicit entry in `scripts/content-import/authorizations.json`.',
    '',
    '## Crawl summary',
    '',
    '| Measure | Value |',
    '|---|---|',
    `| Category indexes | ${counts.categories} |`,
    `| Articles discovered | ${counts.articles} |`,
    `| Article pages fetched | ${counts.articlesFetched} |`,
    `| Articles seen in listings only | ${counts.articlesListedOnly} |`,
    `| Blocked by robots.txt | ${counts.robotsBlocked} |`,
    `| Inaccessible (non-2xx / errors) | ${counts.inaccessible} |`,
    `| Network requests (cap ${report.limits.maxRequests}) | ${requests.network}${requests.budgetExhausted ? ' — cap reached' : ''} |`,
    `| Served from cache | ${requests.servedFromCache} |`,
    `| Retries | ${requests.retries} |`,
    `| Request gap | ${robots.effectiveDelayMs} ms (robots Crawl-delay: ${robots.crawlDelaySeconds ?? 'none'}) |`,
    `| Duration | ${report.durationSeconds} s |`,
    '',
    `robots.txt (${robots.url}, HTTP ${robots.httpStatus ?? '—'}): ${mdEscape(robots.note)} Groups applying to us: ${mdEscape(robots.groupsApplyingToUs)}.`,
    '',
  )
  if (report.notes.length) {
    push('### Notes', '', ...report.notes.map((n) => `- ${mdEscape(n)}`), '')
  }

  push('## Categories', '', '| Category | Index | HTTP | Articles |', '|---|---|---|---|')
  for (const c of inventory.categories) {
    push(`| ${mdEscape(c.title)} | ${c.url} | ${c.httpStatus ?? '—'} | ${c.articleCount} |`)
  }
  push('')

  push('## Articles', '', 'Status: `200` = page fetched; `listed` = seen on a category index only (not requested).', '')
  const groups = new Map<string, InventoryArticle[]>()
  for (const a of inventory.articles) {
    const key = a.sourceCategory ?? 'Uncategorised'
    groups.set(key, [...(groups.get(key) ?? []), a])
  }
  for (const [category, articles] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    push(`### ${mdEscape(category)} (${articles.length})`, '')
    for (const a of [...articles].sort((x, y) => x.title.localeCompare(y.title))) {
      const status = a.fetched ? String(a.httpStatus ?? 'error') : 'listed'
      const flags = a.robotsAllowed ? '' : ' — blocked by robots.txt'
      push(`- [${mdEscape(a.title)}](${a.url}) — \`${status}\`${flags}`)
    }
    push('')
  }
  return `${lines.join('\n').trimEnd()}\n`
}
