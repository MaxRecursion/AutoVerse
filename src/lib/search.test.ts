import { describe, expect, it } from 'vitest'
import { CategorySchema, SceneComponentSchema, TopicSchema, type Topic } from './schemas'
import {
  buildSearchIndex,
  groupByKind,
  matchQuality,
  queryTokens,
  search,
  stem,
  tokenize,
  withinOneEdit,
  type SearchableLab,
} from './search'

const licence = { name: 'AutoVerse original content' }

function topic(partial: Partial<Topic> & Pick<Topic, 'id' | 'title'>): Topic {
  return TopicSchema.parse({
    slug: partial.id,
    summary: `${partial.title} summary.`,
    categoryId: 'engine',
    difficulty: 'beginner',
    estimatedDuration: 5,
    beginnerExplanation: 'Plain text.',
    technicalExplanation: 'Detailed text.',
    licence,
    contentStatus: 'complete',
    ...partial,
  })
}

const categories = [
  CategorySchema.parse({ id: 'engine', slug: 'engine', title: 'Engine', summary: 'How engines work.', icon: 'Cog', order: 1, systemId: 'engine' }),
  CategorySchema.parse({ id: 'brakes', slug: 'brakes', title: 'Brakes', summary: 'Stopping the car.', icon: 'Disc3', order: 2, systemId: 'braking' }),
  CategorySchema.parse({ id: 'wheels-tyres', slug: 'wheels-and-tyres', title: 'Wheels & Tyres', summary: 'Grip and contact patches.', icon: 'CircleDot', order: 3, systemId: 'wheels' }),
]

const topics: Topic[] = [
  topic({ id: 'pistons-and-crankshaft', title: 'Pistons and crankshaft', tags: ['reciprocating'], summary: 'How linear motion becomes rotation.', labId: 'engine' }),
  topic({
    id: 'valves-and-camshaft',
    title: 'Valves and camshaft',
    summary: 'Opening and closing the ports at the right time.',
    technicalExplanation: 'The camshaft pushes each piston-side valve open via a follower.',
    difficulty: 'intermediate',
  }),
  topic({ id: 'spark-ignition', title: 'Spark ignition', tags: ['piston'], summary: 'Lighting the charge.', categoryId: 'engine', difficulty: 'intermediate' }),
  topic({ id: 'brake-hydraulics', title: 'Brake hydraulics', summary: 'Pascal’s principle at the pedal.', categoryId: 'brakes', tags: ['pressure'] }),
  topic({ id: 'tyres-and-grip', title: 'Tyres and grip', summary: 'Why rubber sticks to the road.', categoryId: 'wheels-tyres', difficulty: 'advanced' }),
  topic({
    id: 'how-a-car-works',
    title: 'How a car works',
    summary: 'The big picture.',
    categoryId: 'engine',
    steps: [{ id: 'one', title: 'Turbocharger overview', beginner: 'x', technical: 'y', componentIds: [] }],
  }),
]

const labs: SearchableLab[] = [
  { id: 'engine', title: 'Four-Stroke Engine Laboratory', shortTitle: 'Engine', summary: 'Crank, piston and valves on one timeline.', systemId: 'engine', topicId: 'pistons-and-crankshaft' },
  { id: 'braking', title: 'Disc Brake Laboratory', summary: 'Pedal to pads.', systemId: 'braking', topicId: 'disc-brakes' },
]

const components = [
  SceneComponentSchema.parse({ id: 'piston', name: 'Piston', systemId: 'engine', description: 'Moves in the bore.', relatedTopicIds: ['pistons-and-crankshaft'] }),
  SceneComponentSchema.parse({ id: 'brake-caliper', name: 'Brake caliper', systemId: 'braking', description: 'Clamps the pads.', relatedTopicIds: ['disc-brakes'] }),
  SceneComponentSchema.parse({ id: 'orphan-widget', name: 'Orphan widget', systemId: 'nowhere', description: 'Not reachable.' }),
]

const index = buildSearchIndex({ topics, categories, labs, components })
const ids = (q: string, opts?: Parameters<typeof search>[2]) => search(index, q, opts).map((r) => r.doc.key)

describe('tokenisation', () => {
  it('normalises case, punctuation and diacritics', () => {
    expect(tokenize('Four-Stroke ÉNGINE!')).toEqual(['four', 'stroke', 'engine'])
  })

  it('stems plural endings and folds US spellings', () => {
    expect(stem('valves')).toBe('valve')
    expect(stem('batteries')).toBe('battery')
    expect(stem('clutches')).toBe('clutch')
    expect(stem('chassis')).toBe('chassis')
    expect(stem('tires')).toBe('tyre')
    expect(stem('gas')).toBe('gas')
  })

  it('drops stop words unless the query is only stop words', () => {
    expect(queryTokens('how does the brake work')).toEqual(['brake', 'work'])
    expect(queryTokens('how')).toEqual(['how'])
  })
})

describe('withinOneEdit', () => {
  it.each([
    ['piston', 'piston', true],
    ['pistn', 'piston', true], // deletion
    ['pistoon', 'piston', true], // insertion
    ['pistan', 'piston', true], // substitution
    ['pitson', 'piston', true], // adjacent swap
    ['pstn', 'piston', false],
    ['camshaft', 'crankshaft', false],
  ])('%s vs %s → %s', (a, b, expected) => {
    expect(withinOneEdit(a, b)).toBe(expected)
  })

  it('only allows typos for tokens of five or more characters', () => {
    expect(matchQuality('pistn', 'piston')).toBeGreaterThan(0)
    expect(matchQuality('pisn', 'pison')).toBe(0)
  })
})

describe('search relevance', () => {
  it('returns nothing for an empty query', () => {
    expect(search(index, '   ')).toEqual([])
  })

  it('ranks title matches above tag, summary and body matches', () => {
    const results = ids('piston', { kinds: ['topic'] })
    // title > tag ("spark-ignition" tagged piston) > body (valves mentions piston in technical text)
    expect(results.indexOf('topic:pistons-and-crankshaft')).toBe(0)
    expect(results.indexOf('topic:spark-ignition')).toBeLessThan(results.indexOf('topic:valves-and-camshaft'))
  })

  it('ranks tags above summaries', () => {
    const tagged = topic({ id: 'tagged', title: 'Alpha', tags: ['torque'] })
    const summarised = topic({ id: 'summarised', title: 'Beta', summary: 'All about torque.' })
    const idx = buildSearchIndex({ topics: [summarised, tagged], categories: [], labs: [], components: [] })
    expect(search(idx, 'torque').map((r) => r.doc.id)).toEqual(['tagged', 'summarised'])
  })

  it('matches prefixes while typing', () => {
    expect(ids('cranks')[0]).toBe('topic:pistons-and-crankshaft')
    expect(ids('hydr')).toContain('topic:brake-hydraulics')
  })

  it('tolerates a single typo in longer words', () => {
    expect(ids('camshft')[0]).toBe('topic:valves-and-camshaft')
    expect(ids('hydarulics')).toContain('topic:brake-hydraulics')
  })

  it('does not apply typo tolerance to short words', () => {
    expect(ids('vlve')).toEqual([])
  })

  it('handles plurals and US spelling', () => {
    expect(ids('tires')).toContain('topic:tyres-and-grip')
    expect(ids('valve')[0]).toBe('topic:valves-and-camshaft')
  })

  it('indexes step titles', () => {
    expect(ids('turbocharger')).toEqual(['topic:how-a-car-works'])
  })

  it('requires every token for short queries', () => {
    expect(ids('brake piston', { kinds: ['topic'] })).toEqual([])
    expect(ids('brake pressure')).toContain('topic:brake-hydraulics')
  })

  it('boosts exact title phrases', () => {
    expect(ids('how a car works')[0]).toBe('topic:how-a-car-works')
  })
})

describe('search across kinds', () => {
  it('finds labs, components and categories', () => {
    expect(ids('laboratory')).toEqual(expect.arrayContaining(['lab:engine', 'lab:braking']))
    expect(ids('caliper')).toEqual(['component:brake-caliper'])
    expect(ids('wheels')).toContain('category:wheels-tyres')
  })

  it('routes components to their first existing related topic, else their lab', () => {
    const piston = search(index, 'piston', { kinds: ['component'] })[0]
    expect(piston?.doc.href).toBe('/topics/pistons-and-crankshaft')
    const caliper = search(index, 'caliper')[0]
    // disc-brakes is not a topic here, so the braking lab is the destination.
    expect(caliper?.doc.href).toBe('/labs/braking')
  })

  it('omits components that lead nowhere', () => {
    expect(ids('orphan')).toEqual([])
  })

  it('groups results by kind', () => {
    const grouped = groupByKind(search(index, 'piston'))
    expect(grouped.topic.length).toBeGreaterThan(0)
    expect(grouped.component.map((r) => r.doc.id)).toEqual(['piston'])
    expect(grouped.lab.map((r) => r.doc.id)).toEqual(['engine'])
  })
})

describe('search filters', () => {
  it('filters by kind', () => {
    expect(search(index, 'brake', { kinds: ['lab'] }).every((r) => r.doc.kind === 'lab')).toBe(true)
  })

  it('filters by category (labs and components map through their system)', () => {
    const keys = ids('brake', { categoryId: 'brakes' })
    expect(keys).toEqual(expect.arrayContaining(['topic:brake-hydraulics', 'lab:braking', 'component:brake-caliper']))
    expect(ids('piston', { categoryId: 'brakes' })).toEqual([])
  })

  it('filters by difficulty (non-topic kinds have no difficulty and drop out)', () => {
    expect(ids('camshaft', { difficulty: 'intermediate' })).toEqual(['topic:valves-and-camshaft'])
    expect(ids('camshaft', { difficulty: 'beginner' })).toEqual([])
  })

  it('filters to interactive results', () => {
    const keys = ids('piston', { interactiveOnly: true, kinds: ['topic'] })
    expect(keys).toEqual(['topic:pistons-and-crankshaft'])
  })

  it('respects the limit', () => {
    expect(search(index, 'e', { limit: 1 }).length).toBeLessThanOrEqual(1)
    expect(search(index, 'brake', { limit: 2 })).toHaveLength(2)
  })
})
