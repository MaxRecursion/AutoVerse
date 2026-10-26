import { expect, test, type Page } from '@playwright/test'
import { TOUR_STEPS } from '../../src/features/tour/steps'

/** The tour, in a real browser: every spotlight must land on a real element, across pages, on desktop and a phone. */

const startFromHeader = (page: Page) => page.getByRole('banner').getByRole('button', { name: 'Take the tour' }).click()

/** The spotlight overlaps the element it is meant to point at. */
async function expectSpotlightOn(page: Page, selectors: string[]) {
  const spot = page.getByTestId('tour-spotlight')
  await expect(spot).toBeVisible()
  await expect
    .poll(async () => {
      const s = await spot.boundingBox()
      for (const selector of selectors) {
        const t = await page.locator(selector).first().boundingBox()
        if (s && t && t.width > 0 && s.x < t.x + t.width && t.x < s.x + s.width && s.y < t.y + t.height && t.y < s.y + s.height) return true
      }
      return false
    })
    .toBe(true)
}

test.describe('product tour', () => {
  test('walks every step, spotlighting the real element on each page, then hands over to learning', async ({ page, isMobile }) => {
    test.setTimeout(90_000) // three real pages, two with software-rendered 3D
    await page.goto('/learn')
    await startFromHeader(page)
    const dialog = page.getByRole('dialog')

    // The page behind is inert while the tour is open.
    await expect(page.locator('#root')).toHaveAttribute('inert', '')

    for (const [i, step] of TOUR_STEPS.entries()) {
      await expect(dialog.getByRole('heading', { level: 2 })).toHaveText(step.title)
      await expect(dialog).toContainText(`${i + 1} of ${TOUR_STEPS.length}`)
      if (step.route) await expect(page).toHaveURL(new RegExp(`${step.route.replace(/\//g, '\\/')}$`))

      const selectors = [isMobile ? step.narrowTarget : undefined, step.target].filter((s): s is string => !!s)
      if (selectors.length > 0) await expectSpotlightOn(page, selectors)
      else await expect(page.getByTestId('tour-spotlight')).toHaveCount(0)

      // The card stays on screen.
      const box = await dialog.boundingBox()
      const viewport = page.viewportSize()!
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.y).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width)
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1)

      if (i < TOUR_STEPS.length - 1) await dialog.getByRole('button', { name: 'Next' }).click()
    }

    // Showing a lesson and a lab to the learner must not count as the learner's progress.
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('autoverse.progress') ?? '{}').state ?? {})
    expect(stored.recent ?? []).toEqual([])
    expect(stored.lessons ?? {}).toEqual({})
    expect(stored.missions ?? {}).toEqual({})

    // The last card offers a real next step: the very first lesson, as for any new learner.
    await dialog.getByRole('button', { name: 'Start learning' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.locator('#root')).not.toHaveAttribute('inert', '')
    await expect(page).toHaveURL(/\/topics\/how-a-car-works$/)
  })

  test('Esc leaves the tour and puts the learner back where they started', async ({ page }) => {
    await page.goto('/learn/engine')
    await startFromHeader(page)
    await expect(page).toHaveURL(/\/$/) // step 1 lives on the home page
    await page.getByRole('dialog').getByRole('button', { name: 'Next' }).click()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page).toHaveURL(/\/learn\/engine$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Engine' })).toBeVisible()
  })

  test('keyboard: arrows move between steps and focus lands on each heading', async ({ page }) => {
    await page.goto('/')
    await startFromHeader(page)
    const heading = page.getByRole('dialog').getByRole('heading', { level: 2 })
    await expect(heading).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await expect(heading).toHaveText(TOUR_STEPS[1]!.title)
    await expect(heading).toBeFocused()
    await page.keyboard.press('ArrowLeft')
    await expect(heading).toHaveText(TOUR_STEPS[0]!.title)
  })
})

test.describe('invitation', () => {
  test('is offered once to a new visitor, and never again after "No thanks"', async ({ page }) => {
    await page.goto('/')
    const invite = page.getByRole('region', { name: 'Product tour invitation' })
    // Generous: headless Chromium renders the 3D hero in software, which delays the invitation's timer.
    await expect(invite).toBeVisible({ timeout: 20_000 })
    await invite.getByRole('button', { name: 'No thanks' }).click()
    await expect(invite).toHaveCount(0)
    await page.reload()
    await page.waitForTimeout(6000)
    await expect(invite).toHaveCount(0)
  })

  test('"Show me around" starts the tour', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('region', { name: 'Product tour invitation' }).getByRole('button', { name: 'Show me around' }).click({ timeout: 20_000 })
    await expect(page.getByRole('dialog')).toContainText('Welcome to AutoVerse')
  })
})
