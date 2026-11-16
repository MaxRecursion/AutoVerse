import { expect, test, type Locator, type Page } from '@playwright/test'
import { open } from './helpers'

const destinations = ['Sound Lab', 'Explore the Car', 'Learn', 'Labs', 'Pioneers', 'My Progress'] as const

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('autoverse.preferences', JSON.stringify({ state: { level: 'beginner', tourStatus: 'declined' }, version: 0 }))
  })
})

async function destinationNavigation(page: Page) {
  if (page.viewportSize()!.width >= 1280) return page.getByRole('navigation', { name: 'Primary', exact: true })
  const menu = page.getByRole('navigation', { name: 'Mobile', exact: true })
  if (!(await menu.isVisible())) await page.getByRole('button', { name: 'Open menu', exact: true }).click()
  await expect(menu).toBeVisible()
  return menu
}

async function closeMobileMenu(page: Page) {
  if (page.viewportSize()!.width < 1280) await page.keyboard.press('Escape')
}

async function coursePanel(page: Page) {
  if (page.viewportSize()!.width >= 1280) return page.getByRole('complementary', { name: 'Course navigation', exact: true })
  await page.getByRole('button', { name: 'Open course navigation', exact: true }).click()
  return page.getByRole('dialog', { name: 'Course navigation', exact: true })
}

const colour = (element: Locator) => element.evaluate((node) => getComputedStyle(node).color)

/** Contrast against the actual ancestor backgrounds, including transparent header and link surfaces. */
async function textContrast(element: Locator) {
  return element.evaluate((node) => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const context = canvas.getContext('2d')!
    const rgba = (value: string) => {
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = value
      context.fillRect(0, 0, 1, 1)
      return Array.from(context.getImageData(0, 0, 1, 1).data)
    }
    const luminance = (rgb: number[]) => rgb.slice(0, 3).map((value) => {
      const s = value / 255
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    }).reduce((total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index]!, 0)
    const ancestors: Element[] = []
    for (let current: Element | null = node; current; current = current.parentElement) ancestors.unshift(current)
    let background = [255, 255, 255]
    for (const ancestor of ancestors) {
      const paint = rgba(getComputedStyle(ancestor).backgroundColor)
      const alpha = paint[3]! / 255
      background = background.map((value, index) => paint[index]! * alpha + value * (1 - alpha))
    }
    const foreground = luminance(rgba(getComputedStyle(node).color))
    const behind = luminance(background)
    return (Math.max(foreground, behind) + 0.05) / (Math.min(foreground, behind) + 0.05)
  })
}

test('destination accents stay distinct, readable and consistent across navigation surfaces in both themes', async ({ page }) => {
  await open(page, '/topics/torque-and-power')
  for (const theme of ['dark', 'light'] as const) {
    if (theme === 'light') await page.getByRole('button', { name: 'Switch to light mode', exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    const navigation = await destinationNavigation(page)
    const colours = new Map<string, string>()
    for (const name of destinations) {
      const link = navigation.getByRole('link', { name, exact: true })
      await expect(link).toHaveAttribute('data-nav-accent', /\S+/)
      const marker = link.locator('[data-nav-marker]')
      await expect(marker).toBeVisible()
      colours.set(name, await colour(marker))
      await expect.poll(() => textContrast(link), { message: `${theme}: ${name} text remains readable` }).toBeGreaterThanOrEqual(4.5)
    }
    expect(new Set(colours.values()).size, `${theme}: each main destination has its own visible accent`).toBe(destinations.length)
    const current = navigation.getByRole('link', { name: 'Learn', exact: true })
    await expect(current).toHaveAttribute('aria-current', 'page')
    await expect(navigation.locator('a[aria-current="page"]')).toHaveCount(1)
    expect(await textContrast(current), `${theme}: active navigation text remains readable`).toBeGreaterThanOrEqual(4.5)
    await closeMobileMenu(page)

    const footer = page.getByRole('navigation', { name: 'Footer', exact: true })
    for (const [label, destination] of [
      ['Engine Sound Lab', 'Sound Lab'], ['Topic index', 'Learn'], ['Pioneers', 'Pioneers'], ['Local progress', 'My Progress'],
    ] as const) {
      const marker = footer.getByRole('link', { name: label, exact: true }).locator('[data-nav-marker]')
      expect(await colour(marker), `${label}: footer and main navigation use the same accent`).toBe(colours.get(destination))
    }
  }
})

test('keyboard navigation keeps the destination label and current-page marker after following a link', async ({ page }) => {
  await open(page, '/learn')
  const navigation = await destinationNavigation(page)
  const pioneers = navigation.getByRole('link', { name: 'Pioneers', exact: true })
  await pioneers.focus()
  await expect(pioneers).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/pioneers$/)
  const updated = await destinationNavigation(page)
  await expect(updated.getByRole('link', { name: 'Pioneers', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(updated.locator('a[aria-current="page"]')).toHaveCount(1)
  await closeMobileMenu(page)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})

test('lesson-stage accents preserve current-lesson wording and green completion checks', async ({ page }) => {
  await open(page, '/topics/torque-and-power')
  const stages = page.getByRole('navigation', { name: 'Lesson stages', exact: true })
  for (const theme of ['dark', 'light'] as const) {
    if (theme === 'light') await page.getByRole('button', { name: 'Switch to light mode', exact: true }).click()
    const markers = stages.locator('button[data-nav-accent] [data-stage-marker]')
    await expect(markers).toHaveCount(5)
    const colours = await markers.evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).color))
    expect(new Set(colours).size, `${theme}: stages have distinct accents before completion`).toBe(5)
    const panel = await coursePanel(page)
    const current = panel.getByRole('navigation', { name: 'Course lessons', exact: true }).locator('a[aria-current="page"]')
    await expect(current).toContainText('Torque and Power')
    await expect(current).toContainText('You are here')
    if (page.viewportSize()!.width < 1280) await page.keyboard.press('Escape')
  }

  // Earn the overview by reading its last paragraph, then explicitly complete the lesson.
  await page.locator('#introduction p[data-anchor]').last().scrollIntoViewIfNeeded()
  const overview = stages.getByRole('button', { name: /^Overview/ })
  await expect(overview).toHaveAttribute('data-stage-state', 'complete')
  const completedMarker = overview.locator('[data-stage-marker]')
  await expect(completedMarker.locator('svg')).toHaveCount(1)
  await page.getByRole('button', { name: 'Mark complete anyway', exact: true }).click()
  const panel = await coursePanel(page)
  const current = panel.getByRole('navigation', { name: 'Course lessons', exact: true }).locator('a[aria-current="page"]')
  await expect(current).toHaveAccessibleName(/Current lesson.*Completed/)
  await expect(current).toContainText('You are here')
  const green = await colour(current.locator('svg.lucide-check'))
  if (page.viewportSize()!.width < 1280) await page.keyboard.press('Escape')
  // The earned stage animates from its accent into green; wait for that colour transition to settle.
  await expect.poll(() => colour(completedMarker), { message: 'Completed stages retain the lesson completion colour' }).toBe(green)
})
