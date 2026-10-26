/**
 * npm run og:images
 *
 * Draws the share image of every indexable page into public/og/ (the layout
 * prerender.ts looks for, see ogImageFile), og/default.png for anything
 * without its own, and public/icons/autoverse-512.png, the logo named in
 * structured data. Uses Playwright's Chromium with the app's own fonts and
 * colours. The images are committed: rerun after adding pages or changing
 * lesson titles and descriptions.
 */
import { chromium } from '@playwright/test'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { loadContent, ROOT } from '../validation/load-content'
import { parseLabMeta } from './html'
import { buildRoutes } from './routes'
import { cardDocument, shareCards } from './share-cards'

const PUBLIC = path.join(ROOT, 'public')
const LOGO_SVG = path.join(PUBLIC, 'icons', 'autoverse.svg')
const DRAWN = path.join(ROOT, 'scripts', 'prerender', 'share-cards.json')
const font = async (pkg: string, file: string) => (await readFile(path.join(ROOT, 'node_modules', '@fontsource-variable', pkg, 'files', file))).toString('base64')

async function main() {
  const content = loadContent()
  if (content.errors.length) throw new Error(`${content.errors.length} content file(s) failed validation; run npm run validate:content`)
  const labs = parseLabMeta(await readFile(path.join(ROOT, 'src/features/labs/registry.ts'), 'utf8'))
  const routes = buildRoutes({ categories: content.categories, topics: content.topics, labs, pioneers: content.pioneers })
  const cards = shareCards(routes, { categories: content.categories, topics: content.topics, labs })
  const logoSvg = await readFile(LOGO_SVG, 'utf8')
  const fonts = {
    display: await font('space-grotesk', 'space-grotesk-latin-wght-normal.woff2'),
    sans: await font('inter', 'inter-latin-wght-normal.woff2'),
    mono: await font('jetbrains-mono', 'jetbrains-mono-latin-wght-normal.woff2'),
  }

  const browser = await chromium.launch()
  const cut: string[] = []
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
    await page.setContent(cardDocument(fonts, logoSvg))
    await page.evaluate(() => document.fonts.ready)
    // Cards of pages that no longer exist must not linger.
    await rm(path.join(PUBLIC, 'og'), { recursive: true, force: true })
    for (const card of cards) {
      if (!(await page.evaluate(`fill(${JSON.stringify(card)})`))) cut.push(card.file)
      const file = path.join(PUBLIC, card.file)
      await mkdir(path.dirname(file), { recursive: true })
      await page.screenshot({ path: file })
    }

    const logo = await browser.newPage({ viewport: { width: 512, height: 512 } })
    await logo.setContent(
      `<!doctype html><style>html,body{margin:0;background:transparent}img{display:block;width:512px;height:512px}</style><img alt="" src="data:image/svg+xml;base64,${Buffer.from(logoSvg).toString('base64')}">`,
    )
    await logo.screenshot({ path: path.join(PUBLIC, 'icons', 'autoverse-512.png'), omitBackground: true })
  } finally {
    await browser.close()
  }
  // What was drawn, so a unit test can tell when the committed images fall behind the content.
  await writeFile(DRAWN, `${JSON.stringify(cards, null, 2)}\n`)
  cut.forEach((file) => console.warn(`[og] warning: text cut short on ${file}; shorten its title or description`))
  console.log(`[og] ${cards.length} share images → public/og/, logo → public/icons/autoverse-512.png`)
}

main().catch((error: unknown) => {
  console.error('[og] failed:', error instanceof Error ? error.message : error)
  process.exitCode = 1
})
