import { expect, test, type Page } from '@playwright/test'
import { engines } from '../../src/features/sound-lab/engines'
import { open } from './helpers'

interface GasProbe {
  program: number
  draws: number
  count: number
  primitive: number
  run: number
  shift: number
  opacity: number
  diesel: number
  since: number[]
  outletTime: number[]
}

interface WallProbe {
  program: number
  draws: number
  heat: number
}

declare global {
  interface Window { __exhaustProbe: GasProbe; __exhaustWallProbe: WallProbe }
}

/** Observe the shipped gas shader at the WebGL boundary, without exposing scene internals in the app. */
async function observeGas(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('autoverse.preferences', JSON.stringify({ state: { level: 'beginner', tourStatus: 'declined' }, version: 0 }))
    const probe: GasProbe = { program: 0, draws: 0, count: 0, primitive: -1, run: 0, shift: 0, opacity: 0, diesel: 0, since: [], outletTime: [] }
    window.__exhaustProbe = probe
    const wallProbe: WallProbe = { program: 0, draws: 0, heat: 0 }
    window.__exhaustWallProbe = wallProbe
    if (typeof WebGL2RenderingContext === 'undefined') return
    interface ProgramInfo { id: number; values: Record<string, number>; since: number[]; outletTime: number[] }
    const programs = new WeakMap<WebGLProgram, ProgramInfo>()
    const walls = new WeakMap<WebGLProgram, { id: number; heat: number }>()
    const uniforms = new WeakMap<WebGLUniformLocation, { program: WebGLProgram; name: string }>()
    const current = new WeakMap<WebGL2RenderingContext, WebGLProgram | null>()
    let serial = 0
    let wallSerial = 0
    const gl = WebGL2RenderingContext.prototype
    const location = gl.getUniformLocation
    gl.getUniformLocation = function (program, name) {
      const result = location.call(this, program, name)
      if (result) uniforms.set(result, { program, name: name.replace(/\[0\]$/, '') })
      if (name === 'uRun' && !programs.has(program)) programs.set(program, { id: ++serial, values: {}, since: [], outletTime: [] })
      if (name === 'uWallHeat' && !walls.has(program)) walls.set(program, { id: ++wallSerial, heat: 0 })
      return result
    }
    const scalar = gl.uniform1f
    gl.uniform1f = function (location, value) {
      const uniform = location && uniforms.get(location)
      const info = uniform && programs.get(uniform.program)
      if (info && uniform) info.values[uniform.name] = value
      const wall = uniform && walls.get(uniform.program)
      if (wall && uniform?.name === 'uWallHeat') wall.heat = value
      return scalar.call(this, location, value)
    }
    const array = gl.uniform1fv
    gl.uniform1fv = function (...args) {
      const uniform = args[0] && uniforms.get(args[0])
      const info = uniform && programs.get(uniform.program)
      if (info && uniform?.name === 'uSince') info.since = Array.from(args[1])
      if (info && uniform?.name === 'uOutletTime') info.outletTime = Array.from(args[1])
      return array.apply(this, args)
    }
    const use = gl.useProgram
    gl.useProgram = function (program) {
      current.set(this, program)
      return use.call(this, program)
    }
    const record = (context: WebGL2RenderingContext, primitive: number, count: number) => {
      const program = current.get(context)
      const info = program && programs.get(program)
      const wall = program && walls.get(program)
      if (wall) Object.assign(wallProbe, { program: wall.id, draws: wallProbe.draws + 1, heat: wall.heat })
      if (!info) return
      Object.assign(probe, {
        program: info.id, draws: probe.draws + 1, count, primitive,
        run: info.values.uRun ?? 0, shift: info.values.uShift ?? 0,
        opacity: info.values.uOpacity ?? 0, diesel: info.values.uDiesel ?? 0,
        since: [...info.since], outletTime: [...info.outletTime],
      })
    }
    const indexed = gl.drawElements
    gl.drawElements = function (mode, count, type, offset) {
      record(this, mode, count)
      return indexed.call(this, mode, count, type, offset)
    }
    const triangles = gl.drawArrays
    gl.drawArrays = function (mode, first, count) {
      record(this, mode, count)
      return triangles.call(this, mode, first, count)
    }
  })
}

const gas = (page: Page) => page.evaluate(() => window.__exhaustProbe)
const wall = (page: Page) => page.evaluate(() => window.__exhaustWallProbe)

async function paintFrames(page: Page, count = 6) {
  return page.evaluate(async (count) => {
    const draws: number[] = []
    for (let i = 0; i < count; i++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      draws.push(window.__exhaustProbe.draws)
    }
    return draws
  }, count)
}

async function ready(page: Page) {
  const view = page.getByTestId('engine-cutaway')
  await expect(view.locator('canvas')).toBeVisible()
  await expect(view.getByTestId('scene-loading')).toHaveCount(0, { timeout: 30_000 })
  return view
}

function shaderErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  return errors
}

// Separate the scene families so software WebGL can compile every production preset within a bounded case.
for (const family of ['inline, boxer, V6 and V8', 'V10']) {
  test(`${family}: production engines draw advancing gas through their whole-engine exhaust`, async ({ page, isMobile }) => {
    test.setTimeout(180_000)
    await observeGas(page)
    const errors = shaderErrors(page)
    const phone = new Set(['inline-3', 'flat-4', 'v6-90-odd', 'v8-flat', 'v10-viper', 'v10-tdi'])
    const presets = engines.filter((engine) => (family === 'V10') === (engine.cylinders === 10) && (!isMobile || phone.has(engine.id)))
    await open(page, `/sound-lab?engine=${presets[0]!.id}`)
    for (let i = 0; i < presets.length; i++) {
      const preset = presets[i]!
      const before = await gas(page)
      if (i > 0) await page.getByTestId(`sound-lab-engine-${preset.id}`).click()
      const view = await ready(page)
      await view.getByRole('radio', { name: 'Whole engine', exact: true }).click()
      const start = page.getByTestId('sound-lab-start')
      if ((await start.getAttribute('aria-pressed')) !== 'true') await start.click()
      await expect.poll(async () => (await gas(page)).program, { message: `${preset.id}: the gas shader is drawn`, timeout: 20_000 }).toBeGreaterThan(before.program)
      const first = await gas(page)
      await expect.poll(async () => (await gas(page)).draws).toBeGreaterThan(first.draws + 2)
      await expect.poll(async () => (await gas(page)).run).toBeGreaterThan(1)
      const flowing = await gas(page)
      expect(flowing.primitive, preset.id).toBe(4) // Gas is a continuous triangle surface, never GL_POINTS.
      expect(flowing.count, preset.id).toBeGreaterThan(100)
      expect(flowing.opacity, preset.id).toBe(1)
      expect(flowing.diesel, preset.id).toBe(preset.ignition === 'compression' ? 1 : 0)
      expect(flowing.since.length, preset.id).toBe(10)
      expect(flowing.since.every(Number.isFinite), preset.id).toBe(true)
      expect(flowing.outletTime, preset.id).toHaveLength(10)
      expect(flowing.outletTime.slice(0, preset.cylinders).every((delay) => Number.isFinite(delay) && delay > 0), `${preset.id}: each active route uploads its port-to-outlet travel delay`).toBe(true)
      const shift = flowing.shift
      await expect.poll(async () => (await gas(page)).shift).not.toBe(shift)
      await expect(page.getByTestId('exhaust-flow-note')).toContainText('cooling plume')
    }
    await page.getByTestId('sound-lab-start').click()
    expect(errors).toEqual([])
  })
}

for (const id of ['inline-4', 'v10-viper']) {
  test(`${id}: detail gas stops, restarts and respects reduced motion`, async ({ page }) => {
    test.setTimeout(90_000)
    await observeGas(page)
    const errors = shaderErrors(page)
    await open(page, `/sound-lab?engine=${id}`)
    await ready(page)
    const start = page.getByTestId('sound-lab-start')
    await start.click()
    await expect.poll(async () => (await gas(page)).draws, { timeout: 20_000 }).toBeGreaterThan(2)
    await expect.poll(async () => (await gas(page)).run).toBeGreaterThan(1)

    if (id === 'v10-viper') {
      const before = (await gas(page)).draws
      const bank = page.getByRole('slider', { name: 'Bank angle in degrees' })
      await bank.focus()
      await page.keyboard.press('End')
      await expect(page.getByTestId('cylinder-layout')).toHaveAttribute('data-bank-angle', '120')
      await expect.poll(async () => (await gas(page)).draws).toBeGreaterThan(before + 2)
      await page.getByRole('button', { name: 'Back to production', exact: true }).click()
    }

    await start.click()
    await expect(start).toHaveText('Start engine')
    await paintFrames(page, 3)
    expect(new Set(await paintFrames(page)).size, 'stopped gas is not drawn').toBe(1)

    const stopped = (await gas(page)).draws
    await start.click()
    await expect.poll(async () => (await gas(page)).draws).toBeGreaterThan(stopped + 2)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(page.getByText('Still view (reduced motion)', { exact: true })).toBeVisible()
    await paintFrames(page, 3)
    expect(new Set(await paintFrames(page)).size, 'reduced motion hides moving gas while audio remains available').toBe(1)
    await expect(start).toHaveText('Stop engine')
    await start.click()
    expect(errors).toEqual([])
  })
}

test('headers heat under sustained revs, cool gradually at idle and clear when motion stops', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Thermal lag uses the same renderer on both devices; exercised once to bound software-GPU time.')
  test.setTimeout(90_000)
  await observeGas(page)
  const errors = shaderErrors(page)
  await open(page, '/sound-lab?engine=inline-4')
  const view = await ready(page)
  await view.getByRole('radio', { name: 'Whole engine', exact: true }).click()
  await expect.poll(async () => (await wall(page)).program, { timeout: 20_000 }).toBeGreaterThan(0)
  expect((await wall(page)).heat).toBe(0)

  const start = page.getByTestId('sound-lab-start')
  const rpm = page.getByRole('slider', { name: 'Engine speed in rpm' })
  await start.click()
  await rpm.press('End')
  await expect.poll(async () => (await wall(page)).heat, { message: 'Sustained high RPM heats the header material', timeout: 20_000 }).toBeGreaterThan(0.2)
  const hot = (await wall(page)).heat
  await rpm.press('Home')
  const idle = engines.find((engine) => engine.id === 'inline-4')!.idleRpm
  await expect.poll(async () => Number((await page.getByTestId('sound-lab-tach').innerText()).replace(/\D/g, ''))).toBeLessThan(idle * 1.2)
  expect((await wall(page)).heat, 'The warm metal stays warm after RPM returns to idle').toBeGreaterThan(0.05)
  await expect.poll(async () => (await wall(page)).heat, { message: 'The header cools gradually at idle', timeout: 15_000 }).toBeLessThan(hot * 0.9)
  expect((await wall(page)).heat).toBeGreaterThan(0)

  await start.click()
  await expect.poll(async () => (await wall(page)).heat).toBe(0)
  await start.click()
  await rpm.press('End')
  await expect.poll(async () => (await wall(page)).heat, { timeout: 20_000 }).toBeGreaterThan(0.15)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.getByText('Still view (reduced motion)', { exact: true })).toBeVisible()
  await expect.poll(async () => (await wall(page)).heat).toBe(0)
  await paintFrames(page)
  expect((await wall(page)).heat, 'Reduced motion leaves headers cool while audio remains controllable').toBe(0)
  await expect(start).toHaveText('Stop engine')
  await start.click()
  expect(errors).toEqual([])
})
