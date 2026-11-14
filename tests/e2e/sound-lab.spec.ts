import { expect, test } from '@playwright/test'
import { open } from './helpers'

type SoundProbe = { contexts: AudioContext[]; analysers: AnalyserNode[] }

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('autoverse.preferences', JSON.stringify({ state: { level: 'beginner', tourStatus: 'declined' }, version: 0 }))
    const probe: SoundProbe = { contexts: [], analysers: [] }
    Object.assign(window, { __soundProbe: probe })
    const NativeContext = window.AudioContext
    window.AudioContext = class extends NativeContext {
      constructor(options?: AudioContextOptions) {
        super(options)
        probe.contexts.push(this)
      }
      createAnalyser() {
        const analyser = super.createAnalyser()
        probe.analysers.push(analyser)
        return analyser
      }
    }
  })
})

test('serves a real static page and waits for the learner to enable audio', async ({ page, request }) => {
  const response = await request.get('/sound-lab')
  expect(response.status()).toBe(200)
  const html = await response.text()
  expect(html).toContain('Engine Sound Lab: Inline-3 to V10 Simulator')
  expect(html).toContain('Synthesised, not recorded.')
  expect(html).toContain('F4-RPcSGVFI')
  expect(html).toContain('og/sound-lab.png')
  await open(page, '/sound-lab?engine=v10-carrera-gt')
  await expect(page.getByRole('heading', { level: 1, name: 'Engine Sound Lab' })).toBeVisible()
  await expect(page.getByTestId('sound-lab-intervals')).toContainText('68° and 76°')
  await expect(page.getByTestId('cylinder-layout')).toHaveAttribute('data-bank-angle', '68')
  expect(await page.evaluate(() => (window as unknown as { __soundProbe: SoundProbe }).__soundProbe.contexts.length)).toBe(0)
  await expect(page.getByTestId('sound-lab-start')).toHaveText('Start engine')
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
})

test('changes production firing rhythm, supports keyboard controls and restores the preset', async ({ page }) => {
  await open(page, '/sound-lab?engine=v10-viper')
  await expect(page.getByTestId('sound-lab-intervals')).toContainText('54° and 90°')
  await page.getByRole('button', { name: 'Make it fire evenly' }).click()
  await expect(page.getByTestId('sound-lab-intervals')).toHaveText('even, every 72°')
  await expect(page.getByText('Experiment · not production', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Back to production' }).click()
  await expect(page.getByTestId('sound-lab-intervals')).toContainText('54° and 90°')
  const rpm = page.getByRole('slider', { name: 'Engine speed in rpm' })
  const initial = Number(await rpm.getAttribute('aria-valuenow'))
  await rpm.focus()
  await page.keyboard.press('ArrowRight')
  await expect(rpm).toHaveAttribute('aria-valuenow', String(initial + 50))
  const bank = page.getByRole('slider', { name: 'Bank angle in degrees' })
  await bank.focus()
  await page.keyboard.press('End')
  await expect(page.getByTestId('cylinder-layout')).toHaveAttribute('data-bank-angle', '120')
  await page.getByRole('button', { name: 'Make it fire evenly' }).click()
  await expect(page.getByTestId('sound-lab-intervals')).toHaveText('even, every 72°')
  const split = page.getByRole('slider', { name: 'Crankpin split in degrees' })
  const value = Number(await split.getAttribute('aria-valuenow'))
  expect(value).toBeGreaterThanOrEqual(Number(await split.getAttribute('aria-valuemin')))
  expect(value).toBeLessThanOrEqual(Number(await split.getAttribute('aria-valuemax')))
})

test('plays non-silent audio, survives a quick restart and closes audio when navigating away', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await open(page, '/sound-lab?engine=inline-3')
  const start = page.getByTestId('sound-lab-start')
  await start.click()
  await expect(start).toHaveText('Stop engine')
  const signalPeak = () => page.evaluate(() => {
    const { analysers } = (window as unknown as { __soundProbe: SoundProbe }).__soundProbe
    const analyser = analysers.at(-1)
    if (!analyser) return 0
    const samples = new Float32Array(analyser.fftSize)
    analyser.getFloatTimeDomainData(samples)
    return samples.reduce((peak, sample) => Math.max(peak, Math.abs(sample)), 0)
  })
  await expect.poll(signalPeak).toBeGreaterThan(0.001)
  await start.click()
  await start.click()
  await expect(start).toHaveText('Stop engine')
  await expect.poll(signalPeak).toBeGreaterThan(0.001)
  // The old fade must not disconnect the replacement engine.
  await expect.poll(() => page.evaluate(() => (window as unknown as { __soundProbe: SoundProbe }).__soundProbe.contexts[0]?.state)).toBe('closed')
  await expect.poll(signalPeak).toBeGreaterThan(0.001)
  expect(errors).toEqual([])
  await page.getByRole('link', { name: 'Home', exact: true }).first().click()
  await expect.poll(() => page.evaluate(() => (window as unknown as { __soundProbe: SoundProbe }).__soundProbe.contexts.every((context) => context.state === 'closed'))).toBe(true)
})

test('production presets switch without allocating another audio context', async ({ page, isMobile }) => {
  test.setTimeout(90_000) // Each preset also constructs its detailed 3D cutaway.
  test.skip(isMobile, 'the compact mobile picker is covered by the phone layout and control tests')
  await open(page, '/sound-lab?engine=inline-3')
  await page.getByTestId('sound-lab-start').click()
  await expect(page.getByTestId('sound-lab-start')).toHaveText('Stop engine')
  for (const id of ['inline-5', 'v8-cross', 'v8-flat', 'v10-audi-52', 'v10-gallardo-even', 'v10-lfa', 'v10-carrera-gt']) {
    await page.getByTestId(`sound-lab-engine-${id}`).click()
    await expect(page).toHaveURL(new RegExp(`engine=${id}`))
    await expect(page.getByTestId('sound-lab-start')).toHaveText('Stop engine')
  }
  expect(await page.evaluate(() => (window as unknown as { __soundProbe: SoundProbe }).__soundProbe.contexts.length)).toBe(1)
})
