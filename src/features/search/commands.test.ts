import { describe, expect, it } from 'vitest'
import { routes } from '@/app/routes'
import { matchCommands, PAGES } from './commands'

describe('command menu pages', () => {
  it('lists a page for every top-level route without a parameter', () => {
    const paths = (routes[0].children ?? []).flatMap((r) => (r.index ? ['/'] : r.path && !r.path.includes(':') && r.path !== '*' ? [`/${r.path}`] : []))
    expect(PAGES.map((p) => p.href).sort()).toEqual(paths.sort())
  })

  it('matches labels and keywords by prefix, tolerating a typo', () => {
    expect(matchCommands(PAGES, 'gloss')[0]?.href).toBe('/glossary')
    expect(matchCommands(PAGES, 'inventors')[0]?.href).toBe('/pioneers')
    expect(matchCommands(PAGES, 'certificates')[0]?.href).toBe('/progress')
    expect(matchCommands(PAGES, 'systme map')[0]?.href).toBe('/map')
  })

  it('needs every word to match, and matches nothing for an empty query', () => {
    expect(matchCommands(PAGES, 'glossary pistons')).toEqual([])
    expect(matchCommands(PAGES, '   ')).toEqual([])
  })
})
