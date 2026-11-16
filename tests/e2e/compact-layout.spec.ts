import { expect, test } from '@playwright/test'
import { open } from './helpers'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('autoverse.preferences', JSON.stringify({ state: { level: 'beginner', tourStatus: 'declined' }, version: 0 })))
})

test('the month stays compact at wide and narrow widths, with usable day controls', async ({ page, isMobile }) => {
  for (const width of isMobile ? [320, 390] : [1280, 1920]) {
    await page.setViewportSize({ width, height: 900 })
    await open(page, '/progress')
    const calendar = page.getByTestId('activity-calendar')
    expect((await calendar.boundingBox())!.height).toBeLessThan(620)
    const day = calendar.getByRole('button', { name: /: no activity/ }).and(page.locator('button:enabled')).first()
    const bounds = (await day.boundingBox())!
    expect(bounds.height).toBeLessThanOrEqual(44)
    expect(bounds.height).toBeGreaterThanOrEqual(36)
    await day.click()
    await expect(calendar.getByText('Nothing recorded this day.')).toBeVisible()
    await calendar.getByRole('button', { name: 'Previous month' }).click()
    await expect(calendar.getByRole('button', { name: 'This month' })).toBeEnabled()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
  }
})

test('the engine workspace fits a laptop viewport, with an optional larger view', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Laptop workspace budget; phone controls are checked separately')
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page, '/sound-lab?engine=v10-viper')
  const canvas = page.getByTestId('engine-cutaway-canvas')
  await expect(canvas.locator('canvas')).toBeVisible()
  await expect(page.getByTestId('scene-loading')).toHaveCount(0)
  const workspace = page.getByTestId('engine-workspace')
  expect((await workspace.boundingBox())!.height).toBeLessThan(820)
  const model = (await page.getByTestId('engine-cutaway').boundingBox())!
  const data = (await page.getByTestId('engine-data-card').boundingBox())!
  expect(data.x).toBeGreaterThanOrEqual(model.x + model.width)
  expect(Math.abs(data.y - model.y)).toBeLessThan(1)
  await workspace.scrollIntoViewIfNeeded()
  const bounds = (await workspace.boundingBox())!
  expect(bounds.y).toBeGreaterThanOrEqual(56)
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(900)

  const originalCanvas = await canvas.locator('canvas').elementHandle()
  const compactHeight = (await canvas.boundingBox())!.height
  const speed = page.getByRole('slider', { name: 'Engine speed in rpm', exact: true })
  await speed.press('End')
  const rpm = await speed.getAttribute('aria-valuenow')
  await page.getByRole('button', { name: 'Expand engine view', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Use compact engine view', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect((await canvas.boundingBox())!.height).toBeGreaterThan(compactHeight * 1.5)
  expect(await originalCanvas!.evaluate((node) => node.isConnected)).toBe(true)
  await expect(speed).toHaveAttribute('aria-valuenow', rpm!)
  await page.getByRole('button', { name: 'Use compact engine view', exact: true }).click()
  expect((await canvas.boundingBox())!.height).toBe(compactHeight)
})

test('compact engine controls and disclosures stay usable at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 })
  await open(page, '/sound-lab?engine=v10-viper')
  await expect(page.getByTestId('engine-cutaway-canvas')).toBeVisible()
  await expect(page.getByRole('slider', { name: 'Throttle opening in percent', exact: true })).toBeVisible()
  const model = (await page.getByTestId('engine-cutaway').boundingBox())!
  const data = (await page.getByTestId('engine-data-card').boundingBox())!
  expect(data.y).toBeGreaterThanOrEqual(model.y + model.height)
  await page.getByText('View guide and exhaust notes', { exact: true }).click()
  await expect(page.getByTestId('v10-throw-note')).toBeVisible()
  await page.getByRole('button', { name: 'Inspect cylinder 10', exact: true }).press('Enter')
  await expect(page.getByRole('button', { name: 'Inspect cylinder 10', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
})
