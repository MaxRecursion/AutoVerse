/**
 * Re-render docs/content-inventory.md from the existing JSON outputs without
 * crawling again: npx tsx scripts/content-discovery/render-markdown.ts
 * (discover.ts writes the same file at the end of every crawl).
 */
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { inventoryToMarkdown, type ContentInventory, type DiscoveryReport } from './inventory'

const DOCS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../docs')

async function main() {
  const inventory = JSON.parse(await readFile(path.join(DOCS, 'content-inventory.json'), 'utf8')) as ContentInventory
  const report = JSON.parse(await readFile(path.join(DOCS, 'content-discovery-report.json'), 'utf8')) as DiscoveryReport
  await writeFile(path.join(DOCS, 'content-inventory.md'), inventoryToMarkdown(inventory, report))
  console.log(`[render-markdown] wrote docs/content-inventory.md (${inventory.articles.length} articles)`)
}

main().catch((error: unknown) => {
  console.error('[render-markdown] failed:', error)
  process.exitCode = 1
})
