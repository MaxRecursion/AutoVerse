import { describe, expect, it } from 'vitest'
import {
  bestPageTitle,
  cleanTitle,
  decodeEntities,
  detectReuseSignals,
  extractAmpHtml,
  extractBreadcrumbs,
  extractCanonical,
  extractLinks,
  extractTitles,
  parseAttributes,
  textContent,
} from './extract'

describe('entity and text helpers', () => {
  it('decodes named and numeric entities', () => {
    expect(decodeEntities('Start &rarr; &amp; go &#8212; &#x2014; &copy;')).toBe('Start &rarr; & go — — ©')
  })

  it('strips tags, scripts and collapses whitespace', () => {
    expect(textContent('<p>Hello <b>world</b></p><script>var x = 1</script>\n  ok')).toBe('Hello world ok')
  })

  it('parses quoted, unquoted and boolean attributes', () => {
    expect(parseAttributes(' href="/a" class=card data-x=\'y\' hidden')).toEqual({
      href: '/a',
      class: 'card',
      'data-x': 'y',
      hidden: '',
    })
  })
})

describe('extractLinks', () => {
  it('keeps only the heading of card-style anchors (never the teaser paragraph)', () => {
    const html = `
      <a class="card" href="/basics/the-engine.amp">
        <div class="card-image"></div>
        <div class="card-block"><h3 class="card-title">The engine</h3><p>Long teaser text that must not be kept…</p></div>
      </a>`
    expect(extractLinks(html)).toEqual([{ href: '/basics/the-engine.amp', text: 'The engine' }])
  })

  it('falls back to aria-label, title and image alt text', () => {
    const html = `
      <a href="/a" aria-label="Alpha"><svg></svg></a>
      <a href="/b" title="Beta"></a>
      <a href="/c"><amp-img alt="Gamma"></amp-img></a>
      <a name="anchor-without-href">x</a>`
    expect(extractLinks(html).map((l) => [l.href, l.text])).toEqual([
      ['/a', 'Alpha'],
      ['/b', 'Beta'],
      ['/c', 'Gamma'],
    ])
  })

  it('records rel attributes', () => {
    expect(extractLinks('<a rel="nofollow" href="/x">X</a>')[0]).toEqual({ href: '/x', text: 'X', rel: 'nofollow' })
  })
})

describe('titles, canonical and AMP links', () => {
  const html = `<html><head>
    <title>Pistons | How a Car Works</title>
    <meta property="og:title" content="How a Car Works">
    <link rel="canonical" href="https://www.howacarworks.com/engine/pistons">
    <link rel="amphtml" href="https://www.howacarworks.com/engine/pistons.amp">
  </head><body><h1>How &amp; why pistons move</h1></body></html>`

  it('extracts the document, og and heading titles', () => {
    expect(extractTitles(html)).toEqual({ document: 'Pistons | How a Car Works', openGraph: 'How a Car Works', heading: 'How & why pistons move' })
  })

  it('prefers the h1 and strips site-name decorations', () => {
    expect(bestPageTitle(extractTitles(html), ['How a Car Works'])).toBe('How & why pistons move')
    expect(cleanTitle('How a Car Works — Brakes', ['How a Car Works'])).toBe('Brakes')
    expect(bestPageTitle({ document: 'Brakes | How a Car Works' }, ['How a Car Works'])).toBe('Brakes')
    expect(bestPageTitle({}, ['x'])).toBeUndefined()
  })

  it('finds canonical and amphtml links', () => {
    expect(extractCanonical(html)).toBe('https://www.howacarworks.com/engine/pistons')
    expect(extractAmpHtml(html)).toBe('https://www.howacarworks.com/engine/pistons.amp')
    expect(extractCanonical('<p>none</p>')).toBeUndefined()
  })
})

describe('extractBreadcrumbs', () => {
  it('reads JSON-LD BreadcrumbList in position order', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 2, name: 'Engine', item: 'https://x.test/engine' },
            { '@type': 'ListItem', position: 1, name: 'Home', item: { '@id': 'https://x.test/' } },
            { '@type': 'ListItem', position: 3, name: 'Pistons' },
          ],
        },
      ],
    })}</script>`
    expect(extractBreadcrumbs(html)).toEqual([
      { name: 'Home', url: 'https://x.test/' },
      { name: 'Engine', url: 'https://x.test/engine' },
      { name: 'Pistons' },
    ])
  })

  it('falls back to a breadcrumb-classed list and ignores malformed JSON-LD', () => {
    const html = `<script type="application/ld+json">{oops</script>
      <ol class="breadcrumb"><li><a href="/">Home</a></li><li><a href="/brakes">Brakes</a></li></ol>`
    expect(extractBreadcrumbs(html)).toEqual([
      { name: 'Home', url: '/' },
      { name: 'Brakes', url: '/brakes' },
    ])
    expect(extractBreadcrumbs('<p>none</p>')).toEqual([])
  })
})

describe('detectReuseSignals', () => {
  it('flags licence-related wording without keeping the text', () => {
    expect(detectReuseSignals('<footer>© 2020 Example. All rights reserved. May not be reproduced without written permission.</footer>')).toEqual({
      mentionsCopyright: true,
      mentionsAllRightsReserved: true,
      mentionsCreativeCommons: false,
      mentionsPermissionRequired: true,
      mentionsOpenLicence: false,
    })
    expect(detectReuseSignals('<p>Licensed under Creative Commons CC-BY 4.0</p>').mentionsCreativeCommons).toBe(true)
  })
})
