import type { Page } from '@playwright/test'

/**
 * Open a page and wait until the app has taken over its prerendered HTML.
 * Links work before that (they are real pages), but buttons only respond once
 * the app is running, so interactions must wait for this.
 */
export async function open(page: Page, path: string) {
  await page.goto(path)
  await appReady(page)
}

export async function appReady(page: Page) {
  await page.locator('html[data-app="ready"]').waitFor({ state: 'attached' })
}

export async function reload(page: Page) {
  await page.reload()
  await appReady(page)
}
