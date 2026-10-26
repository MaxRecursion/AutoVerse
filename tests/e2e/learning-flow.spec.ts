import { expect, test, type Page } from '@playwright/test'
import { open, reload } from './helpers'

/**
 * The learner's core loop, driven with real actions in a real browser:
 * start → read and try → finish → be taken to the next lesson → come back
 * and find the same state. Progress is local, so every test starts from an
 * empty browser profile.
 */

const stage = (page: Page, name: RegExp) => page.getByRole('navigation', { name: 'Lesson stages' }).getByRole('button', { name })
const centre = (page: Page, selector: string) => page.locator(selector).last().evaluate((el) => el.scrollIntoView({ block: 'center' }))

test.describe('start → finish → next', () => {
  test('a first-time learner starts, earns the stages, finishes, and is taken to the next lesson', async ({ page }) => {
    // 1. One obvious place to start, and the header agrees with the hero.
    await open(page, '/')
    await expect(page.getByRole('link', { name: /^Start here: How a Car Works: The Big Picture\. 0 of \d+ lessons complete\./ })).toBeVisible()
    await page.getByRole('main').getByRole('link', { name: 'Start Learning' }).click()
    await expect(page).toHaveURL(/\/topics\/how-a-car-works$/)
    await expect(page.getByRole('heading', { level: 1, name: 'How a Car Works: The Big Picture' })).toBeVisible()

    // 2. Nothing is ticked for the learner, and Finish is not on offer yet.
    await expect(stage(page, /Overview/)).not.toHaveAccessibleName(/done/)
    await expect(stage(page, /See it work/)).toHaveAccessibleName(/5 steps left to read/)
    await expect(page.getByRole('button', { name: /^Finish/ })).toHaveCount(0)

    // 3. Overview: reading the introduction to its end.
    await centre(page, '#introduction p')
    await expect(stage(page, /Overview/)).toHaveAccessibleName(/done/)

    // 4. See it work: every step read (each must stay on screen for a moment).
    const steps = page.locator('#steps li')
    for (let i = 0; i < (await steps.count()); i++) {
      await steps.nth(i).evaluate((el) => el.scrollIntoView({ block: 'center' }))
      await page.waitForTimeout(1700)
    }
    await expect(stage(page, /See it work/)).toHaveAccessibleName(/done/)

    // 5. Check: answer the quiz. The optional stages are still open.
    await centre(page, '#quiz')
    await page.getByRole('radio', { name: 'All questions' }).click()
    const questions = page.getByTestId(/^quiz-question-/)
    for (let i = 0; i < (await questions.count()); i++) await questions.nth(i).getByRole('button').first().click()
    await expect(page.getByLabel('Quiz result')).toBeVisible()
    await expect(stage(page, /Check/)).toHaveAccessibleName(/done/)
    await expect(stage(page, /Go deeper/)).not.toHaveAccessibleName(/done/)

    // 6. The core stages are done: the lesson says so and offers Finish.
    await expect(page.getByText('Core stages complete')).toBeVisible()
    const finish = page.getByRole('button', { name: /^Finish/ }).first()
    await expect(finish).toBeVisible()
    await finish.click()

    // 7. Completion is acknowledged and names exactly where to go next.
    await expect(page.getByText('Lesson complete: How a Car Works: The Big Picture')).toBeVisible()
    // The toast links straight to the next lesson (the header pill and finish card also point there).
    const next = page.getByRole('status').getByRole('link', { name: /^Next lesson: The Four-Stroke Cycle/ })
    await expect(next).toBeVisible()
    await next.click()

    // 8. Next lesson: right place on the route, and the earlier lesson is no longer "open".
    await expect(page).toHaveURL(/\/topics\/four-stroke-cycle$/)
    const route = page.getByRole('region', { name: 'Your place in this learning route' })
    await expect(route).toContainText('Step 2 of 9')
    await expect(route).toContainText('After this lesson')
    await expect(route).not.toContainText('still open')

    // 9. Refresh: the same state, on the lesson and on the progress page.
    await reload(page)
    await expect(page.getByRole('link', { name: /1 of \d+ lessons complete/ })).toBeVisible()
    await open(page, '/progress')
    await expect(page.getByRole('main')).toContainText('How a Car Works: The Big Picture')
  })

  test('opening a later lesson names what was skipped, instead of calling it "next"', async ({ page }) => {
    await open(page, '/topics/four-stroke-cycle')
    const route = page.getByRole('region', { name: 'Your place in this learning route' })
    await expect(route).toContainText('Step 2 of 9')
    await expect(route.getByRole('link', { name: /After this lesson\s*Torque and Power/ })).toBeVisible()
    await expect(route).toContainText('An earlier step is still open')
    await expect(route.getByRole('link', { name: 'How a Car Works: The Big Picture' })).toBeVisible()
  })

  test('a learner can finish early, but it is labelled as such', async ({ page }) => {
    await open(page, '/topics/how-a-car-works')
    await expect(page.getByRole('button', { name: /^Finish/ })).toHaveCount(0)
    await page.getByRole('button', { name: 'Mark complete anyway' }).click()
    await expect(page.getByText('Lesson complete: How a Car Works: The Big Picture')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Lesson complete' })).toBeVisible()
  })
})

test.describe('orientation', () => {
  test('a system hub offers one primary action and a surface → depth ladder', async ({ page }) => {
    await open(page, '/learn/engine')
    await expect(page.getByRole('heading', { level: 1, name: 'Engine' })).toBeVisible()
    const start = page.getByRole('link', { name: /^Start here: The Four-Stroke Cycle/ })
    await expect(start).toBeVisible()
    for (const rung of ['Surface', 'Mechanism', 'Engineering']) await expect(page.getByRole('region', { name: rung, exact: true })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Surface', exact: true })).toContainText('Up next')
    await start.click()
    await expect(page).toHaveURL(/\/topics\/four-stroke-cycle$/)
  })
})

test.describe('labs and stories', () => {
  test('selecting a part ticks a mission and shows who developed it', async ({ page }) => {
    test.setTimeout(90_000) // the live 3D engine renders in software, so each click can take seconds while other workers run
    await open(page, '/labs/engine')
    await expect(page.getByRole('heading', { level: 1, name: 'Four-Stroke Engine Laboratory' })).toBeVisible()

    // A real action ticks a mission and says so.
    await page.getByRole('tab', { name: 'Parts' }).click()
    const missions = page.getByTestId('lab-missions')
    const piston = missions.getByRole('listitem').filter({ hasText: 'Select the piston' })
    await expect(piston).not.toContainText('— done')
    await page.getByRole('button', { name: /^Piston$/ }).click()
    await expect(piston).toContainText('— done')
    await expect(page.getByText('Mission complete: Select the piston')).toBeVisible()

    // Selecting the spark plug shows who developed it.
    await page.getByRole('button', { name: /^Spark plug$/ }).click()
    const history = page.getByRole('link', { name: /History: Gottlob Honold, 1901/ })
    await expect(history).toBeVisible()

    // The story is one click away and open on arrival.
    await history.click()
    await expect(page).toHaveURL(/\/pioneers\?focus=gottlob-honold$/)
    await expect(page.locator('#pioneer-gottlob-honold').getByRole('button', { name: 'Hide the story' })).toBeVisible()
  })
})
