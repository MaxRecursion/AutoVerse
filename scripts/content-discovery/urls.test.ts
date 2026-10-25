import { describe, expect, it } from 'vitest'
import { isSameHost, looksLikeAsset, normalisePath, normaliseUrl, pathWithQuery, toAmpVariant } from './urls'
import { bestAnchorTitle, categorySlugOf, classifyUrl, normalise, titleFromSlug } from './site'

const opts = { hostAliases: { 'howacarworks.com': 'www.howacarworks.com' } }
const BASE = 'https://www.howacarworks.com/basics.amp'

describe('normaliseUrl', () => {
  it('collapses AMP and canonical variants to one key', () => {
    const canonical = 'https://www.howacarworks.com/basics/how-a-diesel-engine-works'
    expect(normaliseUrl('/basics/how-a-diesel-engine-works.amp', BASE, opts)).toBe(canonical)
    expect(normaliseUrl('https://www.howacarworks.com/basics/how-a-diesel-engine-works/', undefined, opts)).toBe(canonical)
    expect(normaliseUrl('https://www.howacarworks.com/basics/how-a-diesel-engine-works/amp', undefined, opts)).toBe(canonical)
    expect(normaliseUrl('/basics/how-a-diesel-engine-works?amp=1#intro', BASE, opts)).toBe(canonical)
  })

  it('maps the home page variants to the root', () => {
    expect(normaliseUrl('/index.amp', BASE, opts)).toBe('https://www.howacarworks.com/')
    expect(normaliseUrl('http://howacarworks.com/index.html', undefined, opts)).toBe('https://www.howacarworks.com/')
  })

  it('lower-cases the host, forces https, drops default ports, fragments and tracking params', () => {
    expect(normaliseUrl('HTTP://WWW.HowACarWorks.com:80/engine?utm_source=x&b=2&a=1#top', undefined, opts)).toBe(
      'https://www.howacarworks.com/engine?a=1&b=2',
    )
  })

  it('rejects non-http schemes, fragments-only and malformed links', () => {
    expect(normaliseUrl('mailto:someone@example.com', BASE)).toBeNull()
    expect(normaliseUrl('javascript:void(0)', BASE)).toBeNull()
    expect(normaliseUrl('#maincontent', BASE)).toBeNull()
    expect(normaliseUrl('   ', BASE)).toBeNull()
    expect(normaliseUrl('http://[bad', undefined)).toBeNull()
  })

  it('can keep AMP markers when asked', () => {
    expect(normaliseUrl('/engine.amp', BASE, { stripAmp: false })).toBe('https://www.howacarworks.com/engine.amp')
  })
})

describe('path helpers', () => {
  it('normalises duplicate and trailing slashes', () => {
    expect(normalisePath('//engine//pistons/')).toBe('/engine/pistons')
    expect(normalisePath('/')).toBe('/')
  })

  it('reports host, path+query, assets and AMP variants', () => {
    expect(isSameHost('https://www.howacarworks.com/a', 'www.howacarworks.com')).toBe(true)
    expect(isSameHost('https://play.google.com/a', 'www.howacarworks.com')).toBe(false)
    expect(isSameHost('not a url', 'x')).toBe(false)
    expect(pathWithQuery('https://x.test/a/b?c=1')).toBe('/a/b?c=1')
    expect(looksLikeAsset('https://x.test/img/car.JPG')).toBe(true)
    expect(looksLikeAsset('https://x.test/engine')).toBe(false)
    expect(toAmpVariant('https://www.howacarworks.com/engine')).toBe('https://www.howacarworks.com/engine.amp')
    expect(toAmpVariant('https://www.howacarworks.com/')).toBe('https://www.howacarworks.com/index.amp')
  })
})

describe('site classification', () => {
  it('classifies home, category, article, policy, excluded and external URLs', () => {
    expect(classifyUrl(normalise('/index.amp', BASE)!)).toBe('home')
    expect(classifyUrl(normalise('/engine.amp', BASE)!)).toBe('category')
    expect(classifyUrl(normalise('/engine.amp?page=2', BASE)!)).toBe('category')
    expect(classifyUrl(normalise('/basics/how-a-car-clutch-works.amp', BASE)!)).toBe('article')
    expect(classifyUrl(normalise('/about/', BASE)!)).toBe('policy')
    expect(classifyUrl(normalise('/terms', BASE)!)).toBe('policy')
    expect(classifyUrl(normalise('/video-course/watch/crankshaft', BASE)!)).toBe('excluded')
    expect(classifyUrl(normalise('/login', BASE)!)).toBe('excluded')
    expect(classifyUrl(normalise('/tag/clutch', BASE)!)).toBe('excluded')
    expect(classifyUrl(normalise('/engine?sort=new', BASE)!)).toBe('excluded')
    expect(classifyUrl(normalise('/a/b/c', BASE)!)).toBe('excluded')
    expect(classifyUrl('https://play.google.com/store/apps')).toBe('external')
  })

  it('derives the category slug from the path', () => {
    expect(categorySlugOf('https://www.howacarworks.com/brakes/how-disc-brakes-work')).toBe('brakes')
    expect(categorySlugOf('https://www.howacarworks.com/brakes')).toBe('brakes')
    expect(categorySlugOf('https://www.howacarworks.com/login')).toBeUndefined()
  })

  it('builds fallback titles from slugs', () => {
    expect(titleFromSlug('how-a-car-clutch-works')).toBe('How a car clutch works')
    expect(titleFromSlug('')).toBe('')
  })

  it('picks the most frequent sensible anchor text and ignores generic or teaser text', () => {
    expect(bestAnchorTitle(['Read more', 'The engine', 'The engine', 'Engine'])).toBe('The engine')
    expect(bestAnchorTitle(['Read more', 'x'.repeat(200)])).toBeUndefined()
    expect(bestAnchorTitle([])).toBeUndefined()
  })
})
