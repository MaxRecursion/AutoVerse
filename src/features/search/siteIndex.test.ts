import { describe, expect, it } from 'vitest'
import { labs } from '@/features/labs/registry'
import { categories, topics } from '@/lib/content'
import { getSiteSearchIndex, searchSite } from './siteIndex'

// Invariants over the real bundled content (whatever lessons exist when the suite runs).
describe('site search index', () => {
  it('indexes every topic, lab and category once', () => {
    const keys = getSiteSearchIndex().docs.map((d) => d.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const t of topics) expect(keys).toContain(`topic:${t.id}`)
    for (const l of labs) expect(keys).toContain(`lab:${l.id}`)
    for (const c of categories) expect(keys).toContain(`category:${c.id}`)
  })

  it('is memoised', () => {
    expect(getSiteSearchIndex()).toBe(getSiteSearchIndex())
  })

  it.each(topics.map((t) => [t.title, t.id]))('finds “%s” first by its own title', (title, id) => {
    expect(searchSite(title, { kinds: ['topic'] })[0]?.doc.id).toBe(id)
  })

  it('links every result to an in-app route', () => {
    for (const d of getSiteSearchIndex().docs) expect(d.href).toMatch(/^\/(topics|labs|learn|pioneers)[/?]/)
  })
})
