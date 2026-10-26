import { expect, test } from '@playwright/test'
import { open } from './helpers'

/**
 * Nothing may be wider than the screen on a phone. Horizontal overflow is not
 * just ugly: mobile browsers respond by widening the layout viewport, which
 * pushes fixed elements (toasts, the tour, the header) out of place.
 */
test.describe('phone layout', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone-width check')

  test('no page in the site is wider than the screen', async ({ page }) => {
    test.setTimeout(240_000)
    await page.addInitScript(() => localStorage.setItem('autoverse.preferences', JSON.stringify({ state: { level: 'beginner', tourStatus: 'declined', learnerName: '' }, version: 0 })))
    const sitemap = await (await page.request.get('/sitemap.xml')).text()
    const paths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]!).pathname)
    expect(paths.length).toBeGreaterThan(40)

    const wide: string[] = []
    for (const path of paths) {
      await open(page, path)
      await page.waitForLoadState('networkidle')
      const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }))
      if (scroll > inner) wide.push(`${path}: ${scroll}px > ${inner}px`)
    }
    expect(wide).toEqual([])
  })

  test('a completed lesson, with its finish card and toast, still fits', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('autoverse.preferences', JSON.stringify({ state: { level: 'beginner', tourStatus: 'declined', learnerName: '' }, version: 0 })))
    await open(page, '/topics/tyres-and-grip')
    await page.getByRole('button', { name: 'Mark complete anyway' }).click()
    await expect(page.getByText('Lesson complete: Tyres and Grip')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
    // The toast sits fully on screen.
    const box = await page.getByRole('status').getByText('Lesson complete: Tyres and Grip').locator('xpath=ancestor::div[contains(@class,"panel")]').boundingBox()
    const viewport = page.viewportSize()!
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width)
  })
})
