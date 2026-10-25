/**
 * Test-only fixtures: schema-valid topics and components plus a helper that
 * merges them into the real content module inside `vi.mock('@/lib/content')`.
 * Lesson content is authored by other workstreams, so tests must not depend
 * on which topics happen to exist.
 */
import type { z } from 'zod'
import { SceneComponentSchema, SourceArticleSchema, TopicSchema, type SceneComponent, type SourceArticle, type Topic } from '@/lib/schemas'
import type * as ContentModule from '@/lib/content'

type ContentApi = typeof ContentModule

const original = { name: 'AutoVerse original content' }

export const fixtureComponents: SceneComponent[] = (
  [
    {
      id: 'fixture-piston',
      name: 'Fixture piston',
      systemId: 'engine',
      description: 'Slides up and down in the cylinder, turning gas pressure into force.',
      technical: 'Transfers combustion pressure to the connecting rod through the gudgeon pin.',
      relatedTopicIds: ['fixture-engine-cycle'],
      annotations: [{ label: 'Material', text: 'Cast aluminium alloy' }],
    },
    {
      id: 'fixture-crankshaft',
      name: 'Fixture crankshaft',
      systemId: 'engine',
      description: 'Converts the up-and-down motion of the pistons into rotation.',
      relatedTopicIds: [],
    },
  ] satisfies z.input<typeof SceneComponentSchema>[]
).map((c) => SceneComponentSchema.parse(c))

export const fixtureTopicInput = {
  id: 'fixture-engine-cycle',
  slug: 'fixture-engine-cycle',
  title: 'Fixture engine cycle',
  summary: 'A complete fixture lesson used by the test-suite.',
  categoryId: 'engine',
  difficulty: 'beginner',
  estimatedDuration: 9,
  tags: ['engine', 'cycle'],
  learningObjectives: ['Name the four strokes', 'Explain why the crank turns twice per cycle'],
  beginnerExplanation: 'Beginner intro paragraph one.\n\nBeginner intro paragraph two.',
  technicalExplanation: 'Technical intro paragraph with thermodynamic detail.',
  steps: [
    { id: 'intake', title: 'Intake stroke', beginner: 'Beginner intake text.', technical: 'Technical intake text.', cue: 'intake', componentIds: ['fixture-piston'] },
    { id: 'compression', title: 'Compression stroke', beginner: 'Beginner compression text.', technical: 'Technical compression text.', cue: 'compression' },
    { id: 'summary-step', title: 'Putting it together', beginner: 'Beginner wrap-up.', technical: 'Technical wrap-up.' },
  ],
  componentIds: ['fixture-piston', 'fixture-crankshaft', 'fixture-missing-part'],
  labId: 'fixture-lab',
  flow: {
    nodes: [
      { id: 'fuel', label: 'Fuel and air', detail: 'Drawn in on the intake stroke.' },
      { id: 'piston-node', label: 'Piston', componentId: 'fixture-piston' },
      { id: 'ignition-node', label: 'Ignition', topicId: 'fixture-ignition' },
    ],
    edges: [
      { from: 'fuel', to: 'piston-node', label: 'charge' },
      { from: 'piston-node', to: 'ignition-node' },
    ],
  },
  keyConcepts: [{ term: 'Compression ratio', definition: 'Swept plus clearance volume over clearance volume.', equation: 'CR = (Vs + Vc) / Vc' }],
  misconceptions: [{ myth: 'The spark pushes the piston.', reality: 'Expanding gas pushes the piston; the spark only starts combustion.' }],
  practicalExamples: ['A lawnmower engine runs the same four strokes.'],
  relatedTopicIds: ['fixture-ignition'],
  prerequisiteTopicIds: ['fixture-ignition'],
  quiz: [
    { id: 'q1', prompt: 'How many strokes are in the cycle?', options: ['Two', 'Four', 'Six'], answerIndex: 1, explanation: 'Intake, compression, power, exhaust.' },
    { id: 'q2', prompt: 'What pushes the piston down on the power stroke?', options: ['The spark', 'Expanding gas'], answerIndex: 1, explanation: 'Hot, expanding gas does the work.' },
  ],
  sourceReferences: [{ title: 'Example further reading', url: 'https://example.com/reading', publisher: 'Example Publisher' }],
  attribution: 'Diagram concept by the AutoVerse team.',
  licence: original,
  contentStatus: 'complete',
} satisfies z.input<typeof TopicSchema>

export const fixtureTopic: Topic = TopicSchema.parse(fixtureTopicInput)

export const fixtureIgnitionTopic: Topic = TopicSchema.parse({
  id: 'fixture-ignition',
  slug: 'fixture-ignition',
  title: 'Fixture ignition',
  summary: 'A draft fixture lesson without a lab.',
  categoryId: 'fuel-ignition',
  difficulty: 'intermediate',
  estimatedDuration: 6,
  beginnerExplanation: 'A spark lights the mixture.',
  technicalExplanation: 'A high-voltage discharge initiates a flame kernel.',
  flow: {
    nodes: [
      { id: 'coil', label: 'Coil' },
      { id: 'plug', label: 'Spark plug' },
    ],
    edges: [{ from: 'coil', to: 'plug' }],
  },
  licence: original,
  contentStatus: 'draft',
} satisfies z.input<typeof TopicSchema>)

export const fixtureOutlineTopic: Topic = TopicSchema.parse({
  id: 'fixture-outline',
  slug: 'fixture-outline',
  title: 'Fixture outline',
  summary: 'An outline-only fixture.',
  categoryId: 'brakes',
  difficulty: 'advanced',
  estimatedDuration: 4,
  learningObjectives: ['Understand the outline'],
  beginnerExplanation: 'Outline text.',
  technicalExplanation: 'Outline technical text.',
  licence: original,
  contentStatus: 'outline',
} satisfies z.input<typeof TopicSchema>)

export const fixtureTopics = [fixtureTopic, fixtureIgnitionTopic, fixtureOutlineTopic]

/** Twelve catalogued further-reading links for the Engine category (example.org placeholders, never shown to users). */
export const fixtureSourceArticles: SourceArticle[] = Array.from({ length: 12 }, (_, i) =>
  SourceArticleSchema.parse({
    url: `https://example.org/fixture-reading-${i + 1}`,
    title: `Fixture reading ${String(i + 1).padStart(2, '0')}`,
    mappedCategoryId: 'engine',
    importStatus: 'metadata-only',
    licence: 'unknown',
  }),
)

/**
 * Return a copy of the real content API with extra topics / components /
 * source articles merged in. Only topic- and component-derived helpers are re-implemented; everything
 * else (categories, sources, learning paths…) is the real module.
 */
export function withFixtureContent(
  actual: ContentApi,
  extra: { topics?: Topic[]; components?: SceneComponent[]; sourceArticles?: SourceArticle[] } = {},
): ContentApi {
  const extraTopicIds = new Set((extra.topics ?? []).map((t) => t.id))
  const extraComponentIds = new Set((extra.components ?? []).map((c) => c.id))
  const topics = [...actual.topics.filter((t) => !extraTopicIds.has(t.id)), ...(extra.topics ?? [])].sort((a, b) =>
    a.title.localeCompare(b.title),
  )
  const sceneComponents = [...actual.sceneComponents.filter((c) => !extraComponentIds.has(c.id)), ...(extra.components ?? [])]
  const topicById = new Map(topics.map((t) => [t.id, t]))
  const topicBySlug = new Map(topics.map((t) => [t.slug, t]))
  const componentById = new Map(sceneComponents.map((c) => [c.id, c]))
  const getTopic = (id: string) => topicById.get(id)
  const getComponent = (id: string) => componentById.get(id)

  return {
    ...actual,
    topics,
    sceneComponents,
    sourceArticles: [...actual.sourceArticles, ...(extra.sourceArticles ?? [])],
    getTopic,
    getTopicBySlug: (slug: string) => topicBySlug.get(slug),
    getComponent,
    getComponentsForSystem: (systemId: string) => sceneComponents.filter((c) => c.systemId === systemId),
    getTopicsInCategory: (categoryId: string) => topics.filter((t) => t.categoryId === categoryId),
    getTopicForLab: (labId: string) => topics.find((t) => t.labId === labId),
    getTopicsForComponent: (componentId: string) =>
      topics.filter((t) => t.componentIds.includes(componentId) || getComponent(componentId)?.relatedTopicIds.includes(t.id)),
    getRelatedTopics: (topic: Topic, limit = 6) => {
      const explicit = topic.relatedTopicIds.map(getTopic).filter((t): t is Topic => !!t)
      const seen = new Set([topic.id, ...explicit.map((t) => t.id)])
      const inferred = topics.filter((t) => !seen.has(t.id) && t.categoryId === topic.categoryId)
      return [...explicit, ...inferred].slice(0, limit)
    },
  }
}
