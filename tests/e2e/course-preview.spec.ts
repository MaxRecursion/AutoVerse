import { expect, test, type Page } from '@playwright/test'
import { open, reload } from './helpers'

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Course navigation', exact: true })
const articleRoute = (page: Page) => page.locator('main').getByRole('region', { name: 'Your place in this learning route', includeHidden: true })
const preferences = (page: Page) => page.evaluate(() => localStorage.getItem('autoverse.preferences'))

async function panel(page: Page) {
  if (page.viewportSize()!.width >= 1280) return page.getByRole('complementary', { name: 'Course navigation', exact: true })
  if (!(await dialog(page).isVisible())) await page.getByRole('button', { name: 'Open course navigation', exact: true }).click()
  await expect(dialog(page)).toBeVisible()
  return dialog(page)
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('autoverse.preferences')) {
      localStorage.setItem('autoverse.preferences', JSON.stringify({ state: { level: 'beginner', tourStatus: 'declined', courseId: 'how-a-car-moves', courseNavigationCollapsed: false }, version: 0 }))
    }
  })
})

test('previewing another course keeps the open lesson and returns to its outline without saving', async ({ page }) => {
  await open(page, '/topics/how-a-car-works')
  const navigation = await panel(page)
  const course = navigation.getByLabel('Course', { exact: true })
  const outline = navigation.getByRole('navigation', { name: 'Course lessons', exact: true })
  const originalPreferences = await preferences(page)
  const originalRoute = (await articleRoute(page).textContent()) ?? ''
  await expect(course).toHaveValue('how-a-car-moves')

  await course.focus()
  await course.selectOption({ label: 'Inside the engine' })
  await expect(course).toBeFocused()
  await expect(page).toHaveURL(/\/topics\/how-a-car-works$/)
  await expect(articleRoute(page)).toHaveText(originalRoute)
  await expect(course).toHaveValue('inside-the-engine')
  const preview = navigation.getByTestId('course-preview')
  await expect(preview).toContainText('How a Car Works: The Big Picture')
  await expect(preview).toContainText('which isn’t part of this course.')
  await expect(outline.locator('a[aria-current="page"]')).toHaveCount(0)
  expect(await preferences(page)).toBe(originalPreferences)

  await preview.getByRole('button', { name: 'Back to How a car moves', exact: true }).click()
  await expect(preview).toHaveCount(0)
  await expect(course).toHaveValue('how-a-car-moves')
  await expect(course).toBeFocused()
  await expect(outline.getByRole('link', { name: /How a Car Works: The Big Picture/ })).toHaveAttribute('aria-current', 'page')
  await expect(page).toHaveURL(/\/topics\/how-a-car-works$/)
  await expect(articleRoute(page)).toHaveText(originalRoute)
  expect(await preferences(page)).toBe(originalPreferences)
})

test('opening a previewed course lesson saves that course and keeps it through refresh', async ({ page }) => {
  test.setTimeout(120_000)
  await open(page, '/topics/how-a-car-works')
  let navigation = await panel(page)
  const course = navigation.getByLabel('Course', { exact: true })
  const originalPreferences = await preferences(page)
  await course.focus()
  await course.selectOption({ label: 'Inside the engine' })
  await expect(course).toBeFocused()
  await expect(navigation.getByTestId('course-preview')).toBeVisible()
  await expect(page).toHaveURL(/\/topics\/how-a-car-works$/)
  expect(await preferences(page)).toBe(originalPreferences)

  await navigation.getByRole('navigation', { name: 'Course lessons', exact: true }).getByRole('link', { name: /The Four-Stroke Cycle/ }).click()
  await expect(page).toHaveURL(/\/topics\/four-stroke-cycle$/)
  await expect(dialog(page)).not.toBeVisible()
  await expect(articleRoute(page)).toContainText('Inside the engine')
  await expect(articleRoute(page)).toContainText('Step 1 of 9')
  expect(JSON.parse((await preferences(page))!).state.courseId).toBe('inside-the-engine')

  await reload(page)
  navigation = await panel(page)
  await expect(navigation.getByLabel('Course', { exact: true })).toHaveValue('inside-the-engine')
  await expect(navigation.getByTestId('course-preview')).toHaveCount(0)
  await expect(navigation.getByTestId('course-position')).toContainText('Lesson 1 of 9')
  await expect(navigation.getByRole('navigation', { name: 'Course lessons', exact: true }).getByRole('link', { name: /The Four-Stroke Cycle/ })).toHaveAttribute('aria-current', 'page')
  await expect(articleRoute(page)).toContainText('Inside the engine')
  await expect(articleRoute(page)).toContainText('Step 1 of 9')
  expect(JSON.parse((await preferences(page))!).state.courseId).toBe('inside-the-engine')
  expect(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('autoverse.progress') ?? '{"state":{}}').state.completed ?? {}).length)).toBe(0)
})

test('a direct lesson outside the saved course keeps header and lesson guidance together', async ({ page }) => {
  await open(page, '/topics/fuel-injection')
  await expect(articleRoute(page)).toContainText('Inside the engine')
  await expect(articleRoute(page)).toContainText('Step 5 of 9')
  await expect(page.locator('[data-tour="progress-pill"]')).toHaveAttribute('href', '/topics/engine-layouts')
  const navigation = await panel(page)
  await expect(navigation.getByLabel('Course', { exact: true })).toHaveValue('inside-the-engine')
  await expect(navigation.getByTestId('course-position')).toContainText('Lesson 5 of 9')
  await expect(navigation.getByRole('link', { name: /After this lesson.*Engine Layouts/ })).toHaveAttribute('href', '/topics/engine-layouts')
})
