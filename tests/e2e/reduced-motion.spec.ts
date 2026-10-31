import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { open } from './helpers'

/**
 * Readers who ask for less motion get none of the decorative kind (sparks,
 * shakes, sliding thumbs and springs), and everything still works and still says
 * what happened in words.
 */

const topic = JSON.parse(readFileSync('src/content/topics/engine/four-stroke-cycle.json', 'utf8')) as { quiz: { answerIndex: number }[] }

async function answerFirstQuestionCorrectly(page: Page) {
  await open(page, '/topics/four-stroke-cycle')
  await page.locator('#quiz').scrollIntoViewIfNeeded()
  const options = page.getByTestId(/^quiz-question-/).first().getByRole('button')
  await options.nth(topic.quiz[0]!.answerIndex).click()
  await expect(page.getByText('Correct.')).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('autoverse.preferences', JSON.stringify({ state: { level: 'beginner', tourStatus: 'declined' }, version: 0 })))
})

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('a correct answer throws no sparks, but is still confirmed in words', async ({ page }) => {
    await answerFirstQuestionCorrectly(page)
    await expect(page.getByTestId('burst')).toHaveCount(0)
  })

  test('the level toggle and the lesson island work without any sliding', async ({ page }) => {
    await open(page, '/topics/four-stroke-cycle')
    await page.getByRole('radio', { name: /^Tech/ }).first().click()
    await expect(page.getByRole('radio', { name: /^Tech/ }).first()).toBeChecked()
    await page.getByRole('button', { name: /^Lesson progress and outline/ }).click()
    await expect(page.getByRole('navigation', { name: 'On this page' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('navigation', { name: 'On this page' })).toBeHidden()
  })
})

test('with normal motion the same correct answer does throw sparks', async ({ page }) => {
  await answerFirstQuestionCorrectly(page)
  await expect(page.getByTestId('burst')).toHaveCount(1)
})
