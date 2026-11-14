import { describe, expect, it } from 'vitest'
import { engines, getEngine, type EngineSpec } from './engines'
import { buildSynthConfig, type SynthConfig } from './synth'
import synthSource from './synth.ts?raw'

const SAMPLE_RATE = 48_000

interface Processor {
  rpm: number
  rpmTarget: number
  throttle: number
  throttleTarget: number
  pipes: unknown[]
  message(message: unknown): void
  process(inputs: unknown[], outputs: Float32Array[][]): boolean
  pipe(pipe: unknown, input: number, ...args: unknown[]): number
}

/** Run the source actually sent to AudioWorklet, without a sound device. */
function render(config: SynthConfig, rpm: number, seconds: number, diagnostic = false) {
  const match = /const PROCESSOR = \/\* js \*\/ `([\s\S]*?)`/.exec(synthSource)
  if (!match) throw new Error('Could not find the shipped AudioWorklet source')
  let Constructor: (new () => Processor) | undefined
  let seed = 245
  const math = Object.create(Math) as Math
  math.random = diagnostic ? () => 0.5 : () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4_294_967_296
  }
  // Supply the AudioWorklet globals to the repository's own source. This
  // avoids browser audio devices and never evaluates external input.
  const load = new Function('sampleRate', 'AudioWorkletProcessor', 'registerProcessor', 'Math', match[1])
  load(SAMPLE_RATE, class { port = {} }, (_name: string, constructor: new () => Processor) => { Constructor = constructor }, math)
  if (!Constructor) throw new Error('The worklet did not register its processor')
  const processor = new Constructor()
  processor.message({ type: 'config', config, reset: true })
  processor.rpm = processor.rpmTarget = rpm
  processor.throttle = processor.throttleTarget = diagnostic ? 0.5 : 1
  const excitation = [[], []] as number[][]
  if (diagnostic) {
    // Observe each bank before filtering: narrow diagnostic pulses let us
    // measure firing timing independently of exhaust resonance or stereo bleed.
    processor.pipe = (pipe, input) => {
      excitation[processor.pipes.indexOf(pipe)]!.push(input)
      return input
    }
  }
  const frames = Math.round(seconds * SAMPLE_RATE)
  const channels = [new Float32Array(frames), new Float32Array(frames)]
  const block = [new Float32Array(128), new Float32Array(128)]
  for (let offset = 0; offset < frames; offset += 128) {
    expect(processor.process([], [block])).toBe(true)
    const length = Math.min(128, frames - offset)
    channels.forEach((channel, index) => channel.set(block[index]!.subarray(0, length), offset))
  }
  return { channels, excitation: excitation.map((samples) => samples.slice(0, frames)) }
}

function diagnosticConfig(id: string, separateBanks = false): SynthConfig {
  const spec = getEngine(id)!
  return buildSynthConfig({
    ...spec,
    separateBanks,
    redlineRpm: 15_000,
    voice: { ...spec.voice, pulseDeg: 6, runnerSpreadMs: 0, headerDelayMs: {} },
  })
}

function onsets(samples: ArrayLike<number>): number[] {
  const result: number[] = []
  for (let i = 1; i < samples.length; i++) {
    if (samples[i]! > 1e-9 && samples[i - 1]! <= 1e-9) result.push(i)
  }
  return result
}

const gaps = (starts: number[]) => starts.slice(1).map((sample, index) => sample - starts[index]!)

describe('shipped engine AudioWorklet', () => {
  it.each(engines.map((spec) => [spec.id, spec] as const))('renders finite, audible, unclipped output from idle to redline: %s', (_id, spec: EngineSpec) => {
    for (const rpm of [spec.idleRpm, spec.redlineRpm]) {
      const { channels } = render(buildSynthConfig(spec), rpm, 0.3)
      let squares = 0
      let peak = 0
      for (const channel of channels) {
        for (const sample of channel) {
          if (!Number.isFinite(sample)) throw new Error(`${spec.id} produced a non-finite sample at ${rpm} rpm`)
          peak = Math.max(peak, Math.abs(sample))
          squares += sample * sample
        }
      }
      expect(peak).toBeLessThanOrEqual(1)
      expect(Math.sqrt(squares / (channels[0]!.length * 2))).toBeGreaterThan(0.001)
    }
  })

  it.each([
    ['inline-3', 1200, [1600]], // 30 Hz: three cylinders, each firing once per two revolutions.
    ['inline-4', 1200, [1200]], // 40 Hz.
    ['v10-gallardo-even', 6000, [96]], // 72° at 6,000 rpm.
    ['v10-viper', 6000, [72, 120]], // 54° / 90° at 6,000 rpm.
    ['v10-carrera-gt', 6000, [68 * 4 / 3, 76 * 4 / 3]],
  ] as const)('plays the physical firing intervals at sample resolution: %s', (id, rpm, expected) => {
    const { excitation } = render(diagnosticConfig(id), rpm, 0.3, true)
    const measured = gaps(onsets(excitation[0]!))
    expect(measured.length).toBeGreaterThan(5)
    for (const gap of measured) expect(Math.min(...expected.map((value) => Math.abs(value - gap)))).toBeLessThanOrEqual(1)
    for (const value of expected) expect(measured.some((gap) => Math.abs(gap - value) <= 1)).toBe(true)
  })

  it('routes the cross-plane V8 into uneven bank pulses while its combined pulses stay even', () => {
    const { excitation } = render(diagnosticConfig('v8-cross', true), 6000, 0.16, true)
    const a = onsets(excitation[0]!)
    const b = onsets(excitation[1]!)
    // At 6,000 rpm, 90°, 180° and 270° are 120, 240 and 360 samples.
    expect([...new Set(gaps(a))].sort((x, y) => x - y)).toEqual([120, 240, 360])
    expect([...new Set(gaps(b))].sort((x, y) => x - y)).toEqual([120, 240, 360])
    expect([...new Set(gaps([...a, ...b].sort((x, y) => x - y)))]).toEqual([120])
  })

  it('delays an individual header pulse without changing the crank firing timeline', () => {
    const baseline = diagnosticConfig('inline-4')
    const delayed: SynthConfig = { ...baseline, events: baseline.events.map((event, index) => ({ ...event, delayMs: index === 1 ? 4 : 0 })) }
    const first = onsets(render(baseline, 6000, 0.16, true).excitation[0]!)
    const second = onsets(render(delayed, 6000, 0.16, true).excitation[0]!)
    // The second firing of each 960-sample cycle travels four milliseconds
    // farther (192 samples); all other firings retain their arrival times.
    const secondFiringPhase = first[0]! % 960
    expect(second).toEqual(first.map((sample) => sample % 960 === secondFiringPhase ? sample + 192 : sample).filter((sample) => sample < 7680).sort((x, y) => x - y))
    expect(delayed.events.map((event) => event.angle)).toEqual(baseline.events.map((event) => event.angle))
  })

  it('makes cylinder order audible through differing collector paths', () => {
    const spec = getEngine('inline-5')!
    const reordered = { ...spec, order: [1, 3, 4, 2, 5] }
    const original = render(buildSynthConfig(spec), 3000, 0.25).channels[0]!
    const changed = render(buildSynthConfig(reordered), 3000, 0.25).channels[0]!
    const difference = original.reduce((sum, value, index) => sum + (value - changed[index]!) ** 2, 0)
    expect(Math.sqrt(difference / original.length)).toBeGreaterThan(0.005)
  })
})
