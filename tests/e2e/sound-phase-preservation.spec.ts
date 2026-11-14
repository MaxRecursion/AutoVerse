import { expect, test } from '@playwright/test'
import { open } from './helpers'

test('restores the same paused cutaway pose after a crankpin experiment', async ({ page }) => {
  test.setTimeout(90_000)
  await page.addInitScript(() => localStorage.setItem('autoverse.preferences', JSON.stringify({ state: { level: 'beginner', tourStatus: 'declined' }, version: 0 })))
  await open(page, '/sound-lab?engine=v6-90-odd')
  const view = page.getByTestId('engine-cutaway')
  await expect(view.locator('canvas')).toBeVisible()
  await expect(view.getByTestId('scene-loading')).toHaveCount(0, { timeout: 20_000 })
  await page.getByRole('button', { name: 'Inspect cylinder 6', exact: true }).click()
  const start = page.getByTestId('sound-lab-start')
  await start.click()
  await expect.poll(async () => Number((await page.getByTestId('sound-lab-tach').innerText()).replace(/\D/g, ''))).toBeGreaterThan(800)
  await start.click()
  await expect(page.getByTestId('sound-lab-tach')).toHaveText('0')

  const canvas = view.locator('canvas')
  const capture = async () => {
    await canvas.scrollIntoViewIfNeeded()
    const box = (await canvas.boundingBox())!
    // Exclude the border: fractional page scroll can include an adjacent row of pixels.
    return page.screenshot({ scale: 'css', clip: { x: Math.ceil(box.x) + 2, y: Math.ceil(box.y) + 2, width: Math.floor(box.width) - 4, height: Math.floor(box.height) - 4 } })
  }
  const before = await capture()
  // The crank remains frozen at its current position while cylinder phases change.
  await page.getByRole('button', { name: 'Make it fire evenly', exact: true }).click()
  await expect(page.getByTestId('sound-lab-intervals')).toContainText('120°')
  expect((await capture()).equals(before)).toBe(false)
  await page.getByRole('button', { name: 'Back to production', exact: true }).click()
  await expect.poll(async () => (await capture()).equals(before)).toBe(true)
})
