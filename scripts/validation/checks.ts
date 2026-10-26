/**
 * Pure editorial checks layered on top of schema + reference validation.
 * Errors break `npm run validate:content`; warnings are reported (and become
 * errors with --strict).
 */
import type { ContentError } from '../../src/lib/content'
import type { LearningPath, SourceArticle, Topic } from '../../src/lib/schemas'

export interface Finding extends ContentError {
  level: 'error' | 'warning'
}

/** Topic files live at src/content/topics/<categoryId>/<id>.json. */
export function topicPathFindings(topicFiles: Map<string, string>, topics: Topic[]): Finding[] {
  const out: Finding[] = []
  for (const t of topics) {
    const file = topicFiles.get(t.id)
    const expected = `src/content/topics/${t.categoryId}/${t.id}.json`
    if (file && file !== expected) out.push({ level: 'error', file, message: `topic file should be ${expected}` })
  }
  return out
}

/**
 * contentStatus must describe reality: "complete" means a full lesson
 * including steps, key concepts and a quiz; "outline" must still have a summary
 * and objectives so the UI has something honest to show.
 */
export function topicStatusFindings(topic: Topic): Finding[] {
  const out: Finding[] = []
  const file = `topic:${topic.id}`
  const warn = (message: string) => out.push({ level: 'warning', file, message })
  if (topic.contentStatus === 'complete') {
    if (topic.quiz.length === 0) warn('marked complete but has no quiz')
    if (topic.steps.length === 0) warn('marked complete but has no steps')
    if (topic.learningObjectives.length === 0) warn('marked complete but has no learning objectives')
    if (topic.keyConcepts.length === 0) warn('marked complete but has no key concepts')
    if (topic.misconceptions.length === 0) warn('marked complete but has no misconceptions')
  }
  if (topic.contentStatus !== 'outline' && topic.learningObjectives.length === 0) warn('has no learning objectives')
  if (topic.summary.length > 320) warn(`summary is ${topic.summary.length} chars; keep it under 320 for previews and meta descriptions`)
  if (topic.licence.name !== 'AutoVerse original content' && !topic.attribution) {
    warn(`licence "${topic.licence.name}" is not original content but no attribution is given`)
  }
  return out
}

/**
 * Search and AI answers: every lesson needs its own search title and
 * description, at least three common questions (shown on the page and
 * published as FAQPage data) and the subject it is about. Pages with the same
 * title or description compete with each other, so duplicates are errors.
 */
export function searchFindings(topics: Topic[]): Finding[] {
  const out: Finding[] = []
  const titles = new Map<string, string>()
  const descriptions = new Map<string, string>()
  for (const t of topics) {
    const file = `topic:${t.id}`
    const warn = (message: string) => out.push({ level: 'warning', file, message })
    if (!t.seo) warn('has no seo title and description')
    if (t.faq.length < 3) warn(`has ${t.faq.length} common question(s); write at least 3`)
    if (!t.about.length) warn('has no "about" subject (the Wikipedia article it explains)')
    const unique = (kind: string, value: string | undefined, seen: Map<string, string>) => {
      if (!value) return
      const other = seen.get(value)
      if (other) out.push({ level: 'error', file, message: `seo ${kind} is the same as ${other}'s` })
      else seen.set(value, t.id)
    }
    unique('title', t.seo?.title, titles)
    unique('description', t.seo?.description, descriptions)
  }
  return out
}

/**
 * Third-party links in sourceReferences must be pages the discovery tooling
 * actually confirmed (present in source-index.json with an HTTP 2xx fetch or
 * a listing on a fetched index). Unknown hosts are left to editorial review.
 */
export function sourceReferenceFindings(topic: Topic, sourceIndex: SourceArticle[], indexedHosts: Set<string>): Finding[] {
  const out: Finding[] = []
  const known = new Map(sourceIndex.map((a) => [a.url, a]))
  for (const ref of topic.sourceReferences) {
    let host: string
    try {
      host = new URL(ref.url).hostname
    } catch {
      continue
    }
    if (!indexedHosts.has(host)) continue
    const entry = known.get(ref.url)
    if (!entry) {
      out.push({ level: 'error', file: `topic:${topic.id}`, message: `source reference ${ref.url} is not in source-index.json` })
    } else if (entry.importStatus === 'failed' || entry.importStatus === 'blocked-by-robots') {
      out.push({ level: 'error', file: `topic:${topic.id}`, message: `source reference ${ref.url} is ${entry.importStatus}` })
    }
  }
  return out
}

/** Source index sanity: unique URLs and honest licence wording. */
export function sourceIndexFindings(sourceIndex: SourceArticle[], categoryIds: Set<string>): Finding[] {
  const out: Finding[] = []
  const seen = new Set<string>()
  for (const a of sourceIndex) {
    if (seen.has(a.url)) out.push({ level: 'error', file: 'source-index.json', message: `duplicate URL ${a.url}` })
    seen.add(a.url)
    if (a.mappedCategoryId && !categoryIds.has(a.mappedCategoryId)) {
      out.push({ level: 'error', file: 'source-index.json', message: `unknown mappedCategoryId "${a.mappedCategoryId}" for ${a.url}` })
    }
    if (a.importStatus === 'imported' && /no reuse licen[cs]e/i.test(a.licence)) {
      out.push({ level: 'error', file: 'source-index.json', message: `${a.url} is marked imported without a reuse licence` })
    }
  }
  return out
}

/**
 * Learning paths may name topics that are not written yet (the UI skips them),
 * so unresolved ids are warnings; duplicate path ids are errors.
 */
export function learningPathFindings(paths: LearningPath[], topicIds: Set<string>): Finding[] {
  const out: Finding[] = []
  const seen = new Set<string>()
  for (const p of paths) {
    if (seen.has(p.id)) out.push({ level: 'error', file: 'learning-paths.json', message: `duplicate path id "${p.id}"` })
    seen.add(p.id)
    const missing = p.topicIds.filter((id) => !topicIds.has(id))
    if (missing.length) {
      out.push({ level: 'warning', file: `path:${p.id}`, message: `topics not written yet: ${missing.join(', ')}` })
    }
  }
  return out
}
