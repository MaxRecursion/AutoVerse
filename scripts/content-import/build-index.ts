/**
 * Pure core of the import step: inventory articles + explicit authorisations
 * → SourceArticle records (src/content/source-index.json). Network access for
 * authorised imports lives in import.ts; this module only decides statuses.
 */
import { decodeEntities } from '../content-discovery/extract'
import type { InventoryArticle } from '../content-discovery/inventory'
import type { SourceArticle } from '../../src/lib/schemas'
import { findAuthorization, type Authorization } from './authorizations'
import { mapToCategory } from './mapping'

export const METADATA_ONLY_LICENCE = 'No reuse licence identified — linked only'

export type ImportPlanItem =
  | { kind: 'record'; article: SourceArticle }
  /** Authorised and reachable: import.ts fetches it and then calls `importedArticle` or `failedImport`. */
  | { kind: 'import'; source: InventoryArticle; authorization: Authorization; article: SourceArticle }

const ok = (status: number | null) => status !== null && status >= 200 && status < 300

function baseRecord(a: InventoryArticle): SourceArticle {
  const mapped = mapToCategory(a.sourceCategorySlug, a.url)
  return {
    url: a.url,
    title: a.title.trim(),
    ...(a.sourceCategory ? { sourceCategory: a.sourceCategory } : {}),
    ...(mapped ? { mappedCategoryId: mapped } : {}),
    importStatus: 'metadata-only',
    ...((a.retrievedAt ?? a.listedAt) ? { retrievedAt: (a.retrievedAt ?? a.listedAt)! } : {}),
    licence: METADATA_ONLY_LICENCE,
  }
}

/** Decide what happens to each discovered article. Never performs I/O. */
export function planImport(articles: readonly InventoryArticle[], authorizations: readonly Authorization[]): ImportPlanItem[] {
  const seen = new Set<string>()
  const plan: ImportPlanItem[] = []
  for (const a of articles) {
    if (seen.has(a.url)) continue
    seen.add(a.url)
    const record = baseRecord(a)

    if (!a.robotsAllowed) {
      plan.push({ kind: 'record', article: { ...record, importStatus: 'blocked-by-robots', note: 'Disallowed by robots.txt for our user agent; never requested.' } })
      continue
    }
    if (a.fetched && !ok(a.httpStatus)) {
      const reason = a.error ?? (a.httpStatus === null ? 'no response' : `HTTP ${a.httpStatus}`)
      plan.push({ kind: 'record', article: { ...record, importStatus: 'failed', note: `Article page was not accessible (${reason}).` } })
      continue
    }

    const authorization = findAuthorization(a.url, authorizations)
    if (authorization) {
      plan.push({ kind: 'import', source: a, authorization, article: record })
      continue
    }

    plan.push({
      kind: 'record',
      article: a.fetched
        ? record
        : { ...record, note: 'Seen on the category index only; the article page itself was not requested (crawl request cap).' },
    })
  }
  return plan
}

export function licenceLabel(auth: Authorization): string {
  return auth.licence.url ? `${auth.licence.name} (${auth.licence.url})` : auth.licence.name
}

export function importedArticle(base: SourceArticle, auth: Authorization, retrievedAt: string): SourceArticle {
  return {
    ...base,
    importStatus: 'imported',
    retrievedAt,
    licence: licenceLabel(auth),
    note: `Imported under permission from ${auth.grantedBy} (${auth.grantedAt}); attribution: ${auth.attribution}`,
  }
}

export function failedImport(base: SourceArticle, reason: string): SourceArticle {
  return { ...base, importStatus: 'failed', note: `Authorised import failed: ${reason}` }
}

/** Stable output order: mapped category, then source category, then title. */
export function sortSourceArticles(list: SourceArticle[]): SourceArticle[] {
  const key = (a: SourceArticle) => [a.mappedCategoryId ?? '~', a.sourceCategory ?? '~', a.title.toLowerCase(), a.url]
  return [...list].sort((x, y) => {
    const a = key(x)
    const b = key(y)
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! < b[i]! ? -1 : 1
    return 0
  })
}

export interface ImportCounts {
  total: number
  byStatus: Record<string, number>
  byCategory: Record<string, number>
}

export function countArticles(list: readonly SourceArticle[]): ImportCounts {
  const byStatus: Record<string, number> = {}
  const byCategory: Record<string, number> = {}
  for (const a of list) {
    byStatus[a.importStatus] = (byStatus[a.importStatus] ?? 0) + 1
    const c = a.mappedCategoryId ?? 'unmapped'
    byCategory[c] = (byCategory[c] ?? 0) + 1
  }
  return { total: list.length, byStatus, byCategory }
}

/**
 * Readable text of an authorised article for editorial use (never published
 * automatically): the <article> or <main> element when present, else <body>,
 * minus navigation, scripts and forms. Paragraph breaks are kept.
 */
export function extractArticleText(html: string): string {
  const pick = (tag: string) => new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(html)?.[1]
  const region = pick('article') ?? pick('main') ?? pick('body') ?? html
  const cleaned = region
    .replace(/<(script|style|noscript|svg|nav|header|footer|form|aside|template)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|\/p|\/h[1-6]|\/li|\/div|\/section)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
  return decodeEntities(cleaned)
    .split('\n')
    .map((line) => line.replace(/[ \t\f\v\u00a0]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n')
}
