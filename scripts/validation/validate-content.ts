/**
 * npm run validate:content [-- --strict]
 *
 * Reads every JSON file under src/content with fs, validates it with the Zod
 * schemas from src/lib/schemas.ts, runs the shared cross-reference checks
 * (findReferenceErrors from src/lib/content.ts) plus editorial checks, prints
 * a report and exits non-zero on errors (or on warnings with --strict).
 */
import { findReferenceErrors } from '../../src/lib/content'
import {
  learningPathFindings,
  searchFindings,
  sourceIndexFindings,
  sourceReferenceFindings,
  topicPathFindings,
  topicStatusFindings,
  type Finding,
} from './checks'
import { loadContent, loadModelManifest, readLabIds } from './load-content'

const strict = process.argv.includes('--strict')
const content = loadContent()
const labIds = readLabIds()

const findings: Finding[] = [
  ...content.errors.map((e) => ({ ...e, level: 'error' as const })),
  ...findReferenceErrors(content, labIds.length ? { labIds } : {}).map((e) => ({ ...e, level: 'error' as const })),
  ...topicPathFindings(content.topicFiles, content.topics),
  ...content.topics.flatMap(topicStatusFindings),
  ...searchFindings(content.topics),
  ...sourceIndexFindings(content.sourceArticles, new Set(content.categories.map((c) => c.id))),
  ...learningPathFindings(content.learningPaths, new Set(content.topics.map((t) => t.id))),
]
const indexedHosts = new Set(content.sourceArticles.map((a) => new URL(a.url).hostname))
findings.push(...content.topics.flatMap((t) => sourceReferenceFindings(t, content.sourceArticles, indexedHosts)))
content.unknownFiles.forEach((file) => findings.push({ level: 'warning', file, message: 'JSON file is not loaded by any content collection' }))
if (!labIds.length) findings.push({ level: 'warning', file: 'src/features/labs/registry.ts', message: 'no lab ids found; labId references were not checked' })

const manifest = loadModelManifest()
if (manifest.error) findings.push({ level: 'error', file: 'public/models/manifest.json', message: manifest.error })

/* ---------------------------------------------------------------- report */
const pad = (s: string | number, n: number) => String(s).padEnd(n)
console.log('\nAutoVerse content validation\n')
console.log(`  categories        ${content.categories.length}`)
console.log(`  topics            ${content.topics.length}`)
const countStatus = (status: string) => content.topics.filter((t) => t.contentStatus === status).length
console.log(`    complete ${countStatus('complete')} · draft ${countStatus('draft')} · outline ${countStatus('outline')}`)
console.log(`  components        ${content.components.length}`)
console.log(`  system map        ${content.systemMap ? `${content.systemMap.nodes.length} nodes, ${content.systemMap.layouts.length} layouts` : 'none'}`)
console.log(`  source articles   ${content.sourceArticles.length}`)
console.log(`  learning paths    ${content.learningPaths.length}`)
console.log(`  lab ids           ${labIds.join(', ') || '—'}`)
console.log(`  model manifest    ${manifest.manifest ? `${manifest.manifest.assets.length} assets` : manifest.error ? 'INVALID' : 'not present'}`)

console.log('\n  Topics per category')
for (const c of content.categories) {
  const n = content.topics.filter((t) => t.categoryId === c.id).length
  console.log(`    ${pad(c.id, 22)} ${n}`)
}

const errors = findings.filter((f) => f.level === 'error')
const warnings = findings.filter((f) => f.level === 'warning')
if (warnings.length) {
  console.log(`\n  Warnings (${warnings.length})`)
  warnings.forEach((w) => console.log(`    ! ${w.file}: ${w.message}`))
}
if (errors.length) {
  console.log(`\n  Errors (${errors.length})`)
  errors.forEach((e) => console.log(`    ✗ ${e.file}: ${e.message}`))
}

const failed = errors.length > 0 || (strict && warnings.length > 0)
console.log(`\n${failed ? '✗ Content validation failed' : '✓ Content is valid'} — ${errors.length} error(s), ${warnings.length} warning(s)${strict ? ' [strict]' : ''}\n`)
process.exitCode = failed ? 1 : 0
