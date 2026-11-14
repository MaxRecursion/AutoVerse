import { describe, expect, it } from 'vitest'
import { getEngine } from './engines'
import { buildSynthConfig, CYCLE_BINS, type SynthConfig } from './synth'
import synthSource from './synth.ts?raw'

/*
 * The telemetry the worklet sends back for the page's diagrams. Runs the
 * shipped processor source with stand-in AudioWorklet globals (the same
 * approach as worklet.test.ts, which covers the sound itself).
 */
const SAMPLE_RATE = 48_000

interface Processor {
  rpm: number
  rpmTarget: number
  throttle: number
  throttleTarget: number
  message(message: unknown): void
  process(inputs: unknown[], outputs: Float32Array[][]): boolean
}

interface Posted {
  type: string
  rpm?: number
  limiting?: boolean
  a?: Float32Array
  b?: Float32Array
}

function render(config: SynthConfig, rpm: number, seconds: number, telemetry: boolean, withPort = true) {
  const match = /const PROCESSOR = \/\* js \*\/ `([\s\S]*?)`/.exec(synthSource)
  if (!match) throw new Error('Could not find the shipped AudioWorklet source')
  let seed = 99
  const math = Object.create(Math) as Math
  math.random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4_294_967_296
  }
  const posted: Posted[] = []
  const port = withPort ? { postMessage: (m: Posted) => posted.push(m) } : {}
  let Constructor: (new () => Processor) | undefined
  const load = new Function('sampleRate', 'AudioWorkletProcessor', 'registerProcessor', 'Math', match[1])
  load(SAMPLE_RATE, class { port = port }, (_name: string, constructor: new () => Processor) => { Constructor = constructor }, math)
  const processor = new Constructor!()
  processor.message({ type: 'config', config, reset: true })
  if (telemetry) processor.message({ type: 'telemetry', on: true })
  processor.rpm = processor.rpmTarget = rpm
  processor.throttle = processor.throttleTarget = 0.6
  const frames = Math.round(seconds * SAMPLE_RATE)
  const left = new Float32Array(frames)
  const block = [new Float32Array(128), new Float32Array(128)]
  for (let offset = 0; offset < frames; offset += 128) {
    processor.process([], [block])
    left.set(block[0]!.subarray(0, Math.min(128, frames - offset)), offset)
  }
  return { posted, left }
}

describe('worklet telemetry', () => {
  it('stays silent until the page asks, and then never changes the sound', () => {
    const config = buildSynthConfig(getEngine('v8-cross')!)
    const quiet = render(config, 3000, 0.25, false, false)
    const reporting = render(config, 3000, 0.25, true)
    expect(quiet.posted).toEqual([])
    expect(Array.from(reporting.left)).toEqual(Array.from(quiet.left))
  })

  it('reports engine speed about 60 times a second', () => {
    const { posted } = render(buildSynthConfig(getEngine('inline-4')!), 2400, 0.5, true)
    const states = posted.filter((m) => m.type === 'state')
    expect(states.length).toBeGreaterThanOrEqual(28)
    expect(states.length).toBeLessThanOrEqual(31)
    expect(states.every((m) => Math.abs(m.rpm! - 2400) < 1 && m.limiting === false)).toBe(true)
  })

  it('flags the rev limiter at the redline', () => {
    const spec = getEngine('v10-s85')!
    const { posted } = render(buildSynthConfig(spec), spec.redlineRpm + 100, 0.1, true)
    expect(posted.filter((m) => m.type === 'state').every((m) => m.limiting)).toBe(true)
  })

  it('sends whole-cycle waveforms per bank, at most 30 a second', () => {
    // 3,000 rpm: one 720° cycle every 40 ms, so every completed cycle is sent.
    const { posted } = render(buildSynthConfig(getEngine('v8-cross')!), 3000, 0.5, true)
    const cycles = posted.filter((m) => m.type === 'cycle')
    expect(cycles.length).toBeGreaterThanOrEqual(10)
    expect(cycles.length).toBeLessThanOrEqual(13)
    for (const { a, b } of cycles.slice(1)) {
      expect(a).toHaveLength(CYCLE_BINS)
      expect(b).toHaveLength(CYCLE_BINS)
      expect([...a!, ...b!].every(Number.isFinite)).toBe(true)
      expect(Math.max(...a!.map(Math.abs))).toBeGreaterThan(1e-4)
      expect(Math.max(...b!.map(Math.abs))).toBeGreaterThan(1e-4)
    }
  })

  it('rate-limits cycles at high revs and leaves bank B empty for a shared exhaust', () => {
    const spec = getEngine('inline-4')!
    // 8,400 rpm is 70 cycles a second.
    const { posted } = render(buildSynthConfig(spec), 8400, 0.5, true)
    const cycles = posted.filter((m) => m.type === 'cycle')
    expect(cycles.length).toBeGreaterThanOrEqual(10)
    expect(cycles.length).toBeLessThanOrEqual(16)
    expect(cycles.every(({ b }) => b!.every((v) => v === 0))).toBe(true)
  })
})
