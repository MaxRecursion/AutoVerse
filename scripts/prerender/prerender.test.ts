import { describe, expect, it } from 'vitest'
import { CategorySchema, TopicSchema, type Category, type Topic } from '../../src/lib/schemas'
import { absoluteUrl, buildRedirects, buildSitemap, outputFileFor, parseLabMeta, renderDocument, restoreTemplate } from './html'
import { buildRoutes, escapeHtml, truncate, type PrerenderRoute } from './routes'

const TEMPLATE = `<!doctype html>
<html lang="en">
  <head>
    <title>AutoVerse — Understand Every Moving Part</title>
    <meta name="description" content="Default." />
  </head>
  <body>
    <div id="root"></div>
    <!--prerender:noscript-->
    <script type="module" src="/assets/index.js"></script>
  </body>
</html>
`

const category: Category = CategorySchema.parse({
  id: 'fuel-ignition',
  slug: 'fuel-and-ignition',
  title: 'Fuel & Ignition',
  summary: 'Fuel delivery and ignition.',
  icon: 'Flame',
  order: 3,
})

const topic = (over: Partial<Topic> & { id: string }): Topic =>
  TopicSchema.parse({
    slug: over.id,
    title: over.id,
    summary: 'A summary with <tags> & "quotes".',
    categoryId: 'fuel-ignition',
    difficulty: 'beginner',
    estimatedDuration: 5,
    learningObjectives: ['Explain <one> thing'],
    beginnerExplanation: 'First paragraph.\n\nSecond paragraph.',
    technicalExplanation: 'Technical.',
    licence: { name: 'AutoVerse original content' },
    contentStatus: 'complete',
    ...over,
  })

const labs = [{ id: 'engine', title: 'Engine Lab', summary: 'Watch the cycle.' }]
const routes = buildRoutes({
  categories: [category],
  topics: [topic({ id: 'fuel-injection', title: 'Fuel Injection', relatedTopicIds: ['diesel-engines'] }), topic({ id: 'diesel-engines', title: 'Diesel Engines' })],
  labs,
})
const byPath = (p: string) => routes.find((r) => r.path === p)!

describe('routes', () => {
  it('covers every required page exactly once', () => {
    const paths = routes.map((r) => r.path)
    expect(paths).toEqual(
      expect.arrayContaining([
        '/',
        '/learn',
        '/learn/fuel-and-ignition',
        '/topics/fuel-injection',
        '/topics/diesel-engines',
        '/labs',
        '/labs/engine',
        '/explore',
        '/map',
        '/progress',
        '/about',
      ]),
    )
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('puts the escaped summary, objectives and related links in topic fallbacks', () => {
    const r = byPath('/topics/fuel-injection')
    expect(r.title).toBe('Fuel Injection · AutoVerse')
    expect(r.ogType).toBe('article')
    expect(r.bodyHtml).toContain('A summary with &lt;tags&gt; &amp; &quot;quotes&quot;.')
    expect(r.bodyHtml).toContain('<li>Explain &lt;one&gt; thing</li>')
    expect(r.bodyHtml).toContain('<p>First paragraph.</p><p>Second paragraph.</p>')
    expect(r.bodyHtml).toContain('<a href="/topics/diesel-engines">Diesel Engines</a>')
    expect(r.bodyHtml).toContain('<a href="/learn/fuel-and-ignition">Fuel &amp; Ignition</a>')
  })

  it('lists topics on their category page', () => {
    expect(byPath('/learn/fuel-and-ignition').bodyHtml).toContain('/topics/diesel-engines')
  })
})

describe('text helpers', () => {
  it('escapes HTML special characters', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;')
  })

  it('truncates on a word boundary', () => {
    expect(truncate('short')).toBe('short')
    const long = truncate('word '.repeat(60), 40)
    expect(long.length).toBeLessThanOrEqual(40)
    expect(long.endsWith('word…')).toBe(true)
  })
})

describe('renderDocument', () => {
  const route: PrerenderRoute = byPath('/topics/fuel-injection')
  const html = renderDocument(TEMPLATE, route, { siteUrl: 'https://example.test/' })

  it('sets title, description, canonical and Open Graph tags', () => {
    expect(html).toContain('<title>Fuel Injection · AutoVerse</title>')
    expect(html).toContain('<meta name="description" content="A summary with &lt;tags&gt; &amp; &quot;quotes&quot;." />')
    expect(html).toContain('<link rel="canonical" href="https://example.test/topics/fuel-injection" />')
    expect(html).toContain('<meta property="og:url" content="https://example.test/topics/fuel-injection" />')
    expect(html).toContain('<meta property="og:type" content="article" />')
    expect(html.match(/<title>/g)).toHaveLength(1)
  })

  it('replaces the noscript placeholder and keeps the app script', () => {
    expect(html).not.toContain('<!--prerender:noscript-->')
    expect(html).toMatch(/<noscript>.*<h1>Fuel Injection<\/h1>.*<\/noscript>/s)
    expect(html).toContain('<script type="module" src="/assets/index.js"></script>')
  })

  it('is idempotent when run over its own output', () => {
    expect(restoreTemplate(html)).toBe(TEMPLATE.replace('<title>AutoVerse — Understand Every Moving Part</title>', '<title>Fuel Injection · AutoVerse</title>').replace('content="Default."', 'content="A summary with &lt;tags&gt; &amp; &quot;quotes&quot;."'))
    expect(renderDocument(html, route, { siteUrl: 'https://example.test' })).toBe(html)
  })

  it('marks 404 pages noindex without a canonical', () => {
    const notFound = renderDocument(TEMPLATE, { ...route, path: '/404' }, { siteUrl: 'https://example.test', noindex: true })
    expect(notFound).toContain('<meta name="robots" content="noindex" />')
    expect(notFound).not.toContain('rel="canonical"')
  })

  it('rejects templates without the placeholder', () => {
    expect(() => renderDocument('<html><head></head><body></body></html>', route, { siteUrl: 'https://e.test' })).toThrow(/prerender:noscript/)
  })
})

describe('outputs', () => {
  it('maps routes to directory index files and rejects traversal', () => {
    expect(outputFileFor('/')).toBe('index.html')
    expect(outputFileFor('/topics/a')).toBe('topics/a/index.html')
    expect(() => outputFileFor('/topics/../../etc')).toThrow()
    expect(absoluteUrl('https://e.test/', '/')).toBe('https://e.test/')
  })

  it('builds a sitemap with absolute URLs', () => {
    const xml = buildSitemap(routes.slice(0, 2), 'https://e.test', '2026-01-01')
    expect(xml).toContain('<loc>https://e.test/</loc>')
    expect(xml).toContain('<loc>https://e.test/learn</loc>')
    expect(xml).toContain('<lastmod>2026-01-01</lastmod>')
  })

  it('prepends route rewrites before the SPA fallback and replaces them on rerun', () => {
    const once = buildRedirects(routes, '/*  /index.html  200\n')
    expect(once).toContain('/topics/fuel-injection /topics/fuel-injection/index.html 200')
    expect(once.trim().endsWith('/*  /index.html  200')).toBe(true)
    expect(once.indexOf('/learn /learn/index.html 200')).toBeLessThan(once.indexOf('/*'))
    expect(buildRedirects(routes, once)).toBe(once)
  })

  it('parses lab metadata from registry source text', () => {
    const source = `export const labs = [
  { id: 'engine', title: 'Four-Stroke Engine Laboratory', shortTitle: 'Engine', summary: 'Watch intake, compression, power and exhaust.', order: 1 },
  {
    id: 'braking',
    title: 'Disc Brake Laboratory',
    summary: 'Press the pedal \\'firmly\\'.',
  },
]`
    expect(parseLabMeta(source)).toEqual([
      { id: 'engine', title: 'Four-Stroke Engine Laboratory', summary: 'Watch intake, compression, power and exhaust.' },
      { id: 'braking', title: 'Disc Brake Laboratory', summary: "Press the pedal 'firmly'." },
    ])
  })
})
