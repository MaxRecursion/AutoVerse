import { expect, test, type Page } from '@playwright/test'
import { open } from './helpers'

const revs = async (page: Page) => Number((await page.getByTestId('sound-lab-tach').innerText()).replace(/\D/g, ''))

/** Sample rendered piston positions across real browser animation frames. */
async function pistonFrames(page: Page, frames = 12) {
  return page.getByTestId('cylinder-layout').evaluate(async (diagram, count) => {
    const samples: string[] = []
    for (let i = 0; i < count; i++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      samples.push(Array.from(diagram.querySelectorAll('[data-cylinder] g[transform^="translate(0 "]')).map((node) => node.getAttribute('transform')).join('|'))
    }
    return samples
  }, frames)
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('autoverse.preferences', JSON.stringify({ state: { level: 'beginner', tourStatus: 'declined' }, version: 0 })))
})

test('pistons move together, live RPM follows a held rev, and stopping leaves a still drawing', async ({ page }) => {
  test.setTimeout(60_000)
  await open(page, '/sound-lab?engine=v10-s85')
  const start = page.getByTestId('sound-lab-start')
  expect(new Set(await pistonFrames(page)).size).toBe(1)
  await start.click()
  await expect.poll(() => revs(page)).toBeGreaterThan(1000)
  const moving = await pistonFrames(page)
  expect(moving.every(Boolean)).toBe(true)
  expect(new Set(moving).size).toBeGreaterThan(8)

  const rev = page.getByRole('button', { name: 'Hold to rev' })
  await rev.focus()
  await page.keyboard.down('Space')
  await expect(rev).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => revs(page)).toBeGreaterThan(8300)
  await expect(page.getByTestId('sound-lab-limiter')).toHaveAttribute('data-on', 'true')
  await page.keyboard.up('Space')
  await expect.poll(() => revs(page)).toBeLessThan(3000)
  await expect(page.getByTestId('sound-lab-limiter')).toHaveAttribute('data-on', 'false')
  // Actual speed must be available to assistive technology as well as visually.
  expect(await page.getByTestId('sound-lab-tach').evaluate((node) => node.closest('[aria-hidden="true"]') === null)).toBe(true)

  await start.click()
  await expect(start).toHaveText('Start engine')
  await expect.poll(() => revs(page)).toBe(0)
  expect(new Set(await pistonFrames(page)).size).toBe(1)
  await expect(page.getByTestId('cylinder-layout').locator('[data-firing="true"]')).toHaveCount(0)
})

test('changing to reduced motion clears live effects and freezes the cylinders while audio remains controllable', async ({ page }) => {
  await open(page, '/sound-lab?engine=v10-viper')
  await page.getByTestId('sound-lab-start').click()
  await expect.poll(() => revs(page)).toBeGreaterThan(500)
  const ring = page.getByRole('img', { name: /^Firing positions over one 720/ })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.getByText('Still view (reduced motion)', { exact: true })).toBeVisible()
  // Wait two paint frames for the preference subscription and effect cleanup.
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  expect(await ring.evaluate((node) => node.getAnimations({ subtree: true }).filter((animation) => animation.playState === 'running').length)).toBe(0)
  expect(new Set(await pistonFrames(page)).size).toBe(1)
  await expect(page.getByTestId('cylinder-layout').locator('[data-firing="true"]')).toHaveCount(0)
  await expect(page.getByTestId('sound-lab-start')).toHaveText('Stop engine')
  await page.getByTestId('sound-lab-start').click()
  await expect(page.getByTestId('sound-lab-start')).toHaveText('Start engine')
})

test('bank geometry settles to the keyboard-selected angle and the production setting restores it', async ({ page }) => {
  await open(page, '/sound-lab?engine=v10-carrera-gt')
  const bank = page.getByRole('slider', { name: 'Bank angle in degrees' })
  await bank.focus()
  await page.keyboard.press('End')
  const cylinder = page.getByTestId('cylinder-layout').locator('[data-cylinder="1"]')
  await expect(cylinder).toHaveAttribute('transform', /rotate\(-60\.00\)/)
  await page.getByRole('button', { name: 'Back to production' }).click()
  await expect(cylinder).toHaveAttribute('transform', /rotate\(-34\.00\)/)
})

test('the dial and rev button stay together and the player fits a 320px phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 })
  await open(page, '/sound-lab?engine=v10-tdi')
  const start = await page.getByTestId('sound-lab-start').boundingBox()
  const rev = await page.getByRole('button', { name: 'Hold to rev' }).boundingBox()
  expect(Math.abs(start!.y - rev!.y)).toBeLessThan(150)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
  const diagram = page.getByTestId('cylinder-layout')
  await expect(diagram.locator('[data-cylinder]')).toHaveCount(10)
  await expect(diagram).toHaveAttribute('data-bank-angle', '90')
})
