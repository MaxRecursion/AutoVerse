/**
 * Polite HTTP client for content discovery:
 *  - descriptive User-Agent, no cookies, no auth, no JS execution;
 *  - a fixed minimum gap between *every* request (including retries and
 *    redirect hops);
 *  - exponential backoff on 429 / 5xx / network errors, honouring Retry-After;
 *  - a hard cap on total network requests.
 *
 * Network, clock and sleep are injectable so the policy is unit-testable.
 */

export interface RawResponse {
  requestedUrl: string
  status: number
  ok: boolean
  contentType?: string
  /** Redirect target (absolute), for 3xx responses. */
  location?: string
  /** Only text bodies are read; callers must not persist article bodies. */
  body?: string
  /** Network attempts consumed by this call (1 + retries). */
  attempts: number
}

export interface FetchFailure {
  requestedUrl: string
  error: string
  status?: number
  attempts: number
}

export class RequestBudgetExceeded extends Error {
  constructor(public readonly limit: number) {
    super(`request budget of ${limit} exhausted`)
  }
}

export interface PoliteFetcherOptions {
  userAgent: string
  /** Minimum gap between the start of consecutive requests. */
  minDelayMs: number
  maxRequests: number
  maxRetries?: number
  timeoutMs?: number
  /** Cap for any single backoff / Retry-After wait. */
  maxBackoffMs?: number
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  now?: () => number
  log?: (message: string) => void
}

const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504])

/** Parse a Retry-After header (seconds or HTTP date) into milliseconds. */
export function parseRetryAfter(value: string | null | undefined, nowMs: number): number | undefined {
  if (!value) return undefined
  const seconds = Number(value.trim())
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
  const date = Date.parse(value)
  if (Number.isFinite(date)) return Math.max(0, date - nowMs)
  return undefined
}

/** Backoff before retry `attempt` (1-based): base × 2^(attempt-1), capped. */
export function backoffDelay(attempt: number, baseMs: number, capMs: number): number {
  return Math.min(capMs, baseMs * 2 ** Math.max(0, attempt - 1))
}

export class PoliteFetcher {
  readonly userAgent: string
  minDelayMs: number
  readonly maxRequests: number
  private readonly maxRetries: number
  private readonly timeoutMs: number
  private readonly maxBackoffMs: number
  private readonly fetchImpl: typeof fetch
  private readonly sleep: (ms: number) => Promise<void>
  private readonly now: () => number
  private readonly log: (message: string) => void
  private lastRequestAt = Number.NEGATIVE_INFINITY

  /** Network requests actually sent (each retry and redirect hop counts). */
  requestCount = 0
  retryCount = 0
  readonly statusCounts: Record<string, number> = {}

  constructor(options: PoliteFetcherOptions) {
    this.userAgent = options.userAgent
    this.minDelayMs = options.minDelayMs
    this.maxRequests = options.maxRequests
    this.maxRetries = options.maxRetries ?? 3
    this.timeoutMs = options.timeoutMs ?? 20_000
    this.maxBackoffMs = options.maxBackoffMs ?? 60_000
    this.fetchImpl = options.fetchImpl ?? fetch
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
    this.now = options.now ?? Date.now
    this.log = options.log ?? (() => {})
  }

  get remaining(): number {
    return Math.max(0, this.maxRequests - this.requestCount)
  }

  private async throttle(extraWaitMs = 0): Promise<void> {
    const earliest = this.lastRequestAt + this.minDelayMs
    const wait = Math.max(earliest - this.now(), extraWaitMs, 0)
    if (wait > 0) await this.sleep(wait)
  }

  /**
   * GET one URL without following redirects (the caller decides whether a
   * redirect target is in scope and allowed by robots.txt).
   * Throws RequestBudgetExceeded when the cap is reached.
   */
  async get(url: string, accept = 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5'): Promise<RawResponse | FetchFailure> {
    let attempt = 0
    let extraWait = 0
    for (;;) {
      if (this.requestCount >= this.maxRequests) throw new RequestBudgetExceeded(this.maxRequests)
      await this.throttle(extraWait)
      attempt += 1
      this.requestCount += 1
      this.lastRequestAt = this.now()
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), this.timeoutMs)
      try {
        const res = await this.fetchImpl(url, {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
          headers: {
            'User-Agent': this.userAgent,
            Accept: accept,
            'Accept-Language': 'en',
          },
        })
        this.statusCounts[String(res.status)] = (this.statusCounts[String(res.status)] ?? 0) + 1
        this.log(`${res.status} ${url}${attempt > 1 ? ` (attempt ${attempt})` : ''}`)

        if (RETRYABLE.has(res.status) && attempt <= this.maxRetries) {
          this.retryCount += 1
          const retryAfter = parseRetryAfter(res.headers.get('retry-after'), this.now())
          extraWait = Math.min(this.maxBackoffMs, retryAfter ?? backoffDelay(attempt, Math.max(this.minDelayMs, 2000), this.maxBackoffMs))
          await res.body?.cancel().catch(() => {})
          continue
        }

        const contentType = res.headers.get('content-type') ?? undefined
        const locationHeader = res.headers.get('location')
        const location = locationHeader ? new URL(locationHeader, url).toString() : undefined
        const isText = !contentType || /text\/|html|xml|json/i.test(contentType)
        const body = isText && res.status < 300 ? await res.text() : undefined
        if (!body) await res.body?.cancel().catch(() => {})
        return {
          requestedUrl: url,
          status: res.status,
          ok: res.status >= 200 && res.status < 300,
          ...(contentType ? { contentType } : {}),
          ...(location ? { location } : {}),
          ...(body !== undefined ? { body } : {}),
          attempts: attempt,
        }
      } catch (error) {
        if (error instanceof RequestBudgetExceeded) throw error
        const message = error instanceof Error ? (error.name === 'AbortError' ? 'timeout' : error.message) : String(error)
        this.statusCounts.error = (this.statusCounts.error ?? 0) + 1
        this.log(`ERR ${url}: ${message}`)
        if (attempt <= this.maxRetries) {
          this.retryCount += 1
          extraWait = backoffDelay(attempt, Math.max(this.minDelayMs, 2000), this.maxBackoffMs)
          continue
        }
        return { requestedUrl: url, error: message, attempts: attempt }
      } finally {
        clearTimeout(timer)
      }
    }
  }
}

export const isFailure = (r: RawResponse | FetchFailure): r is FetchFailure => 'error' in r
