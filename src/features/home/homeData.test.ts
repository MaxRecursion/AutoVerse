import { describe, expect, it } from 'vitest'
import { searchSite } from '@/features/search/siteIndex'
import { categories, getTopic, learningPaths, topics } from '@/lib/content'
import type { LearningPath, Topic } from '@/lib/schemas'
import {
  SEARCH_SUGGESTIONS,
  categoryTiles,
  displayPathTitle,
  pickBeginnerPath,
  queryFromPath,
  resolveRecent,
  startLearningHref,
  totalMinutes,
} from './homeData'

const path = (p: Partial<LearningPath> & Pick<LearningPath, 'id'>): LearningPath => ({
  title: p.id,
  summary: 'x',
  level: 'intermediate',
  order: 0,
  topicIds: ['a', 'b'],
  ...p,
})

describe('categoryTiles', () => {
  it('lists every category in order with its lesson count', () => {
    const tiles = categoryTiles(categories, topics)
    expect(tiles.map((t) => t.category.id)).toEqual([...categories].sort((a, b) => a.order - b.order).map((c) => c.id))
    expect(tiles.reduce((sum, t) => sum + t.count, 0)).toBe(topics.filter((t) => categories.some((c) => c.id === t.categoryId)).length)
    const engine = tiles.find((t) => t.category.id === 'engine')!
    expect(engine.count).toBe(topics.filter((t) => t.categoryId === 'engine').length)
  })

  it('reports zero for a category without lessons', () => {
    const [first] = categories
    expect(categoryTiles([first], [])).toEqual([{ category: first, count: 0 }])
  })
})

describe('pickBeginnerPath / displayPathTitle', () => {
  it('prefers the first beginner path by order, else the first path', () => {
    const paths = [path({ id: 'b', order: 2, level: 'beginner' }), path({ id: 'a', order: 1 }), path({ id: 'c', order: 3, level: 'beginner' })]
    expect(pickBeginnerPath(paths)?.id).toBe('b')
    expect(pickBeginnerPath([path({ id: 'x', order: 5 }), path({ id: 'y', order: 4 })])?.id).toBe('y')
    expect(pickBeginnerPath([])).toBeUndefined()
  })

  it('drops a redundant level prefix from the title', () => {
    expect(displayPathTitle({ title: 'Beginner: how a car moves', level: 'beginner' })).toBe('How a car moves')
    expect(displayPathTitle({ title: 'Inside the engine', level: 'intermediate' })).toBe('Inside the engine')
    expect(displayPathTitle({ title: 'Beginner:', level: 'beginner' })).toBe('Beginner:')
  })

  it('the bundled content has a beginner path with written lessons', () => {
    const beginner = pickBeginnerPath(learningPaths)
    expect(beginner?.level).toBe('beginner')
    expect(beginner?.topicIds.some((id) => getTopic(id))).toBe(true)
  })
})

describe('resolveRecent', () => {
  const t = (id: string) => ({ id }) as Topic
  const lookup = (id: string) => (id === 'gone' ? undefined : t(id))

  it('keeps order, skips unknown and duplicate ids, and caps the list', () => {
    const recent = [
      { topicId: 'a', at: '3' },
      { topicId: 'gone', at: '2' },
      { topicId: 'a', at: '1' },
      { topicId: 'b', at: '0' },
      { topicId: 'c', at: '0' },
    ]
    expect(resolveRecent(recent, lookup, 2).map((r) => [r.topic.id, r.at])).toEqual([
      ['a', '3'],
      ['b', '0'],
    ])
    expect(resolveRecent([], lookup)).toEqual([])
  })
})

describe('startLearningHref / totalMinutes', () => {
  it('links to the next lesson or the lesson index', () => {
    expect(startLearningHref({ slug: 'how-a-car-works' })).toBe('/topics/how-a-car-works')
    expect(startLearningHref(undefined)).toBe('/learn')
  })

  it('sums durations', () => {
    expect(totalMinutes([{ estimatedDuration: 8 }, { estimatedDuration: 12 }])).toBe(20)
    expect(totalMinutes([])).toBe(0)
  })
})

describe('queryFromPath', () => {
  it.each([
    ['/topics/brake-pads', 'brake pads'],
    ['/learn/fuel_and_ignition/', 'fuel and ignition'],
    ['/old/page.html', 'page'],
    ['/caf%C3%A9-racer', 'café racer'],
    ['/bad%E0%A4%A', 'bad E0 A4 A'],
    ['/', ''],
    ['/---', ''],
  ])('%s → %j', (input, expected) => {
    expect(queryFromPath(input)).toBe(expected)
  })

  it('caps very long queries', () => {
    expect(queryFromPath(`/${'word-'.repeat(40)}`).length).toBeLessThanOrEqual(60)
  })
})

describe('SEARCH_SUGGESTIONS', () => {
  it.each(SEARCH_SUGGESTIONS)('“%s” finds something', (q) => {
    expect(searchSite(q).length).toBeGreaterThan(0)
  })
})
