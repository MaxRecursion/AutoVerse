import { expect, test } from '@playwright/test'

const COMMIT = 'a'.repeat(40)
const fixture = {
  repository: { owner: 'sindresorhus', name: 'is', url: 'https://github.com/sindresorhus/is' },
  requestedBranch: 'main', commitSha: COMMIT, commitUrl: `https://github.com/sindresorhus/is/commit/${COMMIT}`,
  analyzedAt: '2026-10-28T08:00:00.000Z', analyzerVersion: '0.1.0', partial: false, warnings: [],
  counts: { discoveredFiles: 2, analyzedFiles: 2, skippedFiles: 0, sourceBytes: 58, modules: 1, internalDependencies: 1, externalDependencies: 1, unresolvedDependencies: 0 },
  languages: [{ name: 'TypeScript', files: 2 }], frameworks: [], packageManagers: ['npm'],
  files: [
    { path: 'src/index.ts', blobSha: 'b'.repeat(40), size: 33, language: 'TypeScript', analyzed: true },
    { path: 'src/helper.ts', blobSha: 'c'.repeat(40), size: 25, language: 'TypeScript', analyzed: true },
  ],
  nodes: [
    { id: 'project:root', type: 'project', label: 'is' },
    { id: 'module:src', type: 'module', label: 'src', path: 'src', fileCount: 2 },
    { id: 'file:src/index.ts', type: 'file', label: 'index.ts', path: 'src/index.ts' },
    { id: 'file:src/helper.ts', type: 'file', label: 'helper.ts', path: 'src/helper.ts' },
    { id: 'package:npm:chalk', type: 'package', packageKind: 'npm', label: 'chalk' },
  ],
  edges: [
    { id: 'contains:project->src', source: 'project:root', target: 'module:src', type: 'contains', evidence: [] },
    { id: 'contains:src->index', source: 'module:src', target: 'file:src/index.ts', type: 'contains', evidence: [] },
    { id: 'contains:src->helper', source: 'module:src', target: 'file:src/helper.ts', type: 'contains', evidence: [] },
    { id: 'imports:index->helper', source: 'file:src/index.ts', target: 'file:src/helper.ts', type: 'imports', status: 'verified', evidence: [{ path: 'src/index.ts', line: 1, specifier: './helper', relation: 'static-import' }] },
    { id: 'package:index->chalk', source: 'file:src/index.ts', target: 'package:npm:chalk', type: 'references-package', status: 'verified', evidence: [{ path: 'src/index.ts', line: 2, specifier: 'chalk', relation: 'static-import' }] },
  ],
}

test('demo flows through the analysis request and explorer interactions work', async ({ page }) => {
  let analysisRequest: { repository: string; branch: string } | undefined
  await page.route('**/api/analyze', async (route) => {
    analysisRequest = route.request().postDataJSON() as { repository: string; branch: string }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) })
  })
  await page.route('**/api/source', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ path: 'src/index.ts', code: "import { helper } from './helper'\nimport chalk from 'chalk'\nexport const value = helper(chalk)", url: `https://github.com/sindresorhus/is/blob/${COMMIT}/src/index.ts` }) })
  })

  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Understand any codebase/i })).toBeVisible()
  await page.getByRole('button', { name: /sindresorhus\/is/i }).click()
  await expect(page.getByText('ARCHITECTURE MAP')).toBeVisible()
  expect(analysisRequest).toEqual({ repository: 'sindresorhus/is', branch: 'main' })
  await expect(page.getByText('files analyzed')).toBeVisible()

  await page.getByRole('treeitem', { name: 'src/index.ts' }).click()
  await expect(page.locator('.source-code')).toContainText('export const value')
  await expect(page.getByText('index.ts:1')).toBeVisible()
  await page.getByRole('button', { name: 'Files', exact: true }).click()
  await expect(page.locator('.react-flow__node')).toHaveCount(5)

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export architecture graph as SVG' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('is-architecture.svg')
})

test('invalid repository input returns a useful validation message', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('GitHub repository').fill('https://github.com.attacker.example/owner/repo')
  await page.getByRole('button', { name: /Analyze repository/i }).click()
  await expect(page.getByRole('alert')).toContainText('public GitHub repository URL')
})

test('workspace panels stay readable on a phone viewport', async ({ page }) => {
  await page.route('**/api/analyze', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) }))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: /sindresorhus\/is/i }).click()
  await expect(page.getByLabel('Repository files')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Architecture graph' })).toBeVisible()
  await expect(page.locator('.details-panel')).toBeVisible()
})
