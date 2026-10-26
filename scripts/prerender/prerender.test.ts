import { describe, expect, it } from 'vitest'
import { CategorySchema, PioneerSchema, TopicSchema, type Category, type Pioneer, type Topic } from '../../src/lib/schemas'
import { absoluteUrl, buildRedirects, buildSitemap, jsonForScript, outputFileFor, parseLabMeta, renderDocument, restoreTemplate, trailingSlashRedirect } from './html'
import { ALLOWED_CRAWLERS, buildLlmsFullTxt, buildLlmsTxt, buildRobots, topicMarkdown } from './markdown'
import { buildRoutes, buildSiteJsonLd, escapeHtml, truncate, type PrerenderRoute } from './routes'

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
const DATES = { 'fuel-injection': { published: '2026-10-20T09:00:00Z', modified: '2026-10-24T09:00:00Z' }, site: { published: '2026-10-01T09:00:00Z', modified: '2026-10-25T09:00:00Z' } } as Record<string, { published: string; modified: string }>
const routes = buildRoutes({
  categories: [category],
  topics: [
    topic({
      id: 'fuel-injection',
      title: 'Fuel Injection',
      relatedTopicIds: ['diesel-engines'],
      seo: { title: 'How Fuel Injection Works', description: 'How an engine computer meters fuel: sensors, injectors and the air-fuel ratio, explained simply with a diagram and quiz.' },
      faq: [{ question: 'What does a fuel injector do?', answer: 'It sprays a precisely timed, finely atomised dose of fuel so it mixes well with the air the engine has drawn in.' }],
      about: [{ name: 'Fuel injection', sameAs: 'https://en.wikipedia.org/wiki/Fuel_injection' }],
      labId: 'engine',
    }),
    topic({ id: 'diesel-engines', title: 'Diesel Engines' }),
  ],
  labs,
  siteUrl: 'https://e.test',
  dates: (key) => DATES[key],
  imageFor: (path) => (path === 'default' ? '/og/default.png' : path === '/topics/fuel-injection' ? '/og/topics/fuel-injection.png' : undefined),
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
    expect(r.title).toBe('How Fuel Injection Works · AutoVerse')
    expect(r.description).toBe('How an engine computer meters fuel: sensors, injectors and the air-fuel ratio, explained simply with a diagram and quiz.')
    expect(r.ogType).toBe('article')
    expect(r.bodyHtml).toContain('A summary with &lt;tags&gt; &amp; &quot;quotes&quot;.')
    expect(r.bodyHtml).toContain('<li>Explain &lt;one&gt; thing</li>')
    expect(r.bodyHtml).toContain('<p>First paragraph.</p><p>Second paragraph.</p>')
    expect(r.bodyHtml).toContain('<a href="/topics/diesel-engines">Diesel Engines</a>')
    expect(r.bodyHtml).toContain('<a href="/learn/fuel-and-ignition">Fuel &amp; Ignition</a>')
  })

  it('falls back to the lesson title and summary when no search copy is written', () => {
    const r = byPath('/topics/diesel-engines')
    expect(r.title).toBe('Diesel Engines · AutoVerse')
    expect(r.description).toBe('A summary with <tags> & "quotes".')
  })

  it('keeps personal pages out of search and renders them in the browser only', () => {
    expect(byPath('/progress')).toMatchObject({ noindex: true, ssr: false })
    expect(byPath('/topics/fuel-injection').ssr).toBeUndefined()
  })

  it('uses each lesson’s own content dates, and its own share image or the default', () => {
    expect(byPath('/topics/fuel-injection')).toMatchObject({ published: DATES['fuel-injection']!.published, modified: DATES['fuel-injection']!.modified })
    expect(byPath('/topics/fuel-injection').image).toMatchObject({ path: '/og/topics/fuel-injection.png', width: 1200, height: 630 })
    expect(byPath('/topics/diesel-engines').image?.path).toBe('/og/default.png')
    expect(byPath('/topics/fuel-injection').markdownPath).toBe('/topics/fuel-injection.md')
  })

  it('lists topics on their category page', () => {
    expect(byPath('/learn/fuel-and-ignition').bodyHtml).toContain('/topics/diesel-engines')
  })
})

describe('structured data', () => {
  const graph = (path: string) => byPath(path).jsonLd as Record<string, unknown>[]
  const node = (path: string, type: string) => graph(path).find((n) => ([] as unknown[]).concat(n['@type']).includes(type)) as Record<string, unknown>

  it('describes a lesson as a technical article and learning resource with breadcrumbs', () => {
    const lesson = node('/topics/fuel-injection', 'TechArticle')
    expect(lesson['@type']).toEqual(['TechArticle', 'LearningResource'])
    expect(lesson).toMatchObject({
      '@id': 'https://e.test/topics/fuel-injection#lesson',
      headline: 'Fuel Injection',
      url: 'https://e.test/topics/fuel-injection',
      educationalLevel: 'Beginner',
      learningResourceType: 'Lesson',
      timeRequired: 'PT5M',
      isAccessibleForFree: true,
      datePublished: DATES['fuel-injection']!.published,
      dateModified: DATES['fuel-injection']!.modified,
      image: 'https://e.test/og/topics/fuel-injection.png',
      about: [{ '@type': 'Thing', name: 'Fuel injection', sameAs: 'https://en.wikipedia.org/wiki/Fuel_injection' }],
      author: { '@id': 'https://e.test/#organization' },
      interactivityType: 'mixed',
    })
    expect(lesson.hasPart).toMatchObject({ '@type': 'LearningResource', learningResourceType: 'Simulation', url: 'https://e.test/labs/engine' })
    const crumbs = (node('/topics/fuel-injection', 'BreadcrumbList').itemListElement as { name: string; item: string }[]).map((c) => [c.name, c.item])
    expect(crumbs).toEqual([
      ['Home', 'https://e.test/'],
      ['Learn', 'https://e.test/learn'],
      ['Fuel & Ignition', 'https://e.test/learn/fuel-and-ignition'],
      ['Fuel Injection', 'https://e.test/topics/fuel-injection'],
    ])
  })

  it('publishes visible common questions as FAQPage, and only when a lesson has them', () => {
    const faq = node('/topics/fuel-injection', 'FAQPage')
    expect(faq.mainEntity).toEqual([{ '@type': 'Question', name: 'What does a fuel injector do?', acceptedAnswer: { '@type': 'Answer', text: expect.stringContaining('atomised') } }])
    expect(node('/topics/diesel-engines', 'FAQPage')).toBeUndefined()
  })

  it('lists a category’s lessons and the site’s systems as item lists', () => {
    expect(node('/learn/fuel-and-ignition', 'ItemList').itemListElement).toHaveLength(2)
    expect((node('/learn', 'ItemList').itemListElement as unknown[])[0]).toMatchObject({ position: 1, url: 'https://e.test/learn/fuel-and-ignition' })
  })

  it('has no structured data on noindex pages', () => {
    expect(byPath('/progress').jsonLd).toEqual([])
  })

  it('defines the organisation and website once, for every page to reference', () => {
    const site = buildSiteJsonLd('https://e.test', '/icons/autoverse-512.png')
    expect(site.map((n) => (n as { '@type': string })['@type'])).toEqual(['Organization', 'WebSite'])
    expect(site[0]).toMatchObject({ '@id': 'https://e.test/#organization', logo: { url: 'https://e.test/icons/autoverse-512.png' } })
  })

  it('escapes JSON so it can never close its script element', () => {
    expect(jsonForScript({ a: '</script><script>alert(1)</script>' })).not.toContain('</script>')
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

  it('sets title, description, canonical, robots and Open Graph tags', () => {
    expect(html).toContain('<title>How Fuel Injection Works · AutoVerse</title>')
    expect(html).toContain('<meta name="description" content="How an engine computer meters fuel: sensors, injectors and the air-fuel ratio, explained simply with a diagram and quiz." />')
    expect(html).toContain('<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1" />')
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />')
    expect(html).toContain('<meta property="og:image" content="https://example.test/og/topics/fuel-injection.png" />')
    expect(html).toContain('<meta property="article:modified_time" content="2026-10-24T09:00:00Z" />')
    expect(html).toContain('<link rel="alternate" type="text/markdown" href="https://example.test/topics/fuel-injection.md"')
    expect(html).toContain('<link rel="canonical" href="https://example.test/topics/fuel-injection" />')
    expect(html).toContain('<meta property="og:url" content="https://example.test/topics/fuel-injection" />')
    expect(html).toContain('<meta property="og:type" content="article" />')
    expect(html.match(/<title>/g)).toHaveLength(1)
  })

  it('prefixes static links and canonical URLs for a repository subpath', () => {
    const pagesHtml = renderDocument(TEMPLATE, route, {
      siteUrl: 'https://maxrecursion.github.io/AutoVerse',
      basePath: '/AutoVerse/',
    })
    expect(pagesHtml).toContain('href="https://maxrecursion.github.io/AutoVerse/topics/fuel-injection"')
    expect(pagesHtml).toContain('href="/AutoVerse/learn/fuel-and-ignition"')
    expect(pagesHtml).toContain('href="/AutoVerse/"')
  })

  it('falls back to a noscript summary when the page is not rendered, and keeps the app script', () => {
    expect(html).not.toContain('<!--prerender:noscript-->')
    expect(html).toMatch(/<noscript>.*<h1>Fuel Injection<\/h1>.*<\/noscript>/s)
    expect(html).toContain('<script type="module" src="/assets/index.js"></script>')
  })

  it('puts the rendered page inside #root instead, with no noscript copy', () => {
    const rendered = renderDocument(TEMPLATE, route, { siteUrl: 'https://example.test', appHtml: '<main><h1>Fuel Injection</h1><p>Real content</p></main>' })
    expect(rendered).toContain('<div id="root"><!--prerender:app:start--><main><h1>Fuel Injection</h1><p>Real content</p></main><!--prerender:app:end--></div>')
    expect(rendered).not.toContain('<noscript>')
    expect(restoreTemplate(rendered)).toContain('<div id="root"></div>')
    expect(restoreTemplate(rendered)).toContain('<!--prerender:noscript-->')
    expect(renderDocument(rendered, route, { siteUrl: 'https://example.test', appHtml: '<p>again</p>' })).toContain('<div id="root"><!--prerender:app:start--><p>again</p><!--prerender:app:end--></div>')
  })

  it('merges site-wide and page JSON-LD into one graph', () => {
    const withGraph = renderDocument(TEMPLATE, route, { siteUrl: 'https://example.test', siteJsonLd: [{ '@type': 'Organization', name: 'AutoVerse' }] })
    const json = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/s.exec(withGraph)![1]!)
    expect(json['@context']).toBe('https://schema.org')
    expect(json['@graph'][0]).toEqual({ '@type': 'Organization', name: 'AutoVerse' })
    expect(json['@graph'].length).toBe(1 + route.jsonLd!.length)
  })

  it('adds ownership tags only when configured', () => {
    expect(html).not.toContain('google-site-verification')
    const verified = renderDocument(TEMPLATE, route, { siteUrl: 'https://example.test', verification: { google: 'g-token', bing: 'b-token' } })
    expect(verified).toContain('<meta name="google-site-verification" content="g-token" />')
    expect(verified).toContain('<meta name="msvalidate.01" content="b-token" />')
  })

  it('is idempotent when run over its own output', () => {
    expect(restoreTemplate(html)).toBe(TEMPLATE.replace('<title>AutoVerse — Understand Every Moving Part</title>', '<title>How Fuel Injection Works · AutoVerse</title>').replace('content="Default."', `content="${route.description}"`))
    expect(renderDocument(html, route, { siteUrl: 'https://example.test' })).toBe(html)
  })

  it('marks 404 pages noindex without a canonical', () => {
    const notFound = renderDocument(TEMPLATE, { ...route, path: '/404', noindex: true }, { siteUrl: 'https://example.test', siteJsonLd: [{ '@type': 'Organization' }] })
    expect(notFound).toContain('<meta name="robots" content="noindex, follow" />')
    expect(notFound).not.toContain('rel="canonical"')
    expect(notFound).not.toContain('application/ld+json')
  })

  it('rejects templates without the placeholder', () => {
    expect(() => renderDocument('<html><head></head><body></body></html>', route, { siteUrl: 'https://e.test' })).toThrow(/prerender:noscript/)
  })
})

describe('outputs', () => {
  it('maps routes to .html files (so the canonical URL itself answers 200) and rejects traversal', () => {
    expect(outputFileFor('/')).toBe('index.html')
    expect(outputFileFor('/topics/a')).toBe('topics/a.html')
    expect(() => outputFileFor('/topics/../../etc')).toThrow()
    expect(absoluteUrl('https://e.test/', '/')).toBe('https://e.test/')
  })

  it('builds a sitemap of indexable pages with each page’s own lastmod', () => {
    const xml = buildSitemap(routes, 'https://e.test', '2026-01-01')
    expect(xml).toContain('<loc>https://e.test/</loc>')
    expect(xml).toContain('<loc>https://e.test/learn</loc>')
    expect(xml).toMatch(/<loc>https:\/\/e\.test\/topics\/fuel-injection<\/loc>\s*<lastmod>2026-10-24<\/lastmod>/)
    expect(xml).not.toContain('/progress')
    const undated = buildSitemap([{ ...routes[0]!, modified: undefined }], 'https://e.test', '2026-01-01')
    expect(undated).toContain('<lastmod>2026-01-01</lastmod>')
  })

  it('sends trailing-slash URLs to their canonical form from the 404 fallback, but never the site root', () => {
    const script = trailingSlashRedirect('/AutoVerse/')
    expect(script).toContain('"/AutoVerse/"')
    expect(script).toContain('location.replace')
  })

  it('prepends route rewrites before the SPA fallback and replaces them on rerun', () => {
    const once = buildRedirects(routes, '/*  /index.html  200\n')
    expect(once).toContain('/topics/fuel-injection /topics/fuel-injection.html 200')
    expect(once.trim().endsWith('/*  /index.html  200')).toBe(true)
    expect(once.indexOf('/learn /learn.html 200')).toBeLessThan(once.indexOf('/*'))
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

describe('pioneers in the static build', () => {
  const pioneer: Pioneer = PioneerSchema.parse({
    id: 'test-person',
    name: 'Ada <Test>',
    role: 'Engineer',
    year: '1901',
    sortYear: 1901,
    categoryId: 'fuel-ignition',
    headline: 'Made a hot spark & more.',
    story: 'A story with <markup> & "quotes".',
    caution: 'Credit is shared.',
    topicIds: ['spark'],
    sources: [{ title: 'Source <one>', url: 'https://example.com/a?b=1&c=2', publisher: 'Example', accessed: '2026-10-25' }],
  })
  const routes = buildRoutes({ categories: [category], topics: [topic({ id: 'spark' }), topic({ id: 'other' })], labs: [], pioneers: [pioneer] })

  it('adds a /pioneers page that is readable without JavaScript, with escaped text and its sources', () => {
    const page = routes.find((r) => r.path === '/pioneers')!
    expect(page.title).toBe('Who Invented Car Parts? The Engineers Behind Them · AutoVerse')
    expect(page.bodyHtml).toContain('Ada &lt;Test&gt; (1901)')
    expect(page.bodyHtml).toContain('A story with &lt;markup&gt; &amp; &quot;quotes&quot;.')
    expect(page.bodyHtml).toContain('Worth knowing:</em> Credit is shared.')
    expect(page.bodyHtml).toContain('href="https://example.com/a?b=1&amp;c=2"')
    expect(page.bodyHtml).not.toContain('<markup>')
  })

  it('adds "The story behind it" only to lessons that have one', () => {
    expect(routes.find((r) => r.path === '/topics/spark')!.bodyHtml).toContain('<h2>The story behind it</h2>')
    expect(routes.find((r) => r.path === '/topics/other')!.bodyHtml).not.toContain('The story behind it')
  })
})
})

describe('AI agent files', () => {
  const t1 = topic({
    id: 'spark',
    title: 'Spark <Ignition>',
    faq: [{ question: 'Why is the spark timed early?', answer: 'Because the flame needs time to spread, so the spark comes before the piston reaches the top.' }],
    steps: [{ id: 'one', title: 'Charge', beginner: 'Plain words.', technical: 'Engineering words.', componentIds: [] }],
    keyConcepts: [{ term: 'Ignition advance', definition: 'Firing the spark before top dead centre.', equation: 'θ = ωt' }],
  })
  const ctx = { siteUrl: 'https://e.test', categories: [category], topics: [t1], labs, pioneers: [] }

  it('writes a complete Markdown twin of each lesson, both explanation levels included', () => {
    const md = topicMarkdown(t1, ctx)
    expect(md.startsWith('# Spark <Ignition>')).toBe(true)
    expect(md).toContain('## The idea, in plain language')
    expect(md).toContain('## The engineering explanation\n\nTechnical.')
    expect(md).toContain('1. **Charge.** Plain words. *In engineering terms:* Engineering words.')
    expect(md).toContain('- **Ignition advance**: Firing the spark before top dead centre. (`θ = ωt`)')
    expect(md).toContain('### Why is the spark timed early?')
    expect(md).toContain('Lesson page: https://e.test/topics/spark')
  })

  it('indexes every lesson in llms.txt, grouped by system, linking the Markdown twins', () => {
    const txt = buildLlmsTxt(ctx)
    expect(txt.startsWith('# AutoVerse\n\n> ')).toBe(true)
    expect(txt).toContain('## Fuel & Ignition')
    expect(txt).toContain('- [Spark <Ignition>](https://e.test/topics/spark.md): ')
    expect(txt).toContain('https://e.test/llms-full.txt')
  })

  it('puts every lesson in llms-full.txt', () => {
    expect(buildLlmsFullTxt(ctx)).toContain('# Spark <Ignition>')
  })

  it('names and allows search and AI crawlers, keeps private pages out, and points at the sitemap', () => {
    const robots = buildRobots('https://e.test/AutoVerse', ['/progress', '/certificate/'])
    for (const bot of ['GPTBot', 'OAI-SearchBot', 'ClaudeBot', 'Claude-SearchBot', 'PerplexityBot', 'Google-Extended', 'Bingbot']) expect(robots).toContain(`User-agent: ${bot}\nAllow: /`)
    expect(ALLOWED_CRAWLERS.length).toBeGreaterThanOrEqual(15)
    expect(robots).toContain('Disallow: /AutoVerse/progress')
    expect(robots).toContain('Disallow: /AutoVerse/certificate/')
    expect(robots).toContain('Sitemap: https://e.test/AutoVerse/sitemap.xml')
    expect(robots).not.toMatch(/Disallow: \/\s*$/m)
  })
})
