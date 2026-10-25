import { describe, expect, it } from 'vitest'
import { PoliteFetcher, RequestBudgetExceeded, backoffDelay, isFailure, parseRetryAfter } from './fetcher'
import { inventoryToCsv, roundRobin, toCsv, type ContentInventory } from './inventory'

/** Fake clock + sleep so throttling can be asserted without waiting. */
function harness(responses: Array<Response | Error>) {
  let now = 1_000_000
  const sleeps: number[] = []
  const requestTimes: number[] = []
  const seenHeaders: Array<Record<string, string>> = []
  const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
    requestTimes.push(now)
    seenHeaders.push(init?.headers as Record<string, string>)
    now += 50 // network latency
    const next = responses.shift()
    if (!next) throw new Error('no more fake responses')
    if (next instanceof Error) throw next
    return next
  }) as typeof fetch
  const fetcher = new PoliteFetcher({
    userAgent: 'TestBot/1.0',
    minDelayMs: 2000,
    maxRequests: 5,
    maxRetries: 2,
    fetchImpl,
    now: () => now,
    sleep: async (ms) => {
      sleeps.push(ms)
      now += ms
    },
  })
  return { fetcher, sleeps, requestTimes, seenHeaders }
}

describe('PoliteFetcher', () => {
  it('sends the descriptive user agent and spaces requests by the minimum delay', async () => {
    const h = harness([new Response('a', { status: 200 }), new Response('b', { status: 200 })])
    await h.fetcher.get('https://x.test/a')
    await h.fetcher.get('https://x.test/b')
    expect(h.seenHeaders[0]!['User-Agent']).toBe('TestBot/1.0')
    expect(h.requestTimes[1]! - h.requestTimes[0]!).toBeGreaterThanOrEqual(2000)
    expect(h.fetcher.requestCount).toBe(2)
  })

  it('retries 429/5xx with backoff, honouring Retry-After, and counts every attempt', async () => {
    const h = harness([
      new Response('', { status: 503 }),
      new Response('', { status: 429, headers: { 'retry-after': '7' } }),
      new Response('<p>ok</p>', { status: 200, headers: { 'content-type': 'text/html' } }),
    ])
    const res = await h.fetcher.get('https://x.test/a')
    expect(isFailure(res)).toBe(false)
    if (!isFailure(res)) {
      expect(res.status).toBe(200)
      expect(res.attempts).toBe(3)
      expect(res.body).toBe('<p>ok</p>')
    }
    expect(h.fetcher.retryCount).toBe(2)
    expect(h.sleeps).toContain(2000) // first backoff = base delay
    expect(h.sleeps).toContain(7000) // Retry-After honoured
  })

  it('returns the final error status once retries are used up', async () => {
    const h = harness([new Response('', { status: 500 }), new Response('', { status: 500 }), new Response('', { status: 500 })])
    const res = await h.fetcher.get('https://x.test/a')
    expect(!isFailure(res) && res.status).toBe(500)
  })

  it('reports network errors as failures after retrying', async () => {
    const h = harness([new Error('ECONNRESET'), new Error('ECONNRESET'), new Error('ECONNRESET')])
    const res = await h.fetcher.get('https://x.test/a')
    expect(isFailure(res) && res.error).toBe('ECONNRESET')
  })

  it('does not follow redirects itself and resolves Location', async () => {
    const h = harness([new Response(null, { status: 301, headers: { location: '/b' } })])
    const res = await h.fetcher.get('https://x.test/a')
    expect(!isFailure(res) && res.location).toBe('https://x.test/b')
  })

  it('enforces the request cap', async () => {
    const h = harness(Array.from({ length: 6 }, () => new Response('x', { status: 200 })))
    for (let i = 0; i < 5; i++) await h.fetcher.get(`https://x.test/${i}`)
    await expect(h.fetcher.get('https://x.test/6')).rejects.toBeInstanceOf(RequestBudgetExceeded)
    expect(h.fetcher.remaining).toBe(0)
  })
})

describe('retry helpers', () => {
  it('parses Retry-After seconds and dates', () => {
    expect(parseRetryAfter('5', 0)).toBe(5000)
    expect(parseRetryAfter('Thu, 01 Jan 1970 00:00:10 GMT', 4000)).toBe(6000)
    expect(parseRetryAfter('soon', 0)).toBeUndefined()
    expect(parseRetryAfter(null, 0)).toBeUndefined()
  })

  it('doubles the backoff each attempt up to the cap', () => {
    expect([1, 2, 3, 4].map((a) => backoffDelay(a, 2000, 10_000))).toEqual([2000, 4000, 8000, 10_000])
  })
})

describe('inventory serialisation', () => {
  it('escapes CSV cells', () => {
    expect(toCsv([{ a: 'x,y', b: 'say "hi"', c: null }], ['a', 'b', 'c'])).toBe('a,b,c\n"x,y","say ""hi""",\n')
  })

  it('writes one CSV row per category and article', () => {
    const inventory: ContentInventory = {
      generatedAt: '2026-01-01T00:00:00.000Z',
      source: { name: 'S', origin: 'https://x.test', startUrl: 'https://x.test/' },
      reuse: { conclusion: 'metadata-only', reason: 'none' },
      categories: [{ url: 'https://x.test/engine', slug: 'engine', title: 'Engine', httpStatus: 200, fetched: true, retrievedAt: 't', articleCount: 1 }],
      articles: [
        {
          url: 'https://x.test/engine/pistons',
          fetchUrl: 'https://x.test/engine/pistons.amp',
          title: 'Pistons',
          titleSource: 'page',
          sourceCategory: 'Engine',
          sourceCategorySlug: 'engine',
          sourceCategorySource: 'path',
          httpStatus: 200,
          fetched: true,
          retrievedAt: 't',
          listedAt: 't',
          robotsAllowed: true,
          discoveredFrom: [],
        },
      ],
    }
    const lines = inventoryToCsv(inventory).trim().split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[2]).toBe('article,https://x.test/engine/pistons,Pistons,Engine,200,true,t,true')
  })

  it('interleaves buckets round-robin', () => {
    expect(roundRobin([[1, 2, 3], [4], [5, 6]])).toEqual([1, 4, 5, 2, 6, 3])
    expect(roundRobin([])).toEqual([])
  })
})
