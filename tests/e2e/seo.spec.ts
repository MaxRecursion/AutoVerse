import { expect, test } from '@playwright/test'
import { appReady } from './helpers'

/**
 * What search engines and AI crawlers receive. Most AI crawlers do not run
 * JavaScript, so every indexable page must carry its real content, metadata
 * and structured data in the HTML itself.
 */

const sitemapPaths = async (request: import('@playwright/test').APIRequestContext) => {
  const xml = await (await request.get('/sitemap.xml')).text()
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]!).pathname)
}
const textOf = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .split(/\s+/)
    .filter(Boolean)

test.describe('as a crawler sees it (raw HTML, no JavaScript)', () => {
  test.skip(({ isMobile }) => isMobile, 'HTML responses do not depend on the device')

  test('every page in the sitemap answers 200 with its own content, metadata and structured data', async ({ request, baseURL }) => {
    const paths = await sitemapPaths(request)
    expect(paths.length).toBeGreaterThanOrEqual(60)
    const titles = new Set<string>()
    const descriptions = new Set<string>()
    for (const path of paths) {
      const res = await request.get(path, { maxRedirects: 0 })
      expect(res.status(), path).toBe(200)
      const html = await res.text()
      const root = /<div id="root"><!--prerender:app:start-->([\s\S]*?)<!--prerender:app:end--><\/div>/.exec(html)?.[1] ?? ''
      expect(textOf(root).length, `${path}: words of real content in the HTML`).toBeGreaterThan(120)
      expect(root.match(/<h1[\s>]/g)?.length, `${path}: exactly one h1`).toBe(1)

      const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? ''
      const description = /<meta name="description" content="([^"]*)"/.exec(html)?.[1] ?? ''
      expect(title.length, `${path}: title`).toBeGreaterThan(10)
      expect(title.length, `${path}: title "${title}"`).toBeLessThanOrEqual(75)
      expect(description.length, `${path}: description`).toBeGreaterThanOrEqual(70)
      expect(description.length, `${path}: description`).toBeLessThanOrEqual(165)
      titles.add(title)
      descriptions.add(description)

      expect(html, path).toContain(`<link rel="canonical" href="${new URL(path, baseURL).href.replace(/\/$/, path === '/' ? '/' : '')}" />`)
      expect(html, path).toContain('content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1"')
      const json = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1]
      expect(json, `${path}: JSON-LD`).toBeDefined()
      const graph = JSON.parse(json!)['@graph'] as { '@type': string | string[] }[]
      const types = graph.flatMap((n) => ([] as string[]).concat(n['@type']))
      expect(types, path).toEqual(expect.arrayContaining(['Organization', 'WebSite']))
      expect(types.some((t) => /WebPage|CollectionPage|AboutPage/.test(t)), path).toBe(true)
      if (path.startsWith('/topics/')) expect(types, path).toEqual(expect.arrayContaining(['TechArticle', 'LearningResource', 'BreadcrumbList']))
    }
    expect(titles.size, 'every title is unique').toBe(paths.length)
    expect(descriptions.size, 'every description is unique').toBe(paths.length)
  })

  test('a lesson carries both explanation levels, its steps and links to related lessons in the HTML', async ({ request }) => {
    const html = await (await request.get('/topics/four-stroke-cycle')).text()
    expect(html).toContain('The engineering explanation')
    expect(html).toContain('Step by step')
    expect(html).toMatch(/href="\/topics\/pistons-and-crankshaft"/)
    expect(html).toContain('Nikolaus Otto') // the engineer story is in the page, collapsed
    expect(html).toContain('rel="alternate" type="text/markdown"')
  })

  test('personal pages stay out of search', async ({ request }) => {
    const html = await (await request.get('/progress')).text()
    expect(html).toContain('<meta name="robots" content="noindex, follow" />')
    expect(html).not.toContain('rel="canonical"')
    expect(await (await request.get('/sitemap.xml')).text()).not.toContain('/progress')
  })

  test('robots.txt welcomes search engines and AI crawlers and points at the sitemap', async ({ request }) => {
    const robots = await (await request.get('/robots.txt')).text()
    for (const bot of ['Googlebot', 'Bingbot', 'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'PerplexityBot', 'Google-Extended']) {
      expect(robots).toContain(`User-agent: ${bot}\nAllow: /`)
    }
    expect(robots).toMatch(/Sitemap: http:\/\/localhost:4173\/sitemap\.xml/)
  })

  test('llms.txt indexes every lesson, and each Markdown twin is served', async ({ request }) => {
    const txt = await (await request.get('/llms.txt')).text()
    const links = [...txt.matchAll(/\]\((http:\/\/localhost:4173\/topics\/[^)]+\.md)\)/g)].map((m) => new URL(m[1]!).pathname)
    expect(links.length).toBe((await sitemapPaths(request)).filter((p) => p.startsWith('/topics/')).length)
    for (const md of links.slice(0, 5)) {
      const res = await request.get(md)
      expect(res.status(), md).toBe(200)
      expect(await res.text()).toMatch(/^# .+\n\n> /)
    }
    expect((await (await request.get('/llms-full.txt')).text()).length).toBeGreaterThan(100_000)
  })
})

test.describe('when the app takes over', () => {
  test('replaces the static page without ever showing the loading screen, and without errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
    await page.addInitScript(() => {
      const w = window as unknown as { __sawLoading: boolean }
      w.__sawLoading = false
      new MutationObserver(() => {
        if (document.body?.innerText.includes('Loading AutoVerse')) w.__sawLoading = true
      }).observe(document, { childList: true, subtree: true, characterData: true })
    })
    await page.goto('/topics/four-stroke-cycle')
    await expect(page.getByRole('heading', { level: 1, name: 'The Four-Stroke Cycle' })).toBeVisible()
    await appReady(page)
    await expect(page.getByRole('heading', { level: 1, name: 'The Four-Stroke Cycle' })).toBeVisible()
    expect(await page.evaluate(() => (window as unknown as { __sawLoading: boolean }).__sawLoading)).toBe(false)
    expect(errors).toEqual([])
  })
})
