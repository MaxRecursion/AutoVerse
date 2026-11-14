import { expect, test, type Page } from '@playwright/test'
import { open } from './helpers'

async function ready(page: Page) {
  const view = page.getByTestId('engine-cutaway')
  await expect(view).toBeVisible()
  await expect(view.locator('canvas')).toBeVisible()
  await expect(view.getByTestId('scene-loading')).toHaveCount(0, { timeout: 20_000 })
  return view
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('autoverse.preferences', JSON.stringify({ state: { level: 'beginner', tourStatus: 'declined' }, version: 0 })))
})

test('renders a moving mechanical cutaway, selects cylinders and offers keyboard camera controls', async ({ page }) => {
  test.setTimeout(90_000) // Software-rendered WebGL plus two PNG captures and camera transitions.
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await open(page, '/sound-lab?engine=v10-viper')
  const view = await ready(page)
  await expect(view).toHaveAttribute('data-view', 'detail')
  await expect(page.getByRole('img', { name: /3D mechanical cutaway of cylinder 1/ })).toBeVisible()
  await page.getByTestId('sound-lab-start').click()
  await expect.poll(async () => Number((await page.getByTestId('sound-lab-tach').innerText()).replace(/\D/g, ''))).toBeGreaterThan(900)
  const canvas = view.locator('canvas')
  await canvas.scrollIntoViewIfNeeded()
  const first = await canvas.screenshot()
  await page.evaluate(() => new Promise<void>((resolve) => {
    let frames = 0
    const tick = () => { if (++frames >= 15) resolve(); else requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
  }))
  expect((await canvas.screenshot()).equals(first), 'the rendered piston/cams/valves move').toBe(false)

  await page.getByRole('button', { name: 'Inspect cylinder 10', exact: true }).click()
  await expect(page.getByRole('img', { name: /3D mechanical cutaway of cylinder 10/ })).toBeVisible()
  const rotate = page.getByRole('button', { name: 'Rotate engine left', exact: true })
  await expect(rotate).toBeEnabled()
  await rotate.focus()
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Reset 3D camera', exact: true }).click()
  await page.getByRole('radio', { name: 'Whole engine', exact: true }).click()
  await expect(view).toHaveAttribute('data-view', 'engine')
  await expect(page.getByRole('img', { name: /3D mechanical cutaway of the 10-cylinder/ })).toBeVisible()
  await expect(view.getByRole('group', { name: 'Choose a cylinder cutaway' }).getByRole('button')).toHaveCount(10)
  await page.getByTestId('sound-lab-start').click()
  expect(errors).toEqual([])
})

test('keeps the mechanical cutaway usable without WebGL', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...args: unknown[]) {
      if (kind === 'webgl' || kind === 'webgl2' || kind === 'experimental-webgl') return null
      return Reflect.apply(original, this, [kind, ...args])
    } as typeof original
  })
  await open(page, '/sound-lab?engine=inline-3')
  const fallback = page.getByTestId('cutaway-fallback-layout')
  await expect(fallback).toBeVisible()
  await expect(fallback.locator('[data-cylinder]')).toHaveCount(3)
  await expect(page.getByRole('button', { name: 'Reset 3D camera', exact: true })).toBeDisabled()
  await expect(page.getByTestId('sound-lab-start')).toBeEnabled()
})
