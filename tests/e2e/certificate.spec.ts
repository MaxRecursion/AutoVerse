import { expect, test, type Page } from '@playwright/test'

/**
 * Certificates, in a real browser. Finishing a whole course by hand is the same
 * loop as learning-flow.spec.ts nine times over, so these tests start from a
 * learner who has already done the work (seeded local progress) and check what
 * the certificate does with it.
 */

const COURSE = 'how-a-car-moves'
const LESSONS = ['how-a-car-works', 'four-stroke-cycle', 'torque-and-power', 'clutch', 'manual-gearbox', 'gear-ratios', 'differential', 'drivetrain-layouts', 'tyres-and-grip']

/** Local progress as the app stores it: every lesson of the course done, every quiz taken. */
async function seedFinishedCourse(page: Page, { except = [] as string[] } = {}) {
  await page.addInitScript(
    ({ lessons, except }) => {
      const at = '2026-10-26T10:00:00.000Z'
      const state = {
        recent: [],
        completed: Object.fromEntries(lessons.filter((id) => !except.includes(id)).map((id) => [id, at])),
        bookmarks: [],
        quizScores: Object.fromEntries(lessons.filter((id) => !except.includes(id)).map((id) => [id, { score: 3, total: 3, at }])),
        lessons: {},
        missions: {},
        certificates: {},
      }
      if (!localStorage.getItem('autoverse.progress')) localStorage.setItem('autoverse.progress', JSON.stringify({ state, version: 1 }))
      // Keep the first-visit invitation out of the way (without overwriting a name the test has saved).
      if (!localStorage.getItem('autoverse.preferences')) {
        localStorage.setItem('autoverse.preferences', JSON.stringify({ state: { level: 'beginner', tourStatus: 'declined', learnerName: '' }, version: 0 }))
      }
    },
    { lessons: LESSONS, except },
  )
}

test.describe('certificate', () => {
  test('is awarded for a finished course, needs a name, and prints only the certificate', async ({ page }) => {
    await seedFinishedCourse(page)
    await page.addInitScript(() => {
      ;(window as unknown as { __printed: number }).__printed = 0
      window.print = () => void ((window as unknown as { __printed: number }).__printed += 1)
    })

    // The progress page notices the finished course and holds the certificate.
    await page.goto('/progress')
    const card = page.getByRole('article', { name: /^Certificate: How a car moves/ })
    await expect(card).toContainText('Earned')
    await card.getByRole('link', { name: 'View certificate' }).click()
    await expect(page).toHaveURL(new RegExp(`/certificate/${COURSE}$`))

    // Printing needs a name; the certificate shows it, the course and a reference number.
    const print = page.getByRole('button', { name: /print or save as pdf/i })
    await expect(print).toBeDisabled()
    const cert = page.locator('#certificate')
    await expect(cert).toContainText('Your name')
    await page.getByRole('textbox', { name: 'Name on the certificate' }).fill('Ada Lovelace')
    await expect(cert).toContainText('Ada Lovelace')
    await expect(cert).toContainText('How a car moves')
    await expect(cert).toContainText(/AV-[0-9A-Z]{3}-[0-9A-Z]{4}/)
    await expect(cert).toContainText('not independently verified')
    await expect(print).toBeEnabled()
    await print.click()
    expect(await page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(1)

    // The name is remembered on a reload.
    await page.reload()
    await expect(page.getByRole('textbox', { name: 'Name on the certificate' })).toHaveValue('Ada Lovelace')

    // In print, the site chrome disappears and only the certificate remains.
    await page.emulateMedia({ media: 'print' })
    await expect(cert).toBeVisible()
    await expect(page.getByRole('banner')).toBeHidden()
    await expect(page.getByRole('textbox', { name: 'Name on the certificate' })).toBeHidden()
    const box = await cert.boundingBox()
    const viewport = page.viewportSize()!
    expect(Math.round(box!.width)).toBe(viewport.width)
  })

  test('is not awarded one lesson short, and says what is left', async ({ page }) => {
    await seedFinishedCourse(page, { except: ['tyres-and-grip'] })
    await page.goto(`/certificate/${COURSE}`)
    await expect(page.getByText('Not earned yet')).toBeVisible()
    await expect(page.locator('#certificate')).toHaveCount(0)
    await expect(page.getByText('8 of 9 lessons · 8 of 9 quizzes')).toBeVisible()
    await expect(page.getByRole('main').getByRole('link', { name: /^Next lesson: Tyres and Grip/ })).toBeVisible()
  })

  test('finishing the last lesson awards it on the spot, with a link to it', async ({ page }) => {
    await seedFinishedCourse(page, { except: ['tyres-and-grip'] })
    await page.goto('/topics/tyres-and-grip')
    await page.getByRole('button', { name: 'Mark complete anyway' }).click()
    // The lesson's own quiz is still missing, so completing the lesson alone is not enough.
    await expect(page.getByText('Lesson complete: ')).toBeVisible()
    await page.getByRole('button', { name: 'Dismiss notification' }).click() // a learner would clear it before the quiz
    await expect(page.getByText(/^Course complete: /)).toHaveCount(0)

    // Taking the quiz is what completes the course.
    await page.locator('#quiz').scrollIntoViewIfNeeded()
    await page.getByRole('radio', { name: 'All questions' }).click()
    const questions = page.getByTestId(/^quiz-question-/)
    for (let i = 0; i < (await questions.count()); i++) await questions.nth(i).getByRole('button').first().click()
    const toast = page.getByRole('status').getByRole('link', { name: 'View certificate →' })
    await expect(toast).toBeVisible()
    await toast.click()
    await expect(page).toHaveURL(new RegExp(`/certificate/${COURSE}$`))
    await expect(page.locator('#certificate')).toBeVisible()
  })
})
