import { expect, test } from '@playwright/test'
import { open } from './helpers'

/**
 * The header must fit at every width. It once overflowed by up to 79px between
 * 1024px and 1100px (nav plus the progress pill's text) and at 768px, which
 * widens the whole page and pushes fixed elements out of place.
 */
const WIDTHS = [360, 600, 768, 900, 1000, 1024, 1060, 1100, 1180, 1279, 1280, 1440, 1920]

test('the header and page never run wider than the window', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('autoverse.preferences', JSON.stringify({ state: { level: 'beginner', tourStatus: 'declined' }, version: 0 })))
  await open(page, '/')
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 800 })
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(over, `${width}px wide`).toBeLessThanOrEqual(0)
  }
})

test('the primary navigation shows from 1024px; below that the menu button stands in for it', async ({ page }) => {
  await open(page, '/')
  for (const [width, navVisible] of [[1023, false], [1024, true]] as const) {
    await page.setViewportSize({ width, height: 800 })
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible({ visible: navVisible })
    await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible({ visible: !navVisible })
  }
})
