import { describe, expect, it } from 'vitest'
import { inventoryToCsv, inventoryToMarkdown, roundRobin, toCsv, type ContentInventory, type DiscoveryReport } from './inventory'

const inventory: ContentInventory = {
  generatedAt: '2026-01-01T00:00:00.000Z',
  source: { name: 'Example', origin: 'https://example.com', startUrl: 'https://example.com/index.amp' },
  reuse: { conclusion: 'metadata-only', reason: 'No licence.' },
  categories: [
    { url: 'https://example.com/brakes', slug: 'brakes', title: 'Brakes', httpStatus: 200, fetched: true, retrievedAt: '2026-01-01T00:00:00.000Z', articleCount: 2 },
  ],
  articles: [
    {
      url: 'https://example.com/brakes/bleeding',
      fetchUrl: 'https://example.com/brakes/bleeding.amp',
      title: 'Bleeding | the "brakes"',
      titleSource: 'page',
      sourceCategory: 'Brakes',
      sourceCategorySlug: 'brakes',
      sourceCategorySource: 'path',
      httpStatus: 200,
      fetched: true,
      retrievedAt: '2026-01-01T00:00:00.000Z',
      listedAt: '2026-01-01T00:00:00.000Z',
      robotsAllowed: true,
      discoveredFrom: [],
    },
    {
      url: 'https://example.com/brakes/pads',
      fetchUrl: 'https://example.com/brakes/pads.amp',
      title: 'Pads',
      titleSource: 'anchor',
      sourceCategory: 'Brakes',
      sourceCategorySlug: 'brakes',
      sourceCategorySource: 'path',
      httpStatus: null,
      fetched: false,
      retrievedAt: null,
      listedAt: '2026-01-01T00:00:00.000Z',
      robotsAllowed: false,
      discoveredFrom: [],
    },
  ],
}

const report: DiscoveryReport = {
  generatedAt: inventory.generatedAt,
  durationSeconds: 10,
  userAgent: 'Test/1.0',
  source: inventory.source,
  robots: {
    url: 'https://example.com/robots.txt',
    httpStatus: 200,
    retrievedAt: null,
    groupsApplyingToUs: '*',
    crawlDelaySeconds: 5,
    effectiveDelayMs: 5000,
    sitemaps: [],
    disallowRulesForUs: [],
    note: 'ok',
  },
  limits: { maxRequests: 10, maxRetries: 3, timeoutMs: 1000, cacheTtlHours: 1 },
  requests: { network: 3, retries: 0, servedFromCache: 0, byStatus: { '200': 3 }, budgetExhausted: false },
  counts: { categories: 1, articles: 2, articlesFetched: 1, articlesListedOnly: 1, robotsBlocked: 1, inaccessible: 0 },
  robotsBlocked: [],
  inaccessible: [],
  failures: [],
  terms: { checked: [], explicitLicenceFound: false, conclusion: 'metadata-only', summary: 'No licence found.' },
  notes: [],
}

describe('inventory serialisers', () => {
  it('quotes CSV cells that contain separators or quotes', () => {
    expect(toCsv([{ a: 'x,y', b: 'say "hi"', c: null }], ['a', 'b', 'c'])).toBe('a,b,c\n"x,y","say ""hi""",\n')
  })

  it('writes one CSV row per category and article', () => {
    const lines = inventoryToCsv(inventory).trim().split('\n')
    expect(lines).toHaveLength(1 + 1 + 2)
    expect(lines[1]).toMatch(/^category,/)
    expect(lines[3]).toContain('https://example.com/brakes/pads')
  })

  it('renders markdown with escaped titles, statuses and robots flags', () => {
    const md = inventoryToMarkdown(inventory, report)
    expect(md).toContain('# Content inventory')
    expect(md).toContain('**metadata-only.**')
    expect(md).toContain('[Bleeding \\| the "brakes"](https://example.com/brakes/bleeding) — `200`')
    expect(md).toContain('[Pads](https://example.com/brakes/pads) — `listed` — blocked by robots.txt')
    expect(md).toContain('5000 ms (robots Crawl-delay: 5)')
  })

  it('interleaves buckets round-robin', () => {
    expect(roundRobin([[1, 2, 3], [4], [5, 6]])).toEqual([1, 4, 5, 2, 6, 3])
  })
})
