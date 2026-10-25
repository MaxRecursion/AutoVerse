import { describe, expect, it } from 'vitest'
import { createLabStore } from '@/lib/simulation/labStore'
import { ENGINE_CUES, deriveEngineCue, engineLabConfig, formatEngineProgress } from './config'
import { crankAngleFromProgress, engineStateAt, strokeAt } from './kinematics'

const deg = (p: number) => crankAngleFromProgress(p)

describe('engineLabConfig', () => {
  it('runs one 720° cycle in about six seconds, stepping 5° of crank', () => {
    expect(engineLabConfig.cycleDuration).toBe(6)
    expect(engineLabConfig.stepSize * 720).toBeCloseTo(5, 10)
    expect(engineLabConfig.speeds).toEqual([0.1, 0.25, 0.5, 1, 2])
    expect(engineLabConfig.loop).toBe(true)
    expect(engineLabConfig.timeline).toBe(true)
  })

  it('defines stroke and event cues on the 5° step grid, each showing its own stroke', () => {
    const ids = ENGINE_CUES.map((c) => c.id)
    expect(ids).toEqual(expect.arrayContaining(['intake', 'compression', 'power', 'exhaust', 'tdc', 'bdc', 'spark', 'overlap']))
    for (const cue of ENGINE_CUES) {
      const d = deg(cue.progress ?? -1)
      expect(Number.isInteger(Math.round(d * 1e6) / 1e6 / 5)).toBe(true)
    }
    for (const stroke of ['intake', 'compression', 'power', 'exhaust'] as const) {
      const cue = ENGINE_CUES.find((c) => c.id === stroke)
      expect(strokeAt(deg(cue?.progress ?? 0))).toBe(stroke)
    }
  })

  it('derives the stroke as the live cue, changing exactly at TDC and BDC', () => {
    expect(deriveEngineCue(0)).toBe('intake')
    expect(deriveEngineCue(179.9 / 720)).toBe('intake')
    expect(deriveEngineCue(0.25)).toBe('compression')
    expect(deriveEngineCue(0.5)).toBe('power')
    expect(deriveEngineCue(0.75)).toBe('exhaust')
    expect(deriveEngineCue(0.9999)).toBe('exhaust')
  })

  it('formats the timeline readout', () => {
    expect(formatEngineProgress(127 / 720)).toBe('127° · Intake')
    expect(formatEngineProgress(0.5)).toBe('360° · Power')
    expect(formatEngineProgress(719.8 / 720)).toBe('719° · Exhaust')
  })
})

describe('engine lab store', () => {
  it('advances only while playing and updates the cue at stroke boundaries', () => {
    const store = createLabStore(engineLabConfig)
    expect(store.getState().cue).toBe('intake')
    store.getState().advance(1)
    expect(store.getState().progress).toBe(0)

    store.getState().play()
    store.getState().advance(1.5) // 1.5 s of a 6 s cycle = 180°
    expect(deg(store.getState().progress)).toBeCloseTo(180, 6)
    expect(store.getState().cue).toBe('compression')

    store.getState().setSpeed(2)
    store.getState().advance(1.5) // 2× → another 360°
    expect(deg(store.getState().progress)).toBeCloseTo(540, 6)
    expect(store.getState().cue).toBe('exhaust')

    store.getState().pause()
    store.getState().advance(1)
    expect(deg(store.getState().progress)).toBeCloseTo(540, 6)
  })

  it('wraps from the end of exhaust back to intake', () => {
    const store = createLabStore(engineLabConfig, { autoplay: true })
    store.getState().seek(710 / 720)
    store.getState().play()
    store.getState().advance(0.25) // 30°
    expect(deg(store.getState().progress)).toBeCloseTo(20, 6)
    expect(store.getState().cue).toBe('intake')
  })

  it('seeks to cues and pauses', () => {
    const store = createLabStore(engineLabConfig, { autoplay: true })
    store.getState().seekCue('power')
    expect(store.getState().playing).toBe(false)
    expect(deg(store.getState().progress)).toBe(400)
    expect(store.getState().cue).toBe('power')
    store.getState().seekCue('tdc')
    expect(deg(store.getState().progress)).toBe(360)
    store.getState().seekCue('spark')
    expect(deg(store.getState().progress)).toBe(345)
    expect(store.getState().cue).toBe('compression')
    store.getState().seekCue('does-not-exist')
    expect(deg(store.getState().progress)).toBe(345)
  })

  it('snaps steps to the 5° grid and wraps in both directions', () => {
    const store = createLabStore(engineLabConfig)
    store.getState().seek(12.3 / 720)
    store.getState().stepBy(1)
    expect(deg(store.getState().progress)).toBe(15)
    store.getState().stepBy(-4)
    expect(deg(store.getState().progress)).toBe(715)
    expect(store.getState().cue).toBe('exhaust')
    store.getState().stepBy(1)
    expect(deg(store.getState().progress)).toBe(0)
    expect(store.getState().cue).toBe('intake')
    // 144 steps of 5° = one full cycle.
    store.getState().stepBy(144)
    expect(deg(store.getState().progress)).toBe(0)
  })

  it('gives the identical pose for the same progress after any play / scrub history', () => {
    const a = createLabStore(engineLabConfig)
    const b = createLabStore(engineLabConfig)
    a.getState().play()
    for (let i = 0; i < 37; i++) a.getState().advance(0.0167)
    a.getState().seek(0.9)
    a.getState().stepBy(-3)
    a.getState().seekCue('compression')
    a.getState().seek(0.4321)

    b.getState().seek(0.4321)
    expect(a.getState().progress).toBe(b.getState().progress)
    expect(a.getState().cue).toBe(b.getState().cue)
    expect(engineStateAt(a.getState().progress)).toEqual(engineStateAt(b.getState().progress))
  })
})

describe('learner activity', () => {
  it('records only user-facing actions, never the playback clock', () => {
    const store = createLabStore(engineLabConfig, { autoplay: true })
    store.getState().advance(0.5)
    store.getState().advance(0.5)
    expect(store.getState().activity).toEqual({})

    store.getState().seekCue('power')
    store.getState().select('piston')
    store.getState().setExploded(true)
    store.getState().toggle()
    expect(Object.keys(store.getState().activity).sort()).toEqual(['cue:power', 'explode', 'play', 'select:piston'])
  })

  it('does not rewrite the record (or wake subscribers) when an action repeats', () => {
    const store = createLabStore(engineLabConfig)
    store.getState().seek(0.25)
    const first = store.getState().activity
    store.getState().seek(0.5)
    expect(store.getState().activity).toBe(first)
  })

  it('ignores deselect and un-exploding', () => {
    const store = createLabStore(engineLabConfig)
    store.getState().select(null)
    store.getState().setExploded(false)
    expect(store.getState().activity).toEqual({})
  })
})
