/// <reference types="vite/client" />
import type { z } from 'zod'
import {
  CategorySchema,
  SceneComponentSchema,
  SourceArticleSchema,
  SystemMapSchema,
  TopicSchema,
  type Category,
  type SceneComponent,
  type SourceArticle,
  type SystemMap,
  type Topic,
} from './schemas'
import { LearningPathSchema, type LearningPath } from './schemas'

/**
 * Static content loader. Everything is bundled at build time from
 * src/content — there is no runtime dependency on any remote source.
 * Invalid entries are skipped and reported in `contentErrors` (asserted
 * empty by tests and `npm run validate:content`).
 *
 * The parsing and cross-reference helpers below are pure (data in, errors
 * out) so the Node tooling in scripts/ (validation, prerender) shares exactly
 * the same rules as the app.
 */

export interface ContentError {
  file: string
  message: string
}

/* ------------------------------------------------------------------------ */
/* Pure helpers (no bundler or DOM dependency)                               */
/* ------------------------------------------------------------------------ */

export interface ParsedContent<T> {
  items: T[]
  errors: ContentError[]
}

/**
 * Parse every module/JSON value in `files` (a file → value map; arrays are
 * parsed item by item). Invalid items are reported, never thrown.
 */
export function parseContentFiles<S extends z.ZodType>(schema: S, files: Record<string, unknown>): ParsedContent<z.infer<S>> {
  const items: z.infer<S>[] = []
  const errors: ContentError[] = []
  for (const [file, mod] of Object.entries(files)) {
    const raw = (mod as { default?: unknown } | null)?.default ?? mod
    const list = Array.isArray(raw) ? raw : [raw]
    list.forEach((item, i) => {
      const res = schema.safeParse(item)
      if (res.success) items.push(res.data)
      else errors.push({ file: `${file}[${i}]`, message: res.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; ') })
    })
  }
  return { items, errors }
}

export interface ContentBundle {
  categories: Category[]
  topics: Topic[]
  components: SceneComponent[]
  systemMap: SystemMap | null
}

export interface ReferenceCheckOptions {
  /** Known lab ids (features/labs registry). When given, topic.labId is checked. */
  labIds?: readonly string[]
}

const duplicates = (values: string[]) => [...new Set(values.filter((v, i) => values.indexOf(v) !== i))]

/** Prerequisite chains must be acyclic; returns each cycle once as "a → b → a". */
export function findPrerequisiteCycles(topics: Pick<Topic, 'id' | 'prerequisiteTopicIds'>[]): string[] {
  const graph = new Map(topics.map((t) => [t.id, t.prerequisiteTopicIds]))
  const state = new Map<string, 'visiting' | 'done'>()
  const cycles: string[] = []
  const visit = (id: string, trail: string[]) => {
    if (state.get(id) === 'done') return
    if (state.get(id) === 'visiting') {
      cycles.push([...trail.slice(trail.indexOf(id)), id].join(' → '))
      return
    }
    state.set(id, 'visiting')
    for (const next of graph.get(id) ?? []) if (graph.has(next)) visit(next, [...trail, id])
    state.set(id, 'done')
  }
  for (const id of graph.keys()) visit(id, [])
  return cycles
}

/** Cross-reference checks that schemas alone cannot express (pure). */
export function findReferenceErrors(bundle: ContentBundle, options: ReferenceCheckOptions = {}): ContentError[] {
  const { categories, topics, components, systemMap } = bundle
  const errors: ContentError[] = []
  const categoryIds = new Set(categories.map((c) => c.id))
  const topicIds = new Set(topics.map((t) => t.id))
  const componentIds = new Set(components.map((c) => c.id))
  const labIds = options.labIds ? new Set(options.labIds) : null
  const check = (file: string, kind: string, ref: string | undefined, ok: boolean) => {
    if (ref && !ok) errors.push({ file, message: `unknown ${kind} "${ref}"` })
  }

  for (const t of topics) {
    const f = `topic:${t.id}`
    if (t.id !== t.slug) errors.push({ file: f, message: `id and slug differ ("${t.slug}")` })
    check(f, 'category', t.categoryId, categoryIds.has(t.categoryId))
    t.relatedTopicIds.forEach((r) => check(f, 'related topic', r, topicIds.has(r)))
    t.prerequisiteTopicIds.forEach((r) => check(f, 'prerequisite', r, topicIds.has(r)))
    if (t.relatedTopicIds.includes(t.id) || t.prerequisiteTopicIds.includes(t.id)) {
      errors.push({ file: f, message: 'topic references itself' })
    }
    t.componentIds.forEach((c) => check(f, 'component', c, componentIds.has(c)))
    t.steps.forEach((s) => s.componentIds.forEach((c) => check(f, 'step component', c, componentIds.has(c))))
    duplicates(t.steps.map((s) => s.id)).forEach((d) => errors.push({ file: f, message: `duplicate step id "${d}"` }))
    duplicates(t.quiz.map((q) => q.id)).forEach((d) => errors.push({ file: f, message: `duplicate quiz id "${d}"` }))
    if (labIds && t.labId) check(f, 'lab', t.labId, labIds.has(t.labId))
    if (t.flow) {
      const nodeIds = new Set(t.flow.nodes.map((n) => n.id))
      duplicates(t.flow.nodes.map((n) => n.id)).forEach((d) => errors.push({ file: f, message: `duplicate flow node "${d}"` }))
      t.flow.nodes.forEach((n) => {
        check(f, 'flow topic', n.topicId, !n.topicId || topicIds.has(n.topicId))
        check(f, 'flow component', n.componentId, !n.componentId || componentIds.has(n.componentId))
      })
      t.flow.edges.forEach((e) => {
        check(f, 'flow edge source', e.from, nodeIds.has(e.from))
        check(f, 'flow edge target', e.to, nodeIds.has(e.to))
      })
    }
  }

  for (const c of components) {
    c.relatedTopicIds.forEach((r) => check(`component:${c.id}`, 'topic', r, topicIds.has(r)))
    check(`component:${c.id}`, 'parent', c.parentComponentId, !c.parentComponentId || componentIds.has(c.parentComponentId))
  }

  if (systemMap) {
    const mapNodeIds = new Set(systemMap.nodes.map((n) => n.id))
    systemMap.nodes.forEach((n) => {
      check(`map:${n.id}`, 'topic', n.topicId, !n.topicId || topicIds.has(n.topicId))
      check(`map:${n.id}`, 'component', n.focus?.componentId, !n.focus?.componentId || componentIds.has(n.focus.componentId))
      if (labIds && n.focus) check(`map:${n.id}`, 'lab', n.focus.labId, labIds.has(n.focus.labId))
    })
    systemMap.layouts.forEach((l) => l.path.forEach((p) => check(`map-layout:${l.id}`, 'map node', p, mapNodeIds.has(p))))
    systemMap.links.forEach((l) => {
      check(`map-link:${l.from}->${l.to}`, 'map node', l.from, mapNodeIds.has(l.from))
      check(`map-link:${l.from}->${l.to}`, 'map node', l.to, mapNodeIds.has(l.to))
    })
  }

  const ids = new Set(topics.map((t) => t.id))
  if (ids.size !== topics.length) errors.push({ file: 'topics', message: 'duplicate topic ids' })
  duplicates(topics.map((t) => t.slug)).forEach((d) => errors.push({ file: 'topics', message: `duplicate topic slug "${d}"` }))
  duplicates(categories.map((c) => c.id)).forEach((d) => errors.push({ file: 'categories', message: `duplicate category id "${d}"` }))
  duplicates(categories.map((c) => c.slug)).forEach((d) => errors.push({ file: 'categories', message: `duplicate category slug "${d}"` }))
  duplicates(components.map((c) => c.id)).forEach((d) => errors.push({ file: 'components', message: `duplicate component id "${d}"` }))
  findPrerequisiteCycles(topics).forEach((cycle) => errors.push({ file: 'topics', message: `prerequisite cycle ${cycle}` }))
  return errors
}

/* ------------------------------------------------------------------------ */
/* Bundled content (Vite)                                                    */
/* ------------------------------------------------------------------------ */

export const contentErrors: ContentError[] = []

function parseEach<S extends z.ZodType>(schema: S, files: Record<string, unknown>): z.infer<S>[] {
  const { items, errors } = parseContentFiles(schema, files)
  contentErrors.push(...errors)
  return items
}

// `import.meta.glob` only exists under Vite (dev, build, Vitest). Plain Node
// tooling (tsx scripts) imports this module for the pure helpers above, where
// the bundled collections are simply empty.
const vite = Boolean(import.meta.env)
const categoryFiles = vite ? import.meta.glob('../content/categories.json', { eager: true }) : {}
const topicFiles = vite ? import.meta.glob('../content/topics/**/*.json', { eager: true }) : {}
const componentFiles = vite ? import.meta.glob('../content/components/*.json', { eager: true }) : {}
const mapFiles = vite ? import.meta.glob('../content/system-map.json', { eager: true }) : {}
const sourceFiles = vite ? import.meta.glob('../content/source-index.json', { eager: true }) : {}

export const categories: Category[] = parseEach(CategorySchema, categoryFiles).sort((a, b) => a.order - b.order)
export const topics: Topic[] = parseEach(TopicSchema, topicFiles).sort((a, b) => a.title.localeCompare(b.title))
export const sceneComponents: SceneComponent[] = parseEach(SceneComponentSchema, componentFiles)
export const sourceArticles: SourceArticle[] = parseEach(SourceArticleSchema, sourceFiles)
export const systemMap: SystemMap | null = parseEach(SystemMapSchema, mapFiles)[0] ?? null

const byId = <T extends { id: string }>(list: T[]) => new Map(list.map((x) => [x.id, x]))
const topicById = byId(topics)
const topicBySlug = new Map(topics.map((t) => [t.slug, t]))
const categoryById = byId(categories)
const categoryBySlug = new Map(categories.map((c) => [c.slug, c]))
const componentById = byId(sceneComponents)

export const getTopic = (id: string) => topicById.get(id)
export const getTopicBySlug = (slug: string) => topicBySlug.get(slug)
export const getCategory = (id: string) => categoryById.get(id)
export const getCategoryBySlug = (slug: string) => categoryBySlug.get(slug)
export const getComponent = (id: string) => componentById.get(id)
export const getComponentsForSystem = (systemId: string) => sceneComponents.filter((c) => c.systemId === systemId)
export const getTopicsInCategory = (categoryId: string) => topics.filter((t) => t.categoryId === categoryId)
export const getTopicForLab = (labId: string) => topics.find((t) => t.labId === labId)
export const getTopicsForComponent = (componentId: string) =>
  topics.filter((t) => t.componentIds.includes(componentId) || getComponent(componentId)?.relatedTopicIds.includes(t.id))

/** Related topics: explicit links first, then same-category neighbours sharing tags. */
export function getRelatedTopics(topic: Topic, limit = 6): Topic[] {
  const explicit = topic.relatedTopicIds.map(getTopic).filter((t): t is Topic => !!t)
  const seen = new Set([topic.id, ...explicit.map((t) => t.id)])
  const inferred = topics
    .filter((t) => !seen.has(t.id))
    .map((t) => ({
      t,
      score: (t.categoryId === topic.categoryId ? 2 : 0) + t.tags.filter((tag) => topic.tags.includes(tag)).length,
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.t)
  return [...explicit, ...inferred].slice(0, limit)
}

/** Cross-reference checks over the bundled content (see findReferenceErrors). */
export function findBrokenReferences(): ContentError[] {
  return findReferenceErrors({ categories, topics, components: sceneComponents, systemMap })
}

/* ------------------------------------------------------------------------ */
/* Learning paths                                                            */
/* ------------------------------------------------------------------------ */

const learningPathFiles = vite ? import.meta.glob('../content/learning-paths.json', { eager: true }) : {}

/**
 * Curated learning paths, in display order. Paths may name topics that are
 * not written yet — the UI skips ids that do not resolve — so they are
 * deliberately not part of findReferenceErrors().
 */
export const learningPaths: LearningPath[] = parseEach(LearningPathSchema, learningPathFiles).sort((a, b) => a.order - b.order)
const learningPathById = byId(learningPaths)
export const getLearningPath = (id: string) => learningPathById.get(id)
