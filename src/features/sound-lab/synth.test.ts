import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getEngine } from './engines'
import { buildSynthConfig, CYCLE_BINS, EngineSound, FADE_OUT_MS, idealTrace, runnerReach } from './synth'

/* ---------------------------------------------------------------- config */

describe('buildSynthConfig', () => {
  it('routes each bank of a separate-exhaust V to its own channel', () => {
    const config = buildSynthConfig(getEngine('v8-cross')!)
    const ch = (cyl: number) => config.events[getEngine('v8-cross')!.order!.indexOf(cyl)]!.ch
    expect(ch(1)).toBe(0)
    expect(ch(8)).toBe(1)
  })
  it('sends every pulse of a shared exhaust down one channel', () => {
    expect(new Set(buildSynthConfig(getEngine('inline-5')!).events.map((e) => e.ch))).toEqual(new Set([0]))
  })
  it('gives inline-5 cylinders distinct paths so the 720° pattern is audible', () => {
    const events = buildSynthConfig(getEngine('inline-5')!).events
    expect(new Set(events.map((e) => e.delayMs.toFixed(3))).size).toBeGreaterThan(1)
    expect(new Set(events.map((e) => e.gain.toFixed(3))).size).toBeGreaterThan(1)
  })
  it('adds the boxer’s unequal header delay on top of runner spread', () => {
    const spec = getEngine('flat-4')!
    const events = buildSynthConfig(spec).events
    const at = (cyl: number) => events[spec.order!.indexOf(cyl)]!.delayMs
    expect(at(2) - at(1)).toBeGreaterThan(2)
  })
  it('measures runner reach from the middle of each bank', () => {
    const i5 = getEngine('inline-5')!
    expect(runnerReach(i5, 3, 0)).toBe(0)
    expect(runnerReach(i5, 1, 0)).toBe(1)
    expect(runnerReach(i5, 5, 0)).toBe(1)
  })
  it('accepts experimental intervals', () => {
    const config = buildSynthConfig(getEngine('v10-viper')!, Array(10).fill(72))
    expect(config.events.map((e) => e.angle)).toEqual(Array.from({ length: 10 }, (_, i) => i * 72))
  })
})

/* ------------------------------------------------------------- lifecycle */

class FakeParam {
  value = 0
  setTargetAtTime = vi.fn()
}
class FakeNode {
  disconnect = vi.fn()
  connect = vi.fn((next: FakeNode) => next)
}
class FakeGain extends FakeNode {
  gain = new FakeParam()
}
class FakeAnalyser extends FakeNode {
  fftSize = 0
}
let contexts: FakeContext[] = []
let failNextModule = false
class FakeContext {
  state = 'running'
  currentTime = 0
  destination = new FakeNode()
  close = vi.fn(async () => undefined)
  resume = vi.fn(async () => undefined)
  audioWorklet = {
    addModule: vi.fn(async () => {
      if (failNextModule) {
        failNextModule = false
        throw new Error('blocked')
      }
    }),
  }
  createGain = () => new FakeGain()
  createAnalyser = () => new FakeAnalyser()
  constructor() {
    contexts.push(this)
  }
}
let worklets: FakeWorkletNode[] = []
class FakeWorkletNode extends FakeNode {
  port: { postMessage: ReturnType<typeof vi.fn>; onmessage: ((event: { data: unknown }) => void) | null } = { postMessage: vi.fn(), onmessage: null }
  constructor() {
    super()
    worklets.push(this)
  }
}

describe('EngineSound lifecycle', () => {
  const config = buildSynthConfig(getEngine('inline-4')!)
  let revoke: ReturnType<typeof vi.fn<(url: string) => void>>

  beforeEach(() => {
    contexts = []
    worklets = []
    failNextModule = false
    vi.useFakeTimers()
    vi.stubGlobal('AudioContext', FakeContext)
    vi.stubGlobal('AudioWorkletNode', FakeWorkletNode)
    let n = 0
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:engine-${++n}`)
    revoke = vi.fn<(url: string) => void>()
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revoke)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('a restart during the fade-out is not torn down by the earlier stop', async () => {
    const sound = new EngineSound()
    await sound.start(config, 1000, 0.3)
    const stopping = sound.stop()
    expect(sound.running).toBe(false)

    await sound.start(config, 1000, 0.3)
    const second = contexts[1]!
    await vi.advanceTimersByTimeAsync(FADE_OUT_MS + 10)
    await stopping

    expect(contexts[0]!.close).toHaveBeenCalledTimes(1)
    expect(second.close).not.toHaveBeenCalled()
    expect(revoke).toHaveBeenCalledWith('blob:engine-1')
    expect(revoke).not.toHaveBeenCalledWith('blob:engine-2')
    expect(sound.running).toBe(true)
    expect(sound.analyser).not.toBeNull()
  })

  it('cleans up after a failed start so a retry works', async () => {
    const sound = new EngineSound()
    failNextModule = true
    await expect(sound.start(config, 1000, 0.3)).rejects.toThrow('blocked')
    expect(sound.running).toBe(false)
    expect(contexts[0]!.close).toHaveBeenCalled()
    expect(revoke).toHaveBeenCalledWith('blob:engine-1')

    await sound.start(config, 1000, 0.3)
    expect(sound.running).toBe(true)
    expect(contexts).toHaveLength(2)
  })

  it('stopping while the worklet loads leaves nothing running', async () => {
    const sound = new EngineSound()
    const starting = sound.start(config, 1000, 0.3)
    const stopping = sound.stop()
    await starting
    await vi.advanceTimersByTimeAsync(FADE_OUT_MS + 10)
    await stopping
    expect(sound.running).toBe(false)
    expect(contexts[0]!.close).toHaveBeenCalledTimes(1)
  })

  it('sends config, rpm and throttle to the worklet on start', async () => {
    const sound = new EngineSound()
    await sound.start(config, 2500, 0.5)
    sound.setRpm(3000)
    const sent = worklets[0]!.port.postMessage.mock.calls.map(([m]) => m as { type: string; value?: number; reset?: boolean })
    expect(sent[0]).toMatchObject({ type: 'config', reset: true })
    expect(sent).toContainEqual({ type: 'rpm', value: 2500 })
    expect(sent).toContainEqual({ type: 'throttle', value: 0.5 })
    expect(sent.at(-1)).toEqual({ type: 'rpm', value: 3000 })
    expect(sent).toContainEqual({ type: 'telemetry', on: true })
  })

  it('keeps what the worklet reports for the diagrams, and ignores malformed reports', async () => {
    const sound = new EngineSound()
    await sound.start(config, 2500, 0.5)
    const port = worklets[0]!.port
    expect(sound.telemetry).toBeNull()
    port.onmessage!({ data: { type: 'state', rpm: 2480, throttle: 0.5, limiting: false } })
    expect(sound.telemetry).toMatchObject({ rpm: 2480, throttle: 0.5, limiting: false, cycle: null })
    const a = new Float32Array(CYCLE_BINS).fill(0.1)
    const b = new Float32Array(CYCLE_BINS)
    port.onmessage!({ data: { type: 'cycle', a, b } })
    port.onmessage!({ data: { type: 'cycle', a, b } })
    expect(sound.telemetry?.cycle).toMatchObject({ a, b, seq: 2 })
    port.onmessage!({ data: { type: 'state', rpm: Number.NaN } })
    port.onmessage!({ data: { type: 'cycle', a: new Float32Array(3), b } })
    port.onmessage!({ data: 'noise' })
    expect(sound.telemetry).toMatchObject({ rpm: 2480, cycle: { seq: 2 } })
    port.onmessage!({ data: { type: 'state', rpm: 9000, throttle: 1, limiting: true } })
    expect(sound.telemetry).toMatchObject({ rpm: 9000, limiting: true, cycle: { seq: 2 } })
  })

  it('never lets a stopped engine’s late reports reach its replacement', async () => {
    const sound = new EngineSound()
    await sound.start(config, 1000, 0.3)
    const oldPort = worklets[0]!.port
    const listener = oldPort.onmessage!
    const stopping = sound.stop()
    await sound.start(config, 1000, 0.3)
    worklets[1]!.port.onmessage!({ data: { type: 'state', rpm: 1100, throttle: 0.3, limiting: false } })
    listener({ data: { type: 'state', rpm: 7777, throttle: 1, limiting: true } })
    expect(sound.telemetry?.rpm).toBe(1100)
    await vi.advanceTimersByTimeAsync(FADE_OUT_MS + 10)
    await stopping
    expect(oldPort.onmessage).toBeNull()
    expect(sound.telemetry?.rpm).toBe(1100)
  })
})

describe('idealTrace', () => {
  it('draws one pulse per firing on its own exhaust lane', () => {
    const spec = getEngine('v8-cross')!
    const { a, b } = idealTrace(buildSynthConfig(spec))
    const rises = (lane: Float32Array) => lane.reduce((n, v, i) => n + (v > 0.05 && (lane[(i + lane.length - 1) % lane.length] ?? 0) <= 0.05 ? 1 : 0), 0)
    expect(a).toHaveLength(CYCLE_BINS)
    expect(rises(a)).toBeGreaterThanOrEqual(3)
    expect(rises(b)).toBeGreaterThanOrEqual(3)
    expect(idealTrace(buildSynthConfig(getEngine('inline-4')!)).b.every((v) => v === 0)).toBe(true)
  })
})
