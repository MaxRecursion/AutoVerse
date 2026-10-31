import { expect, test } from '@playwright/test'
import { open } from './helpers'

/** The progress page after real actions: finishing a lesson shows on the calendar, and clearing everything can be undone. */

const today = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long' }).format(new Date())

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('autoverse.preferences')) {
      localStorage.setItem('autoverse.preferences', JSON.stringify({ state: { level: 'beginner', tourStatus: 'declined' }, version: 0 }))
    }
  })
})

test('finishing a lesson lights up today, starts a streak, and ticks the checklist', async ({ page }) => {
  await open(page, '/progress')
  await expect(page.getByRole('button', { name: `${today}: no activity` })).toBeVisible()

  await open(page, '/topics/how-a-car-works')
  await page.getByRole('button', { name: 'Mark complete anyway' }).click()
  await expect(page.getByText('Lesson complete: How a Car Works: The Big Picture')).toBeVisible()

  await open(page, '/progress')
  await expect(page.getByRole('button', { name: new RegExp(`^${today}: .*Finished How a Car Works: The Big Picture`) })).toBeVisible()
  await expect(page.getByText('Current streak').locator('xpath=following-sibling::dd')).toContainText('1 day')
  // Finishing a lesson (and having opened one) are the only steps done so far.
  await expect(page.getByRole('button', { name: /^Getting started/ })).toContainText('2/6')
})

test('clearing everything can be undone, and the calendar and stats come back', async ({ page }) => {
  await open(page, '/topics/how-a-car-works')
  await page.getByRole('button', { name: 'Mark complete anyway' }).click()
  await open(page, '/progress')
  await expect(page.getByText('Lessons completed').locator('xpath=following-sibling::dd')).toContainText('1')

  await page.getByRole('button', { name: 'Clear all progress' }).click()
  await expect(page.getByText('Progress cleared')).toBeVisible()
  await expect(page.getByText('Lessons completed').locator('xpath=following-sibling::dd')).toContainText('0')
  await expect(page.getByRole('button', { name: `${today}: no activity` })).toBeVisible()

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByText('Lessons completed').locator('xpath=following-sibling::dd')).toContainText('1')
  await expect(page.getByRole('button', { name: new RegExp(`^${today}: .*Finished`) })).toBeVisible()
})
