import { expect, test, type Locator, type Page } from '@playwright/test'
import { open, reload } from './helpers'

const lightToggle = (page: Page) => page.getByRole('button', { name: 'Switch to light mode', exact: true })
const darkToggle = (page: Page) => page.getByRole('button', { name: 'Switch to dark mode', exact: true })

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('autoverse.preferences', JSON.stringify({ state: { level: 'beginner', tourStatus: 'declined' }, version: 0 }))
  })
})

/** Measure the text against its painted ancestor surfaces, including translucent panels. */
async function readability(locator: Locator) {
  return locator.evaluate((element) => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const context = canvas.getContext('2d')!
    const colour = (css: string) => {
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = css
      context.fillRect(0, 0, 1, 1)
      return Array.from(context.getImageData(0, 0, 1, 1).data)
    }
    const luminance = (rgb: number[]) => rgb.slice(0, 3).map((v) => {
      const s = v / 255
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    }).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i]!, 0)
    const ancestors: Element[] = []
    for (let node: Element | null = element; node; node = node.parentElement) ancestors.unshift(node)
    let background = [255, 255, 255]
    for (const node of ancestors) {
      const rgba = colour(getComputedStyle(node).backgroundColor)
      const alpha = rgba[3]! / 255
      background = background.map((v, i) => rgba[i]! * alpha + v * (1 - alpha))
    }
    const foreground = colour(getComputedStyle(element).color)
    const a = luminance(foreground)
    const b = luminance(background)
    return { contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), background: b }
  })
}

test('switches instantly with the keyboard, keeps readable pages and dialogs, and remembers the choice', async ({ page }) => {
  await open(page, '/topics/torque-and-power')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  const before = await readability(page.locator('body'))
  const document = await page.evaluateHandle(() => window.document)
  await lightToggle(page).focus()
  await page.keyboard.press('Enter')
  await expect(darkToggle(page)).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  expect(await document.evaluate((retained) => retained === window.document), 'Theme switching does not reload the page').toBe(true)
  const after = await readability(page.locator('body'))
  expect(before.background).toBeLessThan(0.08)
  expect(after.background).toBeGreaterThan(0.8)
  expect((await readability(page.getByRole('heading', { level: 1 }))).contrast).toBeGreaterThanOrEqual(4.5)

  const wide = page.viewportSize()!.width >= 1280
  if (!wide) await page.getByRole('button', { name: 'Open course navigation', exact: true }).click()
  const panel = wide
    ? page.getByRole('complementary', { name: 'Course navigation', exact: true })
    : page.getByRole('dialog', { name: 'Course navigation', exact: true })
  expect((await readability(panel.getByLabel('Course', { exact: true }))).contrast).toBeGreaterThanOrEqual(4.5)
  if (!wide) await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Search lessons, labs and components', exact: true }).click()
  const search = page.getByRole('dialog', { name: 'Search AutoVerse', exact: true })
  const input = search.getByPlaceholder('Search lessons, labs, parts…')
  await input.fill('piston')
  await expect(search.getByRole('option').first()).toBeVisible()
  expect((await readability(input)).contrast).toBeGreaterThanOrEqual(4.5)
  expect((await readability(search.getByRole('option').first().locator('span').first())).contrast).toBeGreaterThanOrEqual(4.5)
  await page.keyboard.press('Escape')

  await page.locator('header').getByRole('link', { name: 'AutoVerse home', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await reload(page)
  await expect(darkToggle(page)).toBeVisible()
  expect((await readability(page.locator('body'))).background).toBeGreaterThan(0.8)
  await darkToggle(page).press('Space')
  await expect(lightToggle(page)).toBeVisible()
  expect((await readability(page.locator('body'))).background).toBeLessThan(0.08)
  expect(await page.evaluate(() => localStorage.getItem('autoverse.theme'))).toBe('dark')
})

test('applies a saved light theme before the app bundle loads', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('autoverse.theme', 'light'))
  // Only the tiny head bootstrap runs: this catches a dark first paint hidden by later React initialization.
  await page.route('**/assets/*.js', (route) => route.abort())
  await page.goto('/learn', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(page.locator('html')).not.toHaveClass(/\bdark\b/)
  await expect(page.locator('html')).not.toHaveAttribute('data-app', 'ready')
  expect((await readability(page.locator('body'))).background).toBeGreaterThan(0.8)
})

test('keeps open tabs in sync when the theme changes', async ({ page, context }) => {
  await open(page, '/')
  const other = await context.newPage()
  await open(other, '/learn')
  await lightToggle(page).click()
  await expect(darkToggle(other)).toBeVisible()
  expect((await readability(other.locator('body'))).background).toBeGreaterThan(0.8)
  await darkToggle(other).click()
  await expect(lightToggle(page)).toBeVisible()
  expect((await readability(page.locator('body'))).background).toBeLessThan(0.08)
  await other.close()
})

test('recovers from an invalid saved preference', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('autoverse.theme', '{broken theme}'))
  await open(page, '/')
  await expect(lightToggle(page)).toBeVisible()
  await lightToggle(page).click()
  await expect(darkToggle(page)).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('autoverse.theme'))).toBe('light')
})

test('still switches when theme storage is unavailable', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(() => {
    const read = Storage.prototype.getItem
    const write = Storage.prototype.setItem
    Storage.prototype.getItem = function (key) {
      if (key === 'autoverse.theme') throw new DOMException('Storage disabled', 'SecurityError')
      return read.call(this, key)
    }
    Storage.prototype.setItem = function (key, value) {
      if (key === 'autoverse.theme') throw new DOMException('Storage disabled', 'SecurityError')
      return write.call(this, key, value)
    }
  })
  await open(page, '/')
  await lightToggle(page).click()
  await expect(darkToggle(page)).toBeVisible()
  expect((await readability(page.locator('body'))).background).toBeGreaterThan(0.8)
  await darkToggle(page).click()
  await expect(lightToggle(page)).toBeVisible()
  expect(errors).toEqual([])
})

test('keeps the theme and menu controls reachable on a 320px phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 820 })
  await open(page, '/')
  await lightToggle(page).click()
  await expect(darkToggle(page)).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  const theme = await darkToggle(page).boundingBox()
  const menu = await page.getByRole('button', { name: 'Open menu', exact: true }).boundingBox()
  expect(theme!.x).toBeGreaterThanOrEqual(0)
  expect(menu!.x + menu!.width).toBeLessThanOrEqual(320)
  expect(theme!.x + theme!.width).toBeLessThanOrEqual(menu!.x)
  await page.getByRole('button', { name: 'Open menu', exact: true }).click()
  await expect(page.getByRole('navigation', { name: 'Mobile', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await darkToggle(page).click()
  await expect(lightToggle(page)).toBeVisible()
})

type ThemeAudioProbe = { contexts: AudioContext[] }

test('changes the theme during engine playback without resetting the engine or its 3D canvas', async ({ page }) => {
  test.setTimeout(120_000)
  await page.addInitScript(() => {
    const probe: ThemeAudioProbe = { contexts: [] }
    Object.assign(window, { __themeAudio: probe })
    const NativeContext = window.AudioContext
    window.AudioContext = class extends NativeContext {
      constructor(options?: AudioContextOptions) {
        super(options)
        probe.contexts.push(this)
      }
    }
  })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await open(page, '/sound-lab?engine=inline-3')
  const canvas = page.getByTestId('engine-cutaway').locator('canvas')
  await expect(canvas).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('engine-cutaway').getByTestId('scene-loading')).toHaveCount(0, { timeout: 30_000 })
  const heldCanvas = await canvas.elementHandle()
  const start = page.getByTestId('sound-lab-start')
  await start.click()
  await expect(start).toHaveText('Stop engine')
  const rpm = page.getByRole('slider', { name: 'Engine speed in rpm' })
  await rpm.press('PageUp')
  const target = await rpm.getAttribute('aria-valuenow')
  for (const next of ['light', 'dark'] as const) {
    await page.getByRole('button', { name: `Switch to ${next} mode`, exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', next)
    await expect(start).toHaveText('Stop engine')
    await expect(rpm).toHaveAttribute('aria-valuenow', target!)
    expect(await heldCanvas!.evaluate((element) => element.isConnected), 'The scene stays mounted during a theme change').toBe(true)
    expect(await page.evaluate(() => {
      const contexts = (window as unknown as { __themeAudio: ThemeAudioProbe }).__themeAudio.contexts
      return contexts.length === 1 && contexts[0]!.state === 'running'
    })).toBe(true)
    await expect(page).toHaveURL(/engine=inline-3$/)
  }
  await start.click()
  await expect(start).toHaveText('Start engine')
  expect(errors).toEqual([])
})
