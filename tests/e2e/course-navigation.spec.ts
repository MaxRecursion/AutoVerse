import { expect, test, type Page } from '@playwright/test'
import { open, reload } from './helpers'

const desktopPanel = (page: Page) => page.getByRole('complementary', { name: 'Course navigation', exact: true })
const courseDialog = (page: Page) => page.getByRole('dialog', { name: 'Course navigation', exact: true })

async function coursePanel(page: Page) {
  if (page.viewportSize()!.width >= 1280) return desktopPanel(page)
  if (!(await courseDialog(page).isVisible())) await page.getByRole('button', { name: 'Open course navigation', exact: true }).click()
  await expect(courseDialog(page)).toBeVisible()
  return courseDialog(page)
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('autoverse.preferences')) {
      localStorage.setItem('autoverse.preferences', JSON.stringify({ state: { level: 'beginner', tourStatus: 'declined' }, version: 0 }))
    }
  })
})

test('the course outline shows the current lesson and updates from an explicit completion', async ({ page }) => {
  await open(page, '/topics/how-a-car-works')
  let panel = await coursePanel(page)
  const lessons = panel.getByRole('navigation', { name: 'Course lessons', exact: true })
  const current = lessons.getByRole('link', { name: /How a Car Works: The Big Picture/ })
  await expect(current).toHaveAttribute('aria-current', 'page')
  await expect(panel).toContainText('Lesson 1 of 9')
  await expect(panel).toContainText('0 of 9')
  await expect(lessons.locator('a[aria-current="page"]')).toHaveCount(1)

  if (page.viewportSize()!.width < 1280) await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Mark complete anyway', exact: true }).click()
  panel = await coursePanel(page)
  await expect(panel).toContainText('1 of 9')
  await expect(panel.getByRole('navigation', { name: 'Course lessons', exact: true }).getByRole('link', { name: /How a Car Works: The Big Picture/ })).toHaveAccessibleName(/complete/i)
})

test('choosing an overlapping course preserves that course, its position and its next lesson after refresh', async ({ page }) => {
  test.setTimeout(120_000)
  await open(page, '/learn')
  let panel = await coursePanel(page)
  const course = panel.getByLabel('Course', { exact: true })
  await course.focus()
  await course.selectOption({ label: 'Inside the engine' })
  await expect(course).toBeFocused()
  await panel.getByRole('navigation', { name: 'Course lessons', exact: true }).getByRole('link', { name: /The Four-Stroke Cycle/ }).click()
  await expect(page).toHaveURL(/\/topics\/four-stroke-cycle$/)
  await expect(courseDialog(page)).not.toBeVisible()
  const route = page.getByRole('region', { name: 'Your place in this learning route' })
  await expect(route).toContainText('Inside the engine')
  await expect(route).toContainText('Step 1 of 9')
  await expect(route.getByRole('link', { name: /After this lesson.*Pistons, Connecting Rods and the Crankshaft/ })).toBeVisible()

  await reload(page)
  panel = await coursePanel(page)
  await expect(panel.getByLabel('Course', { exact: true })).toHaveValue('inside-the-engine')
  await expect(panel).toContainText('Lesson 1 of 9')
  await expect(panel.getByRole('navigation', { name: 'Course lessons', exact: true }).getByRole('link', { name: /The Four-Stroke Cycle/ })).toHaveAttribute('aria-current', 'page')
  await expect(route).toContainText('Inside the engine')
  expect(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('autoverse.progress') ?? '{"state":{}}').state.completed ?? {}).length)).toBe(0)

  if (page.viewportSize()!.width < 1280) await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Mark complete anyway', exact: true }).click()
  await expect(page.getByRole('status').getByRole('link', { name: 'Next lesson: Pistons, Connecting Rods and the Crankshaft' })).toBeVisible()
  await open(page, '/')
  await expect(page.getByRole('main').getByRole('link', { name: 'Continue Learning', exact: true })).toHaveAttribute('href', '/topics/pistons-and-crankshaft')
  await expect(page.locator('[data-tour="progress-pill"]')).toHaveAttribute('href', '/topics/pistons-and-crankshaft')
  await expect(page.getByRole('main').getByRole('heading', { name: 'Inside the engine', exact: true })).toBeVisible()
  await open(page, '/progress')
  await expect(page.getByRole('article', { name: 'Inside the engine', exact: true }).getByRole('link', { name: 'Continue with Pistons, Connecting Rods and the Crankshaft', exact: true })).toHaveAttribute('href', '/topics/pistons-and-crankshaft')
  await page.getByRole('button', { name: 'Search lessons, labs and components', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Search AutoVerse', exact: true }).getByRole('option', { name: 'Next lesson: Pistons, Connecting Rods and the Crankshaft', exact: true })).toBeVisible()
})

test('the desktop outline can be collapsed and restored with the keyboard', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop sidebar control')
  await page.setViewportSize({ width: 1280, height: 900 })
  await open(page, '/topics/torque-and-power')
  await expect(desktopPanel(page)).toBeVisible()
  const collapse = page.getByRole('button', { name: 'Collapse course navigation', exact: true })
  await collapse.focus()
  await page.keyboard.press('Enter')
  await expect(desktopPanel(page)).not.toBeVisible()
  const expand = page.getByRole('button', { name: 'Expand course navigation', exact: true })
  await expect(expand).toBeVisible()
  await expect(expand).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(desktopPanel(page)).toBeVisible()
  await expect(collapse).toBeFocused()
  await expect(desktopPanel(page).getByRole('navigation', { name: 'Course lessons', exact: true }).getByRole('link', { name: /Torque and Power/ })).toHaveAttribute('aria-current', 'page')
})

test('starting a course from its progress card selects that course for a shared first lesson', async ({ page }) => {
  test.setTimeout(90_000)
  await open(page, '/progress')
  await page.getByRole('article', { name: 'Inside the engine', exact: true }).getByRole('link', { name: 'Start with The Four-Stroke Cycle', exact: true }).click()
  await expect(page).toHaveURL(/\/topics\/four-stroke-cycle$/)
  const route = page.getByRole('region', { name: 'Your place in this learning route' })
  await expect(route).toContainText('Inside the engine')
  await expect(route).toContainText('Step 1 of 9')
  const panel = await coursePanel(page)
  await expect(panel.getByLabel('Course', { exact: true })).toHaveValue('inside-the-engine')
})

test('choosing a course without the open lesson previews it and never leaves the page', async ({ page }) => {
  test.setTimeout(90_000)
  const savedCourse = () => page.evaluate(() => JSON.parse(localStorage.getItem('autoverse.preferences') ?? '{"state":{}}').state.courseId)
  await open(page, '/topics/four-stroke-cycle')
  let panel = await coursePanel(page)
  const course = panel.getByLabel('Course', { exact: true })
  const lessons = panel.getByRole('navigation', { name: 'Course lessons', exact: true })
  const route = page.getByRole('region', { name: 'Your place in this learning route' })
  await expect(course).toHaveValue('how-a-car-moves')

  // On Windows the arrow keys change a closed list one course at a time: every step must stay on this lesson.
  await course.focus()
  for (const label of ['Stopping, steering and grip', 'Inside the engine', 'Stopping, steering and grip']) {
    await course.selectOption({ label })
    await expect(page).toHaveURL(/\/topics\/four-stroke-cycle$/)
    await expect(course).toBeFocused()
  }

  // The course without this lesson is only previewed: its outline and next lesson, nothing saved.
  const preview = panel.getByTestId('course-preview')
  await expect(preview).toContainText('The Four-Stroke Cycle')
  await expect(course).toHaveValue('stopping-steering-and-grip')
  await expect(lessons.getByRole('link')).toHaveCount(7)
  await expect(lessons.locator('a[aria-current="page"]')).toHaveCount(0)
  await expect(panel.getByRole('link', { name: /Start here\s*Brake Hydraulics/ })).toHaveAttribute('href', /\/topics\/brake-hydraulics$/)
  await expect(route).toContainText('Inside the engine')
  expect(await savedCourse()).toBe('inside-the-engine')

  await preview.getByRole('button', { name: 'Back to Inside the engine', exact: true }).click()
  await expect(preview).toHaveCount(0)
  await expect(course).toHaveValue('inside-the-engine')
  await expect(course).toBeFocused()
  await expect(lessons.locator('a[aria-current="page"]')).toContainText('The Four-Stroke Cycle')

  // Opening one of the previewed course's lessons keeps that course.
  await course.selectOption({ label: 'Stopping, steering and grip' })
  await lessons.getByRole('link', { name: /Disc Brakes/ }).click()
  await expect(page).toHaveURL(/\/topics\/disc-brakes$/)
  await expect(courseDialog(page)).not.toBeVisible()
  // The new lesson has rendered, and its own route follows the course kept from the preview.
  await expect(route).toContainText('Stopping, steering and grip')
  await expect(route).toContainText('Step 2 of 7')
  panel = await coursePanel(page)
  await expect(panel.getByLabel('Course', { exact: true })).toHaveValue('stopping-steering-and-grip')
  await expect(panel.getByTestId('course-position')).toContainText('Lesson 2 of 7')
  expect(await savedCourse()).toBe('stopping-steering-and-grip')
  expect(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('autoverse.progress') ?? '{"state":{}}').state.completed ?? {}).length)).toBe(0)
})

test('a preview ends with its page visit, and its next-lesson link keeps the course', async ({ page }) => {
  test.setTimeout(90_000)
  const savedCourse = () => page.evaluate(() => JSON.parse(localStorage.getItem('autoverse.preferences') ?? '{"state":{}}').state.courseId)
  const heading = page.getByRole('heading', { level: 1 })
  const route = page.getByRole('region', { name: 'Your place in this learning route' })
  await open(page, '/topics/four-stroke-cycle')
  let panel = await coursePanel(page)
  await panel.getByLabel('Course', { exact: true }).selectOption({ label: 'Stopping, steering and grip' })
  await expect(panel.getByTestId('course-preview')).toBeVisible()

  // Leave through the lesson's own route panel, then come back with the browser's Back button.
  if (page.viewportSize()!.width < 1280) await page.keyboard.press('Escape')
  await route.getByRole('link', { name: /After this lesson.*Torque and Power/ }).click()
  await expect(heading).toHaveText('Torque and Power')
  await page.goBack()
  await expect(heading).toHaveText('The Four-Stroke Cycle')
  panel = await coursePanel(page)
  await expect(panel.getByTestId('course-preview')).toHaveCount(0)
  await expect(panel.getByLabel('Course', { exact: true })).toHaveValue('how-a-car-moves')
  await expect(panel.getByRole('navigation', { name: 'Course lessons', exact: true }).locator('a[aria-current="page"]')).toContainText('The Four-Stroke Cycle')

  // The preview's own next-lesson link opens a lesson of that course and keeps it.
  await panel.getByLabel('Course', { exact: true }).selectOption({ label: 'Stopping, steering and grip' })
  await panel.getByRole('link', { name: /Start here\s*Brake Hydraulics/ }).click()
  await expect(heading).toHaveText('Brake Hydraulics')
  expect(await savedCourse()).toBe('stopping-steering-and-grip')
  await expect(route).toContainText('Stopping, steering and grip')
})

test('the narrow-screen course drawer keeps navigation reachable, returns focus and closes after a lesson link', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 820 })
  await open(page, '/topics/how-a-car-works')
  await expect(desktopPanel(page)).not.toBeVisible()
  const trigger = page.getByRole('button', { name: 'Open course navigation', exact: true })
  await trigger.click()
  await expect(courseDialog(page)).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
  await page.keyboard.press('Escape')
  await expect(courseDialog(page)).not.toBeVisible()
  await expect(trigger).toBeFocused()
  await trigger.click()
  await courseDialog(page).getByRole('navigation', { name: 'Course lessons', exact: true }).getByRole('link', { name: /Torque and Power/ }).click()
  await expect(page).toHaveURL(/\/topics\/torque-and-power$/)
  await expect(courseDialog(page)).not.toBeVisible()
  await expect(trigger).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
})

test('All lessons includes every published lesson without awarding completion', async ({ page }) => {
  await open(page, '/learn')
  const panel = await coursePanel(page)
  await panel.getByLabel('Course', { exact: true }).selectOption({ label: 'All lessons' })
  const sitemap = await (await page.request.get('/sitemap.xml')).text()
  const topics = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]!).pathname).filter((path) => path.startsWith('/topics/')).sort()
  const links = await panel.getByRole('navigation', { name: 'Course lessons', exact: true }).locator('a[href]').evaluateAll((elements) => elements.map((el) => new URL(el.getAttribute('href')!, location.origin).pathname).sort())
  expect(links).toEqual(topics)
  expect(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('autoverse.progress') ?? '{"state":{}}').state.completed ?? {}).length)).toBe(0)
})

test('filtering and locating the current lesson only scrolls the course outline', async ({ page }) => {
  await open(page, '/topics/tyres-and-grip')
  let panel = await coursePanel(page)
  const course = panel.getByLabel('Course', { exact: true })
  const initialPageY = await page.evaluate(() => window.scrollY)
  await course.focus()
  await course.selectOption({ label: 'All lessons' })
  await expect(course).toBeFocused()
  expect(await page.evaluate(() => window.scrollY)).toBe(initialPageY)
  const route = page.getByRole('region', { name: 'Your place in this learning route' })
  const position = /Step (\d+) of (\d+)/.exec(await route.innerText())!
  await expect(panel.getByTestId('course-position')).toContainText(`Lesson ${position[1]} of ${position[2]}`)

  // Put the document at a real reading position; outline controls must leave it there.
  if (page.viewportSize()!.width < 1280) await page.keyboard.press('Escape')
  await page.locator('#introduction-heading').scrollIntoViewIfNeeded()
  panel = await coursePanel(page)
  const readingPageY = await page.evaluate(() => window.scrollY)
  const outline = panel.getByRole('navigation', { name: 'Course lessons', exact: true })
  const filter = panel.getByRole('searchbox', { name: 'Filter course lessons', exact: true })
  const allCount = await outline.getByRole('link').count()
  await filter.fill('tyre')
  const matches = outline.getByRole('link')
  await expect(matches.first()).toBeVisible()
  expect(await matches.count()).toBeLessThan(allCount)
  for (const name of await matches.allTextContents()) expect(name).toMatch(/tyre/i)

  const group = outline.getByRole('button', { name: /^Wheels & Tyres/ })
  const current = outline.getByRole('link', { name: /Tyres and Grip/ })
  await expect(group).toHaveAttribute('aria-expanded', 'true')
  await group.click()
  await expect(group).toHaveAttribute('aria-expanded', 'false')
  await expect(current).not.toBeVisible()
  await expect(outline.locator('a[aria-current="page"]')).toHaveCount(1)
  expect(await page.evaluate(() => window.scrollY)).toBe(readingPageY)

  await panel.getByRole('button', { name: 'Find current lesson', exact: true }).click()
  await expect(filter).toHaveValue('')
  await expect(group).toHaveAttribute('aria-expanded', 'true')
  await expect(current).toHaveAttribute('aria-current', 'page')
  await expect.poll(async () => current.evaluate((element) => {
    let container = element.parentElement
    while (container && getComputedStyle(container).overflowY !== 'auto') container = container.parentElement
    if (!container) return false
    const row = element.getBoundingClientRect()
    const viewport = container.getBoundingClientRect()
    return row.top >= viewport.top && row.bottom <= viewport.bottom
  })).toBe(true)
  expect(await page.evaluate(() => window.scrollY)).toBe(readingPageY)
  expect(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('autoverse.progress') ?? '{"state":{}}').state.completed ?? {}).length)).toBe(0)
})
