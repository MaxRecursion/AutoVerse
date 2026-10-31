import { expect, test, type Page } from '@playwright/test'
import { open } from './helpers'

/**
 * Glossary flashcards in a real browser: flip, answer with the keyboard and
 * with a drag, finish a round, and find the result on the progress page.
 */

async function skipInvitation(page: Page) {
  await page.addInitScript(() => localStorage.setItem('autoverse.preferences', JSON.stringify({ state: { level: 'beginner', tourStatus: 'declined' }, version: 0 })))
}
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Practise terms' })

async function startPractice(page: Page) {
  await open(page, '/glossary')
  await page.getByRole('button', { name: 'Practise all terms' }).click()
  await expect(dialog(page)).toBeVisible()
  await expect(dialog(page).getByTestId('flashcard')).toBeVisible()
}

test.describe('flashcards', () => {
  test.beforeEach(async ({ page }) => skipInvitation(page))

  test('flip with Space, answer with the arrow keys, and see the count on the progress page', async ({ page }) => {
    await startPractice(page)
    const d = dialog(page)
    await expect(d.getByText('0 of', { exact: false }).first()).toBeVisible()

    // Space flips to the meaning, which names the lesson that explains the term.
    await d.focus()
    await page.keyboard.press('Space')
    await expect(d.getByRole('button', { name: 'Show term' })).toHaveAttribute('aria-pressed', 'true')
    await expect(d.getByRole('link').first()).toBeVisible()

    // Right arrow: "Got it". The next card starts on its term again.
    await page.keyboard.press('ArrowRight')
    await expect(d.getByText(/^1 of \d+ known$/)).toBeVisible()
    await expect(d.getByRole('button', { name: 'Show meaning' })).toHaveAttribute('aria-pressed', 'false')

    // Left arrow: "Again" does not count as known.
    await page.keyboard.press('ArrowLeft')
    await expect(d.getByText(/^1 of \d+ known$/)).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(dialog(page)).toBeHidden()

    await open(page, '/progress')
    await expect(page.getByRole('region', { name: 'Practice' })).toContainText(/1\s+of\s+\d+ terms known/)
    await expect(page.getByRole('button', { name: /^Revisit 1 to review/ })).toBeVisible()
  })

  test('a card can be thrown to the right, and springs back when the drag is short', async ({ page }) => {
    await startPractice(page)
    const d = dialog(page)
    const card = d.getByTestId('flashcard')
    const box = (await card.boundingBox())!
    const mid = { x: box.x + box.width / 2, y: box.y + box.height / 2 }

    // A short, slow drag is not an answer.
    await page.mouse.move(mid.x, mid.y)
    await page.mouse.down()
    await page.mouse.move(mid.x + 20, mid.y, { steps: 6 })
    await page.mouse.up()
    await expect(d.getByText('0 of', { exact: false }).first()).toBeVisible()

    // A long drag to the right is "Got it".
    await page.mouse.move(mid.x, mid.y)
    await page.mouse.down()
    await page.mouse.move(mid.x + 200, mid.y, { steps: 12 })
    await page.mouse.up()
    await expect(d.getByText(/^1 of \d+ known$/)).toBeVisible()
  })

  test('the dialog fits the screen, with no sideways scroll', async ({ page }) => {
    await startPractice(page)
    const viewport = page.viewportSize()!
    const box = (await dialog(page).boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  })

  test('practising a lesson’s own terms starts from its Key concepts', async ({ page }) => {
    await open(page, '/topics/four-stroke-cycle')
    await page.locator('summary', { hasText: 'Key concepts' }).click()
    await page.getByRole('button', { name: 'Practise this lesson’s terms' }).click()
    await expect(dialog(page)).toBeVisible()
    await expect(dialog(page).getByText(/^0 of [1-9]\d* known$/)).toBeVisible()
  })
})
