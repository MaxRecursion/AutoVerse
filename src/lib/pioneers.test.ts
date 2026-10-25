import { describe, expect, it } from 'vitest'
import { categories, getComponent, getPioneersForCategory, getPioneersForComponent, getPioneersForTopic, getTopic, pioneers } from './content'
import { findReferenceErrors } from './content'
import { topics, sceneComponents } from './content'

describe('pioneers dataset', () => {
  it('is large enough to cover the major systems', () => {
    expect(pioneers.length).toBeGreaterThanOrEqual(24)
    const systems = new Set(pioneers.map((p) => p.categoryId))
    for (const id of ['engine', 'fuel-ignition', 'transmission', 'drivetrain', 'brakes', 'suspension-steering', 'wheels-tyres', 'electrical']) {
      expect(systems.has(id), id).toBe(true)
    }
  })

  it('has unique ids, sorted oldest-first', () => {
    expect(new Set(pioneers.map((p) => p.id)).size).toBe(pioneers.length)
    expect(pioneers.map((p) => p.sortYear)).toEqual([...pioneers.map((p) => p.sortYear)].sort((a, b) => a - b))
  })

  it('never ships an entry without a read source', () => {
    for (const p of pioneers) {
      expect(p.sources.length, p.id).toBeGreaterThan(0)
      for (const s of p.sources) {
        expect(s.url, p.id).toMatch(/^https:\/\//)
        expect(s.accessed, `${p.id} source must say when it was read`).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        expect(s.publisher, p.id).toBeTruthy()
      }
    }
  })

  it('keeps the displayed year consistent with the sort year', () => {
    for (const p of pioneers) expect(p.year.startsWith(String(p.sortYear)), `${p.id}: ${p.year} vs ${p.sortYear}`).toBe(true)
  })

  it('writes short, readable stories', () => {
    for (const p of pioneers) {
      expect(p.headline.length, p.id).toBeLessThanOrEqual(120)
      expect(p.story.length, p.id).toBeGreaterThan(150)
      expect(p.story.length, p.id).toBeLessThanOrEqual(1100)
    }
  })

  it('resolves every reference against real lessons, parts and systems', () => {
    const errors = findReferenceErrors({ categories, topics, components: sceneComponents, systemMap: null, pioneers })
    expect(errors).toEqual([])
  })

  it('indexes by lesson, part and system', () => {
    expect(getPioneersForTopic('four-stroke-cycle').map((p) => p.id)).toContain('eugen-langen-and-nikolaus-otto')
    expect(getPioneersForComponent('spark-plug').map((p) => p.id)).toContain('gottlob-honold')
    expect(getPioneersForCategory('brakes').length).toBeGreaterThanOrEqual(3)
    expect(getPioneersForTopic('does-not-exist')).toEqual([])
    expect(getComponent('spark-plug')).toBeDefined()
    expect(getTopic('four-stroke-cycle')).toBeDefined()
  })

  it('flags disputed or doubtful credit instead of hiding it', () => {
    const cautions = Object.fromEntries(pioneers.map((p) => [p.id, p.caution ?? '']))
    expect(cautions['rudolf-diesel']).toMatch(/unresolved/i)
    expect(cautions['charles-kettering']).toMatch(/dubious/i)
    expect(cautions['georg-lankensperger']).toMatch(/Darwin/)
    expect(cautions['eugen-langen-and-nikolaus-otto']).toMatch(/1862/)
  })
})
