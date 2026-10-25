/**
 * Content discovery for https://www.howacarworks.com — METADATA ONLY.
 *
 *   npx tsx scripts/content-discovery/discover.ts [--max-requests=120] [--delay-ms=2000]
 *       [--cache-ttl-hours=168] [--no-cache] [--quiet]
 *
 * Policy: robots.txt is fetched and honoured first (Disallow for "*" and for our
 * product token, Crawl-delay, Sitemap). Requests are throttled to at least
 * max(Crawl-delay, 2 s), retried with exponential backoff on 429/5xx, capped,
 * and cached under .content-cache/ (gitignored) so reruns do not refetch. No
 * authentication, no cookies, no headless browser, no anti-bot evasion.
 *
 * Only URLs, titles, categories, statuses and timestamps are recorded.
 * Article bodies and images are never stored.
 *
 * Outputs: docs/content-inventory.json, docs/content-inventory.csv,
 *          docs/content-inventory.md, docs/content-discovery-report.json
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CACHE_VERSION, PageCache, type CachedPage } from './cache'
import {
  bestPageTitle,
  detectReuseSignals,
  extractAmpHtml,
  extractBreadcrumbs,
  extractCanonical,
  extractLinks,
  extractTitles,
  type Breadcrumb,
} from './extract'
import { PoliteFetcher, RequestBudgetExceeded, isFailure } from './fetcher'
import {
  inventoryToCsv,
  inventoryToMarkdown,
  roundRobin,
  type ContentInventory,
  type DiscoveryReport,
  type InventoryArticle,
  type InventoryCategory,
  type PolicyCheck,
} from './inventory'
import { checkRobots, crawlDelayFor, groupsFor, parseRobots, productToken, type ParsedRobots } from './robots'
import { POLICY_LINK_PATTERN, SITE, bestAnchorTitle, categorySlugOf, classifyUrl, normalise, titleFromSlug, type PageKind } from './site'
import { looksLikeAsset, pathWithQuery } from './urls'

export const USER_AGENT = 'AutoVerseContentDiscovery/0.1 (+educational project; contact: repo owner)'
const MIN_DELAY_MS = 2000
const MAX_REDIRECTS = 3
const MAX_POLICY_PAGES = 4

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DOCS = path.join(ROOT, 'docs')

interface Options {
  maxRequests: number
  delayMs: number
  cacheTtlHours: number
  useCache: boolean
  quiet: boolean
}

function parseArgs(argv: string[]): Options {
  const get = (name: string) => argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]
  const num = (name: string, fallback: number) => {
    const v = Number(get(name))
    return Number.isFinite(v) && v > 0 ? v : fallback
  }
  return {
    maxRequests: Math.floor(num('max-requests', 120)),
    delayMs: Math.max(MIN_DELAY_MS, num('delay-ms', MIN_DELAY_MS)),
    cacheTtlHours: num('cache-ttl-hours', 24 * 7),
    useCache: !argv.includes('--no-cache'),
    quiet: argv.includes('--quiet'),
  }
}

/** Mutable crawl record for one normalised URL. */
interface Node {
  key: string
  fetchUrl: string
  kind: PageKind
  /** Anchor texts from listing pages (home / category indexes) — the best title source. */
  anchorTexts: string[]
  /** Anchor texts from links inside articles (often a single inline word). */
  inlineAnchorTexts: string[]
  discoveredFrom: string[]
  status: number | null
  fetched: boolean
  retrievedAt: string | null
  pageTitle?: string
  breadcrumbs?: Breadcrumb[]
  robotsBlocked: boolean
  redirectedTo?: string
  error?: string
  notFetchedReason?: 'budget'
}

class Crawl {
  readonly nodes = new Map<string, Node>()
  readonly categoryQueue: string[] = []
  readonly policyCandidates: Array<{ key: string; text: string }> = []
  readonly failures: Array<{ url: string; error: string }> = []
  servedFromCache = 0
  budgetExhausted = false
  robots: ParsedRobots = { groups: [], sitemaps: [] }

  constructor(
    readonly fetcher: PoliteFetcher,
    readonly cache: PageCache,
    readonly log: (message: string) => void,
  ) {}

  /** Register a link; returns the node (new or existing) or undefined if out of scope. */
  record(href: string, base: string, text: string, from: Node | null): Node | undefined {
    const key = normalise(href, base)
    if (!key || looksLikeAsset(key)) return undefined
    const kind = classifyUrl(key)
    if (kind === 'external' || kind === 'excluded') return undefined
    let absolute: string
    try {
      const u = new URL(href, base)
      u.hash = ''
      absolute = u.toString()
    } catch {
      return undefined
    }
    let node = this.nodes.get(key)
    if (!node) {
      node = {
        key,
        fetchUrl: absolute,
        kind,
        anchorTexts: [],
        inlineAnchorTexts: [],
        discoveredFrom: [],
        status: null,
        fetched: false,
        retrievedAt: null,
        robotsBlocked: false,
      }
      this.nodes.set(key, node)
      if (kind === 'category') this.categoryQueue.push(key)
    } else if (/\.amp($|\?)/i.test(absolute) && !/\.amp($|\?)/i.test(node.fetchUrl)) {
      // Prefer the lighter AMP variant when both are linked.
      node.fetchUrl = absolute
    }
    if (text) (from?.kind === 'article' ? node.inlineAnchorTexts : node.anchorTexts).push(text)
    if (from && from.key !== key && node.discoveredFrom.length < 3 && !node.discoveredFrom.includes(from.key)) {
      node.discoveredFrom.push(from.key)
    }
    return node
  }

  /** Read from cache or network, following same-host redirects (each hop throttled and robots-checked). */
  async load(node: Node, withSignals = false): Promise<CachedPage | undefined> {
    let url = node.fetchUrl
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const decision = checkRobots(this.robots, USER_AGENT, pathWithQuery(url))
      if (!decision.allowed) {
        node.robotsBlocked = true
        this.log(`robots.txt disallows ${url} (rule: Disallow ${decision.rule?.pattern})`)
        return undefined
      }
      let page = await this.cache.get(url)
      if (page) {
        this.servedFromCache += 1
      } else {
        if (this.budgetExhausted) {
          node.notFetchedReason = 'budget'
          return undefined
        }
        try {
          const res = await this.fetcher.get(url)
          if (isFailure(res)) {
            node.error = res.error
            this.failures.push({ url, error: res.error })
            return undefined
          }
          page = summarise(url, res.status, res.ok, res.contentType, res.location, res.body, withSignals)
          // Transient failures are not cached so a rerun retries them.
          if (res.status < 500 && res.status !== 429) await this.cache.set(page)
        } catch (error) {
          if (error instanceof RequestBudgetExceeded) {
            this.budgetExhausted = true
            node.notFetchedReason = 'budget'
            this.log(`request cap of ${error.limit} reached — remaining pages stay listed-only`)
            return undefined
          }
          throw error
        }
      }
      node.status = page.status
      node.fetched = true
      node.retrievedAt = page.retrievedAt
      if (page.status >= 300 && page.status < 400 && page.location) {
        const target = normalise(page.location)
        if (!target || new URL(target).hostname !== SITE.host) {
          node.redirectedTo = page.location
          return page
        }
        node.redirectedTo = target
        url = page.location
        continue
      }
      return page
    }
    node.error = 'too many redirects'
    return undefined
  }
}

function summarise(
  url: string,
  status: number,
  ok: boolean,
  contentType: string | undefined,
  location: string | undefined,
  body: string | undefined,
  withSignals: boolean,
): CachedPage {
  const page: CachedPage = {
    cacheVersion: CACHE_VERSION,
    requestedUrl: url,
    status,
    ok,
    retrievedAt: new Date().toISOString(),
    ...(contentType ? { contentType } : {}),
    ...(location ? { location } : {}),
  }
  if (!body) return page
  page.bodyBytes = body.length
  if (url.endsWith('/robots.txt')) {
    page.robotsText = body
    return page
  }
  if (contentType && !/html/i.test(contentType)) return page
  page.titles = extractTitles(body)
  const canonical = extractCanonical(body)
  const amp = extractAmpHtml(body)
  if (canonical) page.canonical = canonical
  if (amp) page.ampHtml = amp
  const crumbs = extractBreadcrumbs(body)
  if (crumbs.length) page.breadcrumbs = crumbs
  // Keep link targets + short anchor labels only (never teaser paragraphs).
  page.links = extractLinks(body).map((l) => ({ href: l.href, text: l.text.length <= 120 ? l.text : '' }))
  if (withSignals) page.reuseSignals = detectReuseSignals(body)
  return page
}

async function main() {
  const started = Date.now()
  const opts = parseArgs(process.argv.slice(2))
  const log = (m: string) => {
    if (!opts.quiet) console.log(`[discover] ${m}`)
  }
  const cache = new PageCache(path.join(ROOT, '.content-cache'), opts.cacheTtlHours * 3600_000, opts.useCache)
  const fetcher = new PoliteFetcher({
    userAgent: USER_AGENT,
    minDelayMs: opts.delayMs,
    maxRequests: opts.maxRequests,
    maxRetries: 3,
    timeoutMs: 20_000,
    log: (m) => log(`  ${m}`),
  })
  const crawl = new Crawl(fetcher, cache, log)
  const notes: string[] = []

  // 1 — robots.txt (always first).
  const robotsUrl = `${SITE.origin}/robots.txt`
  const robotsNode: Node = {
    key: robotsUrl,
    fetchUrl: robotsUrl,
    kind: 'policy',
    anchorTexts: [],
    inlineAnchorTexts: [],
    discoveredFrom: [],
    status: null,
    fetched: false,
    retrievedAt: null,
    robotsBlocked: false,
  }
  const robotsPage = await crawl.load(robotsNode)
  let robotsNote: string
  if (robotsPage?.status && robotsPage.status >= 200 && robotsPage.status < 300) {
    crawl.robots = parseRobots(robotsPage.robotsText ?? '')
    robotsNote = 'robots.txt fetched and parsed.'
  } else if (robotsPage?.status && robotsPage.status >= 400 && robotsPage.status < 500) {
    robotsNote = `robots.txt returned ${robotsPage.status}; RFC 9309 treats this as no restrictions.`
  } else {
    // Unreachable robots.txt (5xx / network): RFC 9309 says assume complete disallow.
    console.error('[discover] robots.txt unreachable — aborting (treated as full disallow).')
    process.exitCode = 1
    return
  }
  const groups = groupsFor(crawl.robots, USER_AGENT)
  const crawlDelay = crawlDelayFor(crawl.robots, USER_AGENT)
  fetcher.minDelayMs = Math.max(opts.delayMs, (crawlDelay ?? 0) * 1000)
  log(`robots: ${groups.length} group(s) apply to "${productToken(USER_AGENT)}"; delay ${fetcher.minDelayMs} ms`)

  // 2 — start page + category indexes (pagination discovered on the way).
  const start = crawl.record(SITE.startUrl, SITE.origin, '', null)
  if (!start) throw new Error('start URL is out of scope')
  const visitListing = async (node: Node) => {
    const page = await crawl.load(node)
    if (!page) return
    if (page.titles) node.pageTitle = bestPageTitle(page.titles, SITE.siteNames)
    for (const link of page.links ?? []) crawl.record(link.href, node.fetchUrl, link.text, node)
  }
  await visitListing(start)
  for (let i = 0; i < crawl.categoryQueue.length; i++) {
    await visitListing(crawl.nodes.get(crawl.categoryQueue[i]!)!)
  }
  const listedAt = new Map<string, string>()
  for (const node of crawl.nodes.values()) {
    if (node.kind !== 'article') continue
    const from = node.discoveredFrom.map((k) => crawl.nodes.get(k)?.retrievedAt).find(Boolean)
    if (from) listedAt.set(node.key, from)
  }

  // 3 — terms / copyright check: policy links from the canonical home page footer.
  const policyChecks: PolicyCheck[] = []
  const homeNode: Node = {
    key: SITE.canonicalHome,
    fetchUrl: SITE.canonicalHome,
    kind: 'home',
    anchorTexts: [],
    inlineAnchorTexts: [],
    discoveredFrom: [],
    status: null,
    fetched: false,
    retrievedAt: null,
    robotsBlocked: false,
  }
  const home = await crawl.load(homeNode, true)
  if (home) {
    policyChecks.push({ url: SITE.canonicalHome, httpStatus: home.status, ...(home.reuseSignals ? { signals: home.reuseSignals } : {}) })
    const seen = new Set<string>()
    for (const link of home.links ?? []) {
      const key = normalise(link.href, SITE.canonicalHome)
      if (!key || seen.has(key) || classifyUrl(key) !== 'policy') continue
      if (!POLICY_LINK_PATTERN.test(new URL(key).pathname)) continue
      seen.add(key)
      crawl.policyCandidates.push({ key, text: link.text })
    }
  } else {
    policyChecks.push({ url: SITE.canonicalHome, httpStatus: homeNode.status, error: homeNode.error ?? 'not fetched' })
  }
  for (const candidate of crawl.policyCandidates.slice(0, MAX_POLICY_PAGES)) {
    const node: Node = {
      key: candidate.key,
      fetchUrl: candidate.key,
      kind: 'policy',
      anchorTexts: [candidate.text],
      inlineAnchorTexts: [],
      discoveredFrom: [SITE.canonicalHome],
      status: null,
      fetched: false,
      retrievedAt: null,
      robotsBlocked: false,
    }
    const page = await crawl.load(node, true)
    policyChecks.push({
      url: candidate.key,
      httpStatus: node.status,
      linkText: candidate.text,
      ...(page?.reuseSignals ? { signals: page.reuseSignals } : {}),
      ...(node.robotsBlocked ? { error: 'blocked by robots.txt' } : node.error ? { error: node.error } : {}),
    })
  }
  const explicitLicenceFound = policyChecks.some((p) => p.signals?.mentionsCreativeCommons || p.signals?.mentionsOpenLicence)
  const termsSummary = explicitLicenceFound
    ? 'A page mentions an open licence. Review it manually and record any explicit permission in scripts/content-import/authorizations.json before importing anything; until then articles remain metadata-only.'
    : `No terms-of-use page or open-content licence was found (checked: ${policyChecks.map((p) => p.url).join(', ')}). Without an explicit licence or written permission the articles are treated as all-rights-reserved: AutoVerse records titles and links only ("metadata-only") and writes all lesson text independently.`

  // 4 — article pages, round-robin across categories so the cap spreads evenly.
  const articleBuckets = new Map<string, string[]>()
  for (const node of crawl.nodes.values()) {
    if (node.kind !== 'article') continue
    const slug = categorySlugOf(node.key) ?? '_'
    articleBuckets.set(slug, [...(articleBuckets.get(slug) ?? []), node.key])
  }
  const articleOrder = roundRobin([...articleBuckets.values()])
  for (const key of articleOrder) {
    const node = crawl.nodes.get(key)!
    const page = await crawl.load(node)
    if (!page) continue
    if (page.titles) node.pageTitle = bestPageTitle(page.titles, SITE.siteNames)
    if (page.breadcrumbs?.length) node.breadcrumbs = page.breadcrumbs
    // Related-article links reveal pages missing from the indexes; record them (listed-only).
    for (const link of page.links ?? []) {
      const added = crawl.record(link.href, node.fetchUrl, link.text, node)
      if (added?.kind === 'article' && !listedAt.has(added.key) && page.retrievedAt) listedAt.set(added.key, page.retrievedAt)
    }
  }

  // 5 — assemble outputs.
  const categoryNodes = [...crawl.nodes.values()].filter((n) => n.kind === 'category')
  const articleNodes = [...crawl.nodes.values()].filter((n) => n.kind === 'article')
  const categoryTitle = new Map<string, string>()
  for (const c of categoryNodes) {
    const slug = categorySlugOf(c.key)
    if (!slug || categoryTitle.has(slug)) continue
    categoryTitle.set(slug, bestAnchorTitle(c.anchorTexts) ?? c.pageTitle ?? titleFromSlug(slug))
  }
  const categories: InventoryCategory[] = categoryNodes
    .filter((c) => !new URL(c.key).search)
    .map((c) => {
      const slug = categorySlugOf(c.key)!
      return {
        url: c.key,
        slug,
        title: categoryTitle.get(slug) ?? titleFromSlug(slug),
        httpStatus: c.status,
        fetched: c.fetched,
        retrievedAt: c.retrievedAt,
        articleCount: articleNodes.filter((a) => categorySlugOf(a.key) === slug).length,
      }
    })
  const articles: InventoryArticle[] = articleNodes
    .map((a): InventoryArticle => {
      const slug = categorySlugOf(a.key) ?? null
      const crumb = a.breadcrumbs && a.breadcrumbs.length >= 2 ? a.breadcrumbs[a.breadcrumbs.length - 2]!.name : undefined
      const anchorTitle = bestAnchorTitle(a.anchorTexts) ?? bestAnchorTitle(a.inlineAnchorTexts)
      const lastSegment = new URL(a.key).pathname.split('/').pop() ?? ''
      const title = a.pageTitle ?? anchorTitle ?? titleFromSlug(lastSegment)
      return {
        url: a.key,
        fetchUrl: a.fetchUrl,
        title,
        titleSource: a.pageTitle ? 'page' : anchorTitle ? 'anchor' : 'slug',
        sourceCategory: crumb ?? (slug ? (categoryTitle.get(slug) ?? titleFromSlug(slug)) : null),
        sourceCategorySlug: slug,
        sourceCategorySource: crumb ? 'breadcrumb' : slug ? 'path' : null,
        httpStatus: a.status,
        fetched: a.fetched,
        retrievedAt: a.retrievedAt,
        listedAt: listedAt.get(a.key) ?? null,
        robotsAllowed: !a.robotsBlocked,
        discoveredFrom: a.discoveredFrom,
        ...(a.redirectedTo ? { redirectedTo: a.redirectedTo } : {}),
        ...(a.error ? { error: a.error } : {}),
      }
    })
    .sort((x, y) => (x.sourceCategorySlug ?? '').localeCompare(y.sourceCategorySlug ?? '') || x.url.localeCompare(y.url))

  const generatedAt = new Date().toISOString()
  // Discovery never grants reuse by itself: even if an open licence is mentioned,
  // full import requires an explicit entry in content-import/authorizations.json.
  const inventory: ContentInventory = {
    generatedAt,
    source: { name: SITE.name, origin: SITE.origin, startUrl: SITE.startUrl },
    reuse: { conclusion: 'metadata-only', reason: termsSummary },
    categories,
    articles,
  }
  const inaccessible = [...categoryNodes, ...articleNodes]
    .filter((n) => n.fetched && n.status !== null && (n.status < 200 || n.status >= 300) && !n.redirectedTo)
    .map((n) => ({ url: n.key, httpStatus: n.status, ...(n.error ? { error: n.error } : {}) }))
  const listedOnly = articles.filter((a) => !a.fetched)
  if (crawl.budgetExhausted) {
    notes.push(
      `Request cap (${opts.maxRequests}) reached: ${listedOnly.length} article(s) are recorded from category listings only. Rerun the script to continue — cached pages are not refetched.`,
    )
  }
  notes.push('Only URLs, titles, categories, HTTP statuses and timestamps are stored. No article text or images are stored or reproduced.')
  notes.push('Teaser paragraphs inside listing cards are discarded at extraction time; only card headings are kept as titles.')

  const robotsDisallows = groups.flatMap((g) => g.rules.filter((r) => r.type === 'disallow').map((r) => r.pattern))
  const report: DiscoveryReport = {
    generatedAt,
    durationSeconds: Math.round((Date.now() - started) / 1000),
    userAgent: USER_AGENT,
    source: inventory.source,
    robots: {
      url: robotsUrl,
      httpStatus: robotsNode.status,
      retrievedAt: robotsNode.retrievedAt,
      groupsApplyingToUs: groups.length
        ? groups.map((g) => g.agents.join(', ')).join(' | ')
        : 'none (no "*" group and no group naming our product token)',
      crawlDelaySeconds: crawlDelay ?? null,
      effectiveDelayMs: fetcher.minDelayMs,
      sitemaps: crawl.robots.sitemaps,
      disallowRulesForUs: robotsDisallows,
      note: robotsNote,
    },
    limits: { maxRequests: opts.maxRequests, maxRetries: 3, timeoutMs: 20_000, cacheTtlHours: opts.cacheTtlHours },
    requests: {
      network: fetcher.requestCount,
      retries: fetcher.retryCount,
      servedFromCache: crawl.servedFromCache,
      byStatus: fetcher.statusCounts,
      budgetExhausted: crawl.budgetExhausted,
    },
    counts: {
      categories: categories.length,
      articles: articles.length,
      articlesFetched: articles.filter((a) => a.fetched).length,
      articlesListedOnly: listedOnly.length,
      robotsBlocked: articles.filter((a) => !a.robotsAllowed).length,
      inaccessible: inaccessible.length,
    },
    robotsBlocked: [...crawl.nodes.values()].filter((n) => n.robotsBlocked).map((n) => n.key),
    inaccessible,
    failures: crawl.failures,
    terms: {
      checked: policyChecks,
      explicitLicenceFound,
      conclusion: 'metadata-only',
      summary: termsSummary,
    },
    notes,
  }

  await mkdir(DOCS, { recursive: true })
  await writeFile(path.join(DOCS, 'content-inventory.json'), `${JSON.stringify(inventory, null, 2)}\n`)
  await writeFile(path.join(DOCS, 'content-inventory.csv'), inventoryToCsv(inventory))
  await writeFile(path.join(DOCS, 'content-discovery-report.json'), `${JSON.stringify(report, null, 2)}\n`)
  await writeFile(path.join(DOCS, 'content-inventory.md'), inventoryToMarkdown(inventory, report))
  console.log(
    `[discover] ${categories.length} categories, ${articles.length} articles (${report.counts.articlesFetched} fetched, ${listedOnly.length} listed-only); ` +
      `${fetcher.requestCount} network requests, ${crawl.servedFromCache} cache hits, ${report.durationSeconds}s.`,
  )
}

main().catch((error: unknown) => {
  console.error('[discover] failed:', error)
  process.exitCode = 1
})
