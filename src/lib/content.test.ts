import { describe, expect, it } from 'vitest'
import {
  categories,
  contentErrors,
  findBrokenReferences,
  findPrerequisiteCycles,
  findReferenceErrors,
  getCategory,
  getRelatedTopics,
  getTopicBySlug,
  learningPaths,
  parseContentFiles,
  sourceArticles,
  topics,
  type ContentBundle,
} from './content'
import { CategorySchema, TopicSchema, type Category, type Topic } from './schemas'

const EXPECTED_CATEGORY_IDS = [
  'basics',
  'engine',
  'fuel-ignition',
  'cooling-lubrication',
  'transmission',
  'drivetrain',
  'brakes',
  'suspension-steering',
  'wheels-tyres',
  'electrical',
  'hvac',
  'body-chassis',
  'aero-technology',
  'maintenance',
  'driving',
]

const duplicatesOf = (values: string[]) => values.filter((v, i) => values.indexOf(v) !== i)

describe('bundled content', () => {
  it('parses every content file without schema errors', () => {
    expect(contentErrors).toEqual([])
  })

  it('has no broken cross-references', () => {
    expect(findBrokenReferences()).toEqual([])
  })

  it('defines exactly the documented categories', () => {
    expect(categories.map((c) => c.id).sort()).toEqual([...EXPECTED_CATEGORY_IDS].sort())
  })

  it('gives every topic an existing category and a unique id and slug', () => {
    expect(topics.length).toBeGreaterThan(0)
    for (const t of topics) expect(getCategory(t.categoryId), `${t.id} → ${t.categoryId}`).toBeDefined()
    expect(duplicatesOf(topics.map((t) => t.id))).toEqual([])
    expect(duplicatesOf(topics.map((t) => t.slug))).toEqual([])
    for (const t of topics) {
      expect(t.slug).toBe(t.id)
      expect(getTopicBySlug(t.slug)).toBe(t)
    }
  })

  it('has unique category slugs', () => {
    expect(duplicatesOf(categories.map((c) => c.slug))).toEqual([])
  })

  it('marks original lessons with the AutoVerse licence and honest status', () => {
    for (const t of topics) {
      if (!t.attribution) expect(t.licence.name, t.id).toBe('AutoVerse original content')
      if (t.contentStatus === 'complete') {
        expect(t.quiz.length, `${t.id} quiz`).toBeGreaterThan(0)
        expect(t.steps.length, `${t.id} steps`).toBeGreaterThan(0)
        expect(t.learningObjectives.length, `${t.id} objectives`).toBeGreaterThan(0)
      }
    }
  })

  it('only links third-party articles that discovery confirmed', () => {
    const indexed = new Map(sourceArticles.map((a) => [a.url, a]))
    const indexedHosts = new Set(sourceArticles.map((a) => new URL(a.url).hostname))
    for (const t of topics) {
      for (const ref of t.sourceReferences) {
        if (!indexedHosts.has(new URL(ref.url).hostname)) continue
        const entry = indexed.get(ref.url)
        expect(entry, `${t.id} → ${ref.url}`).toBeDefined()
        expect(['failed', 'blocked-by-robots']).not.toContain(entry?.importStatus)
      }
    }
  })

  it('never claims a reuse licence for metadata-only source articles', () => {
    expect(duplicatesOf(sourceArticles.map((a) => a.url))).toEqual([])
    for (const a of sourceArticles) {
      if (a.importStatus !== 'imported') expect(a.licence).toMatch(/no reuse licen[cs]e/i)
      if (a.mappedCategoryId) expect(EXPECTED_CATEGORY_IDS).toContain(a.mappedCategoryId)
    }
  })

  it('parses learning paths in order', () => {
    const orders = learningPaths.map((p) => p.order)
    expect(orders).toEqual([...orders].sort((a, b) => a - b))
  })

  it('never lists a topic as related to itself', () => {
    for (const t of topics) expect(getRelatedTopics(t).map((r) => r.id)).not.toContain(t.id)
  })
})

/* ------------------------------------------------------------------ helpers */

const category = (over: Partial<Category> = {}): Category =>
  CategorySchema.parse({ id: 'engine', slug: 'engine', title: 'Engine', summary: 'Engines.', icon: 'Cog', order: 1, ...over })

const topic = (over: Partial<Topic> & { id: string }): Topic =>
  TopicSchema.parse({
    slug: over.id,
    title: over.id,
    summary: 'Summary.',
    categoryId: 'engine',
    difficulty: 'beginner',
    estimatedDuration: 5,
    beginnerExplanation: 'Simple.',
    technicalExplanation: 'Detailed.',
    licence: { name: 'AutoVerse original content' },
    contentStatus: 'outline',
    ...over,
  })

const bundle = (over: Partial<ContentBundle> = {}): ContentBundle => ({
  categories: [category()],
  topics: [topic({ id: 'a' }), topic({ id: 'b', relatedTopicIds: ['a'], prerequisiteTopicIds: ['a'] })],
  components: [],
  systemMap: null,
  ...over,
})

describe('pure content helpers', () => {
  it('parseContentFiles keeps valid items and reports invalid ones per file and index', () => {
    const { items, errors } = parseContentFiles(CategorySchema, {
      'cats.json': { default: [category(), { id: 'Bad Id' }] },
      'one.json': category({ id: 'brakes', slug: 'brakes' }),
    })
    expect(items.map((c) => c.id)).toEqual(['engine', 'brakes'])
    expect(errors).toHaveLength(1)
    expect(errors[0]?.file).toBe('cats.json[1]')
  })

  it('accepts a consistent bundle', () => {
    expect(findReferenceErrors(bundle())).toEqual([])
  })

  it('reports unknown categories, topics, components and labs', () => {
    const errors = findReferenceErrors(
      bundle({
        topics: [
          topic({ id: 'a', categoryId: 'nope', relatedTopicIds: ['ghost'], componentIds: ['gear'], labId: 'warp' }),
        ],
      }),
      { labIds: ['engine'] },
    ).map((e) => e.message)
    expect(errors).toEqual(
      expect.arrayContaining(['unknown category "nope"', 'unknown related topic "ghost"', 'unknown component "gear"', 'unknown lab "warp"']),
    )
  })

  it('reports self-references, duplicate slugs and broken flow edges', () => {
    const errors = findReferenceErrors(
      bundle({
        topics: [
          topic({
            id: 'a',
            relatedTopicIds: ['a'],
            flow: { nodes: [{ id: 'n1', label: 'N1' }], edges: [{ from: 'n1', to: 'n2' }] },
          }),
          { ...topic({ id: 'b' }), slug: 'a' },
        ],
      }),
    ).map((e) => e.message)
    expect(errors).toEqual(
      expect.arrayContaining(['topic references itself', 'unknown flow edge target "n2"', 'duplicate topic slug "a"', 'id and slug differ ("a")']),
    )
  })

  it('detects prerequisite cycles', () => {
    const cycles = findPrerequisiteCycles([
      { id: 'a', prerequisiteTopicIds: ['c'] },
      { id: 'b', prerequisiteTopicIds: ['a'] },
      { id: 'c', prerequisiteTopicIds: ['b'] },
      { id: 'd', prerequisiteTopicIds: ['a'] },
    ])
    expect(cycles).toHaveLength(1)
    expect(cycles[0]).toMatch(/a → c → b → a/)
  })

  it('has no prerequisite cycles in the bundled topics', () => {
    expect(findPrerequisiteCycles(topics)).toEqual([])
  })
})
