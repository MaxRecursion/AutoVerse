import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ShaderLib, type BufferGeometry, type MeshStandardMaterial } from 'three'
import { createFrameBus, type EngineFrame } from './animation'
import { ExhaustSystem, type ExhaustDrawing } from './ExhaustSystem'

const harness = vi.hoisted(() => ({
  frame: null as (() => void) | null,
  pipes: [] as MeshStandardMaterial[],
  gl: { extensions: { has: vi.fn(() => true) }, compileAsync: vi.fn(async () => {}), compile: vi.fn() },
  invalidate: vi.fn(),
}))

vi.mock('@react-three/fiber', () => ({
  useFrame: (callback: () => void) => { harness.frame = callback },
  useThree: (selector: (state: unknown) => unknown) => selector({ gl: harness.gl, scene: {}, camera: {}, invalidate: harness.invalidate }),
}))
vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>()
  return {
    ...actual,
    MeshStandardMaterial: class extends actual.MeshStandardMaterial {
      constructor(...args: ConstructorParameters<typeof actual.MeshStandardMaterial>) {
        super(...args)
        harness.pipes.push(this)
      }
    },
  }
})

const drawing = (): ExhaustDrawing => ({
  pipes: [{ points: [[0, 1, 0], [-1, 1, 0]], radius: 0.068, header: true }],
  routes: [{ index: 0, points: [[0, 1, 0], [-1, 1, 0]], segments: [[[0, 1, 0], [-1, 1, 0]]], feeds: [1], headerLength: 1 }],
})
const frame = (now: number, animate = true): EngineFrame => ({
  now, dt: 1 / 60, playhead: now / 10 % 720, animate, running: animate, rpm: 6000, throttle: 1,
  limiting: false, bank: 90, fired: [], cycle: null,
})

beforeEach(() => {
  harness.frame = null
  harness.pipes.length = 0
  vi.clearAllMocks()
  // The host tags are supplied by R3F in production; this test uses inert DOM
  // hosts to exercise its frame callback without creating a WebGL context.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function mount() {
  const bus = createFrameBus()
  const view = render(<ExhaustSystem drawing={drawing} bankOf={(bank) => bank ?? 90} firingAngle={() => 0} bus={bus} plume spec={{ idleRpm: 700, redlineRpm: 6000, ignition: 'spark' }} tier="low" />)
  const pipe = harness.pipes[0]!
  const shader = { ...ShaderLib.standard, uniforms: { ...ShaderLib.standard.uniforms } }
  pipe.onBeforeCompile(shader as Parameters<typeof pipe.onBeforeCompile>[0], {} as Parameters<typeof pipe.onBeforeCompile>[1])
  const heat = shader.uniforms.uWallHeat as { value: number }
  const paint = (next: EngineFrame) => act(() => { bus.publish(next); harness.frame!() })
  return { ...view, paint, heat }
}

describe('exhaust lifecycle', () => {
  it('heats by distinct bus time rather than the number of camera redraws, and resets when motion stops', () => {
    const { paint, heat } = mount()
    paint(frame(0))
    paint(frame(1000))
    expect(heat.value).toBeCloseTo(1 - Math.exp(-1 / 3), 8)
    const once = heat.value
    paint(frame(1000))
    paint(frame(1000))
    expect(heat.value).toBe(once)
    paint(frame(2000))
    expect(heat.value).toBeCloseTo(1 - Math.exp(-2 / 3), 8)
    paint(frame(2500, false))
    expect(heat.value).toBe(0)
    paint(frame(5000))
    expect(heat.value).toBe(0)
    paint(frame(6000))
    expect(heat.value).toBeCloseTo(1 - Math.exp(-1 / 3), 8)
  })

  it('precompiles real attributes once, settles a paused bank rebuild and releases geometry', () => {
    const clock = vi.spyOn(performance, 'now').mockReturnValue(0)
    const { paint, container, unmount } = mount()
    expect(harness.gl.compileAsync).not.toHaveBeenCalled()
    paint(frame(0))
    const meshes = container.querySelectorAll('mesh')
    const pipeGeometry = (meshes[0] as unknown as { geometry: BufferGeometry }).geometry
    const gasGeometry = (meshes[1] as unknown as { geometry: BufferGeometry }).geometry
    expect(pipeGeometry.getAttribute('aHeat').count).toBeGreaterThan(0)
    expect(gasGeometry.getAttribute('aTime').count).toBeGreaterThan(0)
    expect(harness.gl.compileAsync).toHaveBeenCalledExactlyOnceWith(container.firstElementChild, {}, {})
    const replacedPipe = vi.fn()
    const replacedGas = vi.fn()
    pipeGeometry.addEventListener('dispose', replacedPipe)
    gasGeometry.addEventListener('dispose', replacedGas)
    clock.mockReturnValue(50)
    paint({ ...frame(50, false), bank: 100 })
    expect((meshes[0] as unknown as { geometry: BufferGeometry }).geometry).toBe(pipeGeometry)
    expect(harness.invalidate).toHaveBeenCalled()
    clock.mockReturnValue(150)
    paint({ ...frame(150, false), bank: 100 })
    const finalPipe = (meshes[0] as unknown as { geometry: BufferGeometry }).geometry
    const finalGas = (meshes[1] as unknown as { geometry: BufferGeometry }).geometry
    expect(finalPipe).not.toBe(pipeGeometry)
    expect(replacedPipe).toHaveBeenCalledOnce()
    expect(replacedGas).toHaveBeenCalledOnce()
    expect(harness.gl.compileAsync).toHaveBeenCalledTimes(1)
    const pipeDisposed = vi.fn()
    const gasDisposed = vi.fn()
    finalPipe.addEventListener('dispose', pipeDisposed)
    finalGas.addEventListener('dispose', gasDisposed)
    unmount()
    expect(pipeDisposed).toHaveBeenCalledOnce()
    expect(gasDisposed).toHaveBeenCalledOnce()
  })
})
