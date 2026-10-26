import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadContent, ROOT } from '../validation/load-content'
import { ogImageFile, parseLabMeta } from './html'
import { buildRoutes } from './routes'
import { cardDocument, shareCards } from './share-cards'

const content = loadContent()
const labs = parseLabMeta(readFileSync(path.join(ROOT, 'src/features/labs/registry.ts'), 'utf8'))
const routes = buildRoutes({ categories: content.categories, topics: content.topics, labs, pioneers: content.pioneers })
const cards = shareCards(routes, { categories: content.categories, topics: content.topics, labs })

describe('share images', () => {
  it('are named after the page path', () => {
    expect(ogImageFile('/')).toBe('og/home.png')
    expect(ogImageFile('/topics/clutch')).toBe('og/topics/clutch.png')
    expect(ogImageFile('default')).toBe('og/default.png')
    expect(() => ogImageFile('/topics/../secrets')).toThrow(/unsafe/)
  })

  it('cover every indexable page, plus a default, and skip personal pages', () => {
    const indexable = routes.filter((r) => !r.noindex).map((r) => ogImageFile(r.path))
    expect(cards.map((c) => c.file).sort()).toEqual([...indexable, ogImageFile('default')].sort())
    expect(cards.map((c) => c.file)).not.toContain(ogImageFile('/progress'))
  })

  it('show the lesson name, its system and its format on lesson cards', () => {
    expect(cards.find((c) => c.file === 'og/topics/four-stroke-cycle.png')).toMatchObject({
      eyebrow: 'Engine · Lesson',
      title: 'The Four-Stroke Cycle',
      chips: ['Beginner', '15 min', 'Interactive 3D lab'],
    })
    expect(cards.find((c) => c.file === 'og/topics/fuel-injection.png')?.chips).not.toContain('Interactive 3D lab')
  })

  it('are up to date in public/og (otherwise run npm run og:images)', () => {
    const drawn: unknown = JSON.parse(readFileSync(path.join(ROOT, 'scripts/prerender/share-cards.json'), 'utf8'))
    expect(drawn).toEqual(cards)
    for (const c of cards) expect(existsSync(path.join(ROOT, 'public', c.file)), c.file).toBe(true)
  })

  it('are drawn on a self-contained page', () => {
    const html = cardDocument({ display: 'AAA', sans: 'BBB', mono: 'CCC' }, '<svg></svg>')
    expect(html).toContain("font-family:'Space Grotesk';src:url(data:font/woff2;base64,AAA)")
    expect(html).not.toMatch(/url\((?!data:)|\s(?:src|href)=/)
  })
})
