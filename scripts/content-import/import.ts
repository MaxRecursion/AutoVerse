/**
 * npm run content:import [-- --dry-run] [--max-requests=N]
 *
 * Reads docs/content-inventory.json (from content:discover) and
 * scripts/content-import/authorizations.json, then writes
 * src/content/source-index.json — one SourceArticle per discovered article,
 * validated with SourceArticleSchema.
 *
 *  - Articles matched by an explicit authorisation are fetched (politely,
 *    robots-checked) and their readable text is saved for editorial review in
 *    scripts/content-import/imported/<host>/<path>.json together with the
 *    licence and attribution. Imported text is never published automatically.
 *  - Every other article becomes a metadata-only record: title, link, source
 *    category, mapped AutoVerse category and retrieval time. No text.
 *
 * With the default (empty) authorisations file this makes no network
 * requests at all.
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SourceArticleSchema, type SourceArticle } from '../../src/lib/schemas'
import { PoliteFetcher, isFailure } from '../content-discovery/fetcher'
import type { ContentInventory } from '../content-discovery/inventory'
import { checkRobots, crawlDelayFor, parseRobots, type ParsedRobots } from '../content-discovery/robots'
import { parseAuthorizations } from './authorizations'
import {
  countArticles,
  extractArticleText,
  failedImport,
  importedArticle,
  licenceLabel,
  planImport,
  sortSourceArticles,
  type ImportPlanItem,
} from './build-index'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../..')
const INVENTORY = path.join(ROOT, 'docs/content-inventory.json')
const AUTHORIZATIONS = path.join(HERE, 'authorizations.json')
const OUTPUT = path.join(ROOT, 'src/content/source-index.json')
const IMPORTED_DIR = path.join(HERE, 'imported')
const USER_AGENT = 'AutoVerseContentImport/0.1 (+educational project; contact: repo owner)'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const maxRequests = Number(args.find((a) => a.startsWith('--max-requests='))?.split('=')[1] ?? 60)

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, 'utf8'))
}

async function loadRobots(fetcher: PoliteFetcher, origin: string): Promise<ParsedRobots | null> {
  const res = await fetcher.get(`${origin}/robots.txt`, 'text/plain,*/*;q=0.5')
  if (isFailure(res)) return null
  // A missing robots.txt (4xx) means no restrictions; 5xx means "assume disallowed".
  if (res.status >= 500) return null
  return parseRobots(res.ok ? (res.body ?? '') : '')
}

function importedFileFor(url: string): string {
  const u = new URL(url)
  const parts = u.pathname.split('/').filter(Boolean).map((p) => p.replace(/[^a-z0-9._-]/gi, '_'))
  return path.join(IMPORTED_DIR, u.hostname, ...(parts.length ? parts : ['index'])) + '.json'
}

async function runImports(items: Extract<ImportPlanItem, { kind: 'import' }>[]): Promise<SourceArticle[]> {
  if (!items.length) return []
  const fetcher = new PoliteFetcher({ userAgent: USER_AGENT, minDelayMs: 2000, maxRequests, log: (m) => console.log(`[import] ${m}`) })
  const robotsByOrigin = new Map<string, ParsedRobots | null>()
  const out: SourceArticle[] = []

  for (const item of items) {
    const { source, authorization, article } = item
    const origin = new URL(source.url).origin
    if (!robotsByOrigin.has(origin)) {
      const robots = await loadRobots(fetcher, origin)
      robotsByOrigin.set(origin, robots)
      const delay = robots ? crawlDelayFor(robots, USER_AGENT) : undefined
      if (delay) fetcher.minDelayMs = Math.max(fetcher.minDelayMs, delay * 1000)
    }
    const robots = robotsByOrigin.get(origin)
    const target = new URL(source.fetchUrl || source.url)
    if (!robots) {
      out.push(failedImport(article, 'robots.txt could not be read; not fetching'))
      continue
    }
    if (!checkRobots(robots, USER_AGENT, target.pathname + target.search).allowed) {
      out.push({ ...article, importStatus: 'blocked-by-robots', note: 'Authorised, but disallowed by robots.txt; not fetched.' })
      continue
    }
    if (dryRun) {
      out.push({ ...article, note: `Would import under ${licenceLabel(authorization)} (dry run).` })
      continue
    }
    const res = await fetcher.get(target.toString())
    if (isFailure(res) || !res.ok || !res.body) {
      const reason = isFailure(res) ? res.error : `HTTP ${res.status}`
      out.push(failedImport(article, reason))
      continue
    }
    const retrievedAt = new Date().toISOString()
    const file = importedFileFor(source.url)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(
      file,
      `${JSON.stringify(
        {
          url: source.url,
          title: article.title,
          retrievedAt,
          licence: authorization.licence,
          grantedBy: authorization.grantedBy,
          grantedAt: authorization.grantedAt,
          evidence: authorization.evidence,
          attribution: authorization.attribution,
          text: extractArticleText(res.body),
        },
        null,
        2,
      )}\n`,
    )
    out.push(importedArticle(article, authorization, retrievedAt))
  }
  console.log(`[import] ${fetcher.requestCount} network request(s) for authorised imports`)
  return out
}

async function main() {
  if (!existsSync(INVENTORY)) throw new Error('docs/content-inventory.json not found — run `npm run content:discover` first')
  const inventory = (await readJson(INVENTORY)) as ContentInventory
  const authorizations = existsSync(AUTHORIZATIONS) ? parseAuthorizations(await readJson(AUTHORIZATIONS)) : []

  const plan = planImport(inventory.articles, authorizations)
  const records = plan.filter((p): p is Extract<ImportPlanItem, { kind: 'record' }> => p.kind === 'record').map((p) => p.article)
  const imports = plan.filter((p): p is Extract<ImportPlanItem, { kind: 'import' }> => p.kind === 'import')
  const articles = sortSourceArticles([...records, ...(await runImports(imports))])

  const invalid = articles.flatMap((a) => {
    const res = SourceArticleSchema.safeParse(a)
    return res.success ? [] : [`${a.url}: ${res.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`]
  })
  if (invalid.length) {
    invalid.forEach((m) => console.error(`[import] invalid record ${m}`))
    throw new Error(`${invalid.length} record(s) failed SourceArticleSchema; nothing written`)
  }

  const counts = countArticles(articles)
  console.log(`\n[import] ${authorizations.length} authorisation(s); ${imports.length} article(s) eligible for full import`)
  console.log(`[import] ${counts.total} source articles`)
  for (const [status, n] of Object.entries(counts.byStatus).sort()) console.log(`  ${status.padEnd(20)} ${n}`)
  console.log('[import] by AutoVerse category')
  for (const [category, n] of Object.entries(counts.byCategory).sort()) console.log(`  ${category.padEnd(20)} ${n}`)

  if (dryRun) {
    console.log('\n[import] dry run — src/content/source-index.json not written')
    return
  }
  await writeFile(OUTPUT, `${JSON.stringify(articles, null, 2)}\n`)
  console.log(`\n[import] wrote ${path.relative(ROOT, OUTPUT)}`)
}

main().catch((error: unknown) => {
  console.error('[import] failed:', error instanceof Error ? error.message : error)
  process.exitCode = 1
})
