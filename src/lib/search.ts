import type { Category, Difficulty, Pioneer, SceneComponent, Topic } from './schemas'

/**
 * Client-side full-text search over AutoVerse content.
 *
 * Pure and framework-free: `buildSearchIndex` turns content into an inverted
 * index once, `search` ranks documents for a query. Ranking rules:
 *
 * - Fields are weighted title ≫ tags ≫ summary ≫ body.
 * - Each query token is matched exactly (1.0), as a prefix of an indexed term
 *   (0.6–0.9, longer prefixes score higher) or — for tokens of 5+ characters —
 *   within one edit (insert / delete / substitute / swap adjacent; 0.5).
 * - Every query token must match, except that queries of 3+ tokens may miss
 *   one (penalised), so natural phrasing still finds things.
 * - Whole-phrase hits in the title get a bonus.
 *
 * Tokens are lower-cased, stripped of diacritics, lightly stemmed (plural
 * endings) and a few UK/US spellings are folded together (tyre/tire).
 */

export type SearchKind = 'topic' | 'lab' | 'component' | 'category' | 'pioneer'

export const SEARCH_KINDS: readonly SearchKind[] = ['topic', 'lab', 'component', 'category', 'pioneer']

/** Minimal lab shape (features/labs registry) so this module stays free of React / three.js. */
export interface SearchableLab {
  id: string
  title: string
  shortTitle?: string
  summary: string
  systemId: string
  topicId?: string
}

export interface SearchSources {
  topics: readonly Topic[]
  categories: readonly Category[]
  labs: readonly SearchableLab[]
  components: readonly SceneComponent[]
  /** Engineers behind the parts (content/pioneers.json). Optional so callers without history content still work. */
  pioneers?: readonly Pioneer[]
}

export interface SearchDoc {
  /** Unique across kinds: `${kind}:${id}`. */
  key: string
  kind: SearchKind
  id: string
  title: string
  /** One-line description for result lists. */
  description: string
  /** In-app route the result opens. */
  href: string
  /** Categories this result belongs to (used by the category filter). */
  categoryIds: string[]
  difficulty?: Difficulty
  /** Topic with an embedded lab, or a lab itself. */
  interactive: boolean
}

export interface SearchResult {
  doc: SearchDoc
  score: number
}

export interface SearchOptions {
  kinds?: readonly SearchKind[]
  categoryId?: string
  difficulty?: Difficulty
  interactiveOnly?: boolean
  /** Maximum results (default 50). */
  limit?: number
}

export interface SearchIndex {
  docs: SearchDoc[]
  /** term → (doc index → best field weight the term appears in). */
  postings: Map<string, Map<number, number>>
  /** Vocabulary, scanned for prefix / typo matches. */
  terms: string[]
  /** Normalised titles for whole-phrase bonuses. */
  phrases: string[]
}

export const FIELD_WEIGHTS = { title: 10, tags: 6, summary: 3, body: 1 } as const
type Field = keyof typeof FIELD_WEIGHTS

const KIND_ORDER: Record<SearchKind, number> = { topic: 0, lab: 1, component: 2, category: 3, pioneer: 4 }

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'do', 'does', 'for', 'from', 'how', 'in', 'is', 'it', 'its',
  'of', 'on', 'or', 'the', 'to', 'what', 'when', 'why', 'with', 'my',
])

/** UK spelling is canonical in AutoVerse content; fold common US variants onto it. */
const SPELLING: Record<string, string> = {
  tire: 'tyre',
  gasoline: 'petrol',
  aluminum: 'aluminium',
  muffler: 'silencer',
  windshield: 'windscreen',
}

/** Lower-case, strip diacritics, fold punctuation to spaces and collapse whitespace. */
export function normalizeText(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** Very light stemmer: plural endings only, so "valves" ≡ "valve" and "batteries" ≡ "battery". */
export function stem(token: string): string {
  let t = token
  if (t.length > 4 && t.endsWith('ies')) t = `${t.slice(0, -3)}y`
  else if (t.length > 4 && /(?:x|ch|sh|ss)es$/.test(t)) t = t.slice(0, -2)
  else if (t.length > 4 && t.endsWith('s') && !/(?:ss|us|is)$/.test(t)) t = t.slice(0, -1)
  return SPELLING[t] ?? t
}

/** Split text into normalised, stemmed tokens (stop words kept — see `queryTokens`). */
export function tokenize(text: string): string[] {
  const norm = normalizeText(text)
  return norm ? norm.split(' ').map(stem) : []
}

/** Query tokens: stop words dropped unless the query consists only of stop words. Deduplicated. */
export function queryTokens(query: string): string[] {
  const all = tokenize(query)
  const meaningful = all.filter((t) => !STOP_WORDS.has(t))
  return [...new Set(meaningful.length ? meaningful : all)]
}

/** True when `a` and `b` differ by at most one insertion, deletion, substitution or adjacent swap. */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true
  const la = a.length
  const lb = b.length
  if (Math.abs(la - lb) > 1) return false
  if (la === lb) {
    let i = 0
    while (i < la && a[i] === b[i]) i++
    if (i === la) return true
    // Substitution: the rest must match after skipping one char in both.
    if (a.slice(i + 1) === b.slice(i + 1)) return true
    // Transposition of two adjacent characters.
    return i + 1 < la && a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2)
  }
  const [s, l] = la < lb ? [a, b] : [b, a]
  let i = 0
  while (i < s.length && s[i] === l[i]) i++
  return s.slice(i) === l.slice(i + 1)
}

const MIN_PREFIX = 2
const MIN_TYPO = 5

/** Match quality of an indexed term for a query token (0 = no match). */
export function matchQuality(queryToken: string, term: string): number {
  if (term === queryToken) return 1
  if (queryToken.length >= MIN_PREFIX && term.startsWith(queryToken)) return 0.6 + 0.3 * (queryToken.length / term.length)
  if (queryToken.length >= MIN_TYPO && withinOneEdit(queryToken, term)) return 0.5
  return 0
}

interface DocInput {
  doc: SearchDoc
  fields: Partial<Record<Field, string[]>>
}

const nonEmpty = (xs: (string | undefined)[]) => xs.filter((x): x is string => !!x)

function topicDoc(t: Topic): DocInput {
  return {
    doc: {
      key: `topic:${t.id}`,
      kind: 'topic',
      id: t.id,
      title: t.title,
      description: t.summary,
      href: `/topics/${t.slug}`,
      categoryIds: [t.categoryId],
      difficulty: t.difficulty,
      interactive: !!t.labId,
    },
    fields: {
      title: [t.title],
      tags: t.tags,
      summary: [t.summary],
      body: [
        ...t.learningObjectives,
        t.beginnerExplanation,
        t.technicalExplanation,
        ...t.steps.map((s) => s.title),
        ...t.keyConcepts.map((k) => k.term),
      ],
    },
  }
}

function categoryDoc(c: Category): DocInput {
  return {
    doc: {
      key: `category:${c.id}`,
      kind: 'category',
      id: c.id,
      title: c.title,
      description: c.summary,
      href: `/learn/${c.slug}`,
      categoryIds: [c.id],
      interactive: false,
    },
    fields: { title: [c.title], summary: [c.summary] },
  }
}

function labDoc(l: SearchableLab, categories: readonly Category[]): DocInput {
  return {
    doc: {
      key: `lab:${l.id}`,
      kind: 'lab',
      id: l.id,
      title: l.title,
      description: l.summary,
      href: `/labs/${l.id}`,
      categoryIds: categories.filter((c) => c.systemId === l.systemId).map((c) => c.id),
      interactive: true,
    },
    fields: { title: nonEmpty([l.title, l.shortTitle]), tags: [l.systemId, 'lab', 'simulation'], summary: [l.summary] },
  }
}

/** Where a component result leads: its first existing related topic, else its system's lab, else nowhere. */
function componentHref(c: SceneComponent, src: SearchSources, topicById: Map<string, Topic>): { href: string; topic?: Topic } | null {
  const topic =
    c.relatedTopicIds.map((id) => topicById.get(id)).find((t): t is Topic => !!t) ?? src.topics.find((t) => t.componentIds.includes(c.id))
  if (topic) return { href: `/topics/${topic.slug}`, topic }
  const lab = src.labs.find((l) => l.systemId === c.systemId)
  return lab ? { href: `/labs/${lab.id}` } : null
}

function componentDoc(c: SceneComponent, src: SearchSources, topicById: Map<string, Topic>): DocInput | null {
  const target = componentHref(c, src, topicById)
  if (!target) return null
  const categoryIds = new Set(src.categories.filter((cat) => cat.systemId === c.systemId).map((cat) => cat.id))
  if (target.topic) categoryIds.add(target.topic.categoryId)
  return {
    doc: {
      key: `component:${c.id}`,
      kind: 'component',
      id: c.id,
      title: c.name,
      description: c.description,
      href: target.href,
      categoryIds: [...categoryIds],
      interactive: !target.topic || !!target.topic.labId,
    },
    fields: {
      title: [c.name],
      tags: [c.systemId, ...c.annotations.map((a) => a.label)],
      summary: [c.description],
      body: nonEmpty([c.technical, ...c.annotations.map((a) => a.text)]),
    },
  }
}

function pioneerDoc(p: Pioneer, topicById: Map<string, Topic>): DocInput {
  const categoryIds = new Set([p.categoryId, ...p.topicIds.map((t) => topicById.get(t)?.categoryId).filter((c): c is string => !!c)])
  return {
    doc: {
      key: `pioneer:${p.id}`,
      kind: 'pioneer',
      id: p.id,
      title: p.name,
      description: `${p.year} · ${p.headline}`,
      href: `/pioneers?focus=${p.id}`,
      categoryIds: [...categoryIds],
      interactive: false,
    },
    fields: {
      title: [p.name],
      tags: ['engineer', 'inventor', 'history', 'pioneer', p.role, p.year],
      summary: [p.headline],
      body: nonEmpty([p.story, p.caution]),
    },
  }
}

export function buildSearchIndex(src: SearchSources): SearchIndex {
  const topicById = new Map(src.topics.map((t) => [t.id, t]))
  const inputs: DocInput[] = [
    ...src.topics.map(topicDoc),
    ...src.labs.map((l) => labDoc(l, src.categories)),
    ...src.components.map((c) => componentDoc(c, src, topicById)).filter((d): d is DocInput => !!d),
    ...src.categories.map(categoryDoc),
    ...(src.pioneers ?? []).map((p) => pioneerDoc(p, topicById)),
  ]

  const postings = new Map<string, Map<number, number>>()
  inputs.forEach(({ fields }, docIndex) => {
    for (const field of Object.keys(fields) as Field[]) {
      const weight = FIELD_WEIGHTS[field]
      for (const text of fields[field] ?? []) {
        for (const term of tokenize(text)) {
          let byDoc = postings.get(term)
          if (!byDoc) postings.set(term, (byDoc = new Map()))
          if ((byDoc.get(docIndex) ?? 0) < weight) byDoc.set(docIndex, weight)
        }
      }
    }
  })

  return {
    docs: inputs.map((i) => i.doc),
    postings,
    terms: [...postings.keys()],
    phrases: inputs.map((i) => normalizeText(i.doc.title)),
  }
}

function passesFilters(doc: SearchDoc, opts: SearchOptions): boolean {
  if (opts.kinds && !opts.kinds.includes(doc.kind)) return false
  if (opts.categoryId && !doc.categoryIds.includes(opts.categoryId)) return false
  if (opts.difficulty && doc.difficulty !== opts.difficulty) return false
  if (opts.interactiveOnly && !doc.interactive) return false
  return true
}

/** Rank documents for `query`. An empty query returns no results. */
export function search(index: SearchIndex, query: string, opts: SearchOptions = {}): SearchResult[] {
  const tokens = queryTokens(query)
  if (!tokens.length) return []

  const allowed = index.docs.map((d) => passesFilters(d, opts))
  // perToken[i] : doc index → best weighted match for token i
  const perToken = tokens.map((qt) => {
    const best = new Map<number, number>()
    for (const term of index.terms) {
      const quality = matchQuality(qt, term)
      if (!quality) continue
      for (const [docIndex, weight] of index.postings.get(term) ?? []) {
        if (!allowed[docIndex]) continue
        const s = quality * weight
        if (s > (best.get(docIndex) ?? 0)) best.set(docIndex, s)
      }
    }
    return best
  })

  const candidates = new Set<number>()
  perToken.forEach((m) => m.forEach((_, d) => candidates.add(d)))
  const required = tokens.length >= 3 ? tokens.length - 1 : tokens.length
  const phrase = normalizeText(query)

  const results: SearchResult[] = []
  for (const docIndex of candidates) {
    let matched = 0
    let score = 0
    for (const m of perToken) {
      const s = m.get(docIndex)
      if (s) {
        matched++
        score += s
      }
    }
    if (matched < required) continue
    score *= (matched / tokens.length) ** 2
    const title = index.phrases[docIndex] ?? ''
    if (phrase && title === phrase) score += 12
    else if (phrase && title.startsWith(phrase)) score += 6
    else if (phrase.length >= 3 && title.includes(phrase)) score += 4
    results.push({ doc: index.docs[docIndex], score })
  }

  results.sort(
    (a, b) => b.score - a.score || KIND_ORDER[a.doc.kind] - KIND_ORDER[b.doc.kind] || a.doc.title.localeCompare(b.doc.title),
  )
  return results.slice(0, opts.limit ?? 50)
}

/** Group results by kind, preserving rank order within each group. */
export function groupByKind(results: readonly SearchResult[]): Record<SearchKind, SearchResult[]> {
  const out: Record<SearchKind, SearchResult[]> = { topic: [], lab: [], component: [], category: [], pioneer: [] }
  for (const r of results) out[r.doc.kind].push(r)
  return out
}
