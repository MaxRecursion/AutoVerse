import { describe, expect, it } from 'vitest'
import {
  BASE_PARAMS,
  DAMPING_PRESETS,
  LAP_SECONDS,
  ROAD_PROFILES,
  SPRING_RATE_RANGE,
  bodyFrequency,
  damperForce,
  dampingFor,
  dampingRatioOf,
  mechanicalEnergy,
  modelParams,
  poseAt,
  responseFor,
  rk4Step,
  settingsFromParams,
  simulateQuarterCar,
  STEP_SECONDS,
  staticTyreLoad,
  wheelHopFrequency,
  type DampingPreset,
  type QuarterCarParams,
  type QuarterCarState,
  type RoadProfile,
} from './quarterCar'

const FLAT = ROAD_PROFILES.flat
const withDamping = (preset: DampingPreset, springRate = BASE_PARAMS.springRate): QuarterCarParams => ({
  ...BASE_PARAMS,
  springRate,
  damping: dampingFor(dampingRatioOf(preset), springRate),
})

/** A 30 mm step up (a kerb-like ramp over 0.2 m) — the classic overshoot test input. */
const STEP_HEIGHT = 0.03
const STEP_UP: RoadProfile = {
  id: 'step',
  label: 'Step up',
  start: 1,
  end: 1.2,
  height: (x) => {
    const t = Math.min(1, Math.max(0, (x - 1) / 0.2))
    return STEP_HEIGHT * t * t * (3 - 2 * t)
  },
}

describe('quarter-car dynamics', () => {
  it('stays in static equilibrium on a flat road', () => {
    const r = simulateQuarterCar(withDamping('balanced'), FLAT, { periodic: false })
    for (let i = 0; i < r.count; i++) {
      expect(r.body[i]).toBe(0)
      expect(r.wheel[i]).toBe(0)
      expect(r.travel[i]).toBe(0)
      expect(r.tyreForce[i]).toBeCloseTo(staticTyreLoad(r.params), 9)
    }
    expect(r.stats.contactLost).toBe(false)
    // The static tyre load is the weight of both masses.
    expect(staticTyreLoad(BASE_PARAMS)).toBeCloseTo((BASE_PARAMS.sprungMass + BASE_PARAMS.unsprungMass) * 9.81, 9)
  })

  it('conserves energy without a damper and loses it steadily with one', () => {
    const initial: QuarterCarState = { zs: 0.03, vs: 0, zu: 0, vu: 0 }
    const run = (p: QuarterCarParams, steps: number) => {
      const energies = [mechanicalEnergy(p, initial)]
      let s = initial
      for (let i = 0; i < steps; i++) {
        s = rk4Step(p, s, i * STEP_SECONDS, STEP_SECONDS, () => 0)
        energies.push(mechanicalEnergy(p, s))
      }
      return energies
    }
    const e0 = mechanicalEnergy(BASE_PARAMS, initial)
    // Two simulated seconds: RK4 keeps the undamped energy constant to well under 0.1 %.
    for (const e of run({ ...BASE_PARAMS, damping: 0 }, 4000)) expect(Math.abs(e - e0) / e0).toBeLessThan(1e-3)

    const damped = run(withDamping('balanced'), 4000)
    for (let i = 1; i < damped.length; i++) expect(damped[i]).toBeLessThanOrEqual(damped[i - 1] + 1e-12)
    expect(damped[damped.length - 1] / e0).toBeLessThan(0.01)
    // A worn damper removes energy too, just far more slowly.
    const soft = run(withDamping('soft'), 4000)
    expect(soft[soft.length - 1]).toBeGreaterThan(damped[damped.length - 1] * 10)
  })

  it('bounces at the body frequency and hops at the wheel frequency', () => {
    // Undamped free response: count body zero crossings over the lap.
    const p = { ...BASE_PARAMS, damping: 0 }
    const r = simulateQuarterCar(p, FLAT, { periodic: false, initial: { zs: 0.02, vs: 0, zu: 0.02 * 0.1, vu: 0 } })
    let crossings = 0
    for (let i = 1; i < r.count; i++) if (Math.sign(r.body[i]) !== Math.sign(r.body[i - 1])) crossings++
    const measured = crossings / 2 / LAP_SECONDS
    expect(measured).toBeGreaterThan(bodyFrequency(p) * 0.85)
    expect(measured).toBeLessThan(bodyFrequency(p) * 1.15)
    expect(bodyFrequency(p)).toBeGreaterThan(1)
    expect(bodyFrequency(p)).toBeLessThan(1.6)
    expect(wheelHopFrequency(p)).toBeGreaterThan(10)
    expect(wheelHopFrequency(p)).toBeLessThan(14)
  })

  it('a stiffer damper reduces body overshoot after a step', () => {
    const overshoot = (preset: DampingPreset) => {
      const r = simulateQuarterCar(withDamping(preset), STEP_UP, { periodic: false, duration: 3 })
      return (r.stats.maxBody - STEP_HEIGHT) / STEP_HEIGHT
    }
    const soft = overshoot('soft')
    const balanced = overshoot('balanced')
    const stiff = overshoot('stiff')
    expect(soft).toBeGreaterThan(balanced)
    expect(balanced).toBeGreaterThan(stiff)
    expect(soft).toBeGreaterThan(0.5)
    expect(stiff).toBeLessThan(0.2)
  })

  it('has an energy-removing, digressive damper', () => {
    const p = withDamping('balanced')
    for (const v of [0.05, 0.25, 0.6, 1.2]) {
      expect(damperForce(p, -v)).toBeCloseTo(-damperForce(p, v), 9)
      expect(damperForce(p, v) * v).toBeGreaterThan(0)
    }
    expect(damperForce(p, 0.1)).toBeCloseTo(p.damping * 0.1, 9)
    expect(damperForce(p, 1)).toBeLessThan(p.damping * 1)
    expect(damperForce(p, 1)).toBeGreaterThan(damperForce(p, 0.5))
  })

  it('is deterministic: identical inputs give identical samples and poses', () => {
    const p = withDamping('soft')
    const a = simulateQuarterCar(p, ROAD_PROFILES.pothole)
    const b = simulateQuarterCar(p, ROAD_PROFILES.pothole)
    expect(Array.from(b.body)).toEqual(Array.from(a.body))
    expect(Array.from(b.wheel)).toEqual(Array.from(a.wheel))
    expect(Array.from(b.tyreForce)).toEqual(Array.from(a.tyreForce))
    expect(Array.from(b.phase)).toEqual(Array.from(a.phase))
    for (const progress of [0, 0.123, 0.21, 0.5, 0.9999, 1]) expect(poseAt(b, progress)).toEqual(poseAt(a, progress))

    const settings = { road: 'bump', damping: 'soft', springRate: 31 } as const
    const cached = responseFor(settings)
    expect(responseFor({ ...settings })).toBe(cached)
    expect(Array.from(simulateQuarterCar(modelParams(settings), ROAD_PROFILES.bump).body)).toEqual(Array.from(cached.body))
  })

  it('flags loss of tyre contact on a harsh input, but not on a gentle one', () => {
    const harsh = responseFor({ road: 'pothole', damping: 'balanced', springRate: 25 })
    expect(harsh.stats.contactLost).toBe(true)
    expect(harsh.stats.airborneSeconds).toBeGreaterThan(0.01)
    for (let i = 0; i < harsh.count; i++) {
      if (!harsh.contact[i]) expect(harsh.tyreForce[i]).toBe(0)
      else expect(harsh.tyreForce[i]).toBeGreaterThan(0)
    }
    const lost = poseAt(harsh, 0.21)
    expect(lost.contact).toBe(false)
    expect(lost.tyreForce).toBe(0)

    const gentle = responseFor({ road: 'bump', damping: 'balanced', springRate: 25 })
    expect(gentle.stats.contactLost).toBe(false)
    expect(gentle.stats.minTyreForce).toBeGreaterThan(0)
    expect(gentle.stats.maxTyreForce).toBeGreaterThan(staticTyreLoad(gentle.params))
  })

  it('shows the damper trade-offs on the test roads', () => {
    const r = (road: 'bump' | 'washboard', damping: DampingPreset) => responseFor({ road, damping, springRate: 25 })
    // Too soft: the body keeps bouncing; too stiff: bumps reach the body hard.
    expect(r('bump', 'soft').stats.minBody).toBeLessThan(r('bump', 'balanced').stats.minBody)
    expect(r('bump', 'stiff').stats.maxBody).toBeGreaterThan(r('bump', 'balanced').stats.maxBody)
    // On ripples near wheel-hop frequency a worn damper lets the tyre skip.
    expect(r('washboard', 'soft').stats.airborneSeconds).toBeGreaterThan(0.1)
    expect(r('washboard', 'balanced').stats.contactLost).toBe(false)
  })

  it('loops seamlessly: the periodic response ends where it starts', () => {
    for (const road of ['bump', 'pothole', 'washboard'] as const) {
      for (const preset of DAMPING_PRESETS) {
        const r = responseFor({ road, damping: preset.id, springRate: 25 })
        const last = r.count - 1
        expect(Math.abs(r.body[last] - r.body[0]), `${road}/${preset.id}`).toBeLessThan(1e-5)
        expect(Math.abs(r.wheel[last] - r.wheel[0]), `${road}/${preset.id}`).toBeLessThan(1e-5)
      }
    }
  })
})

describe('poseAt', () => {
  const r = responseFor({ road: 'bump', damping: 'balanced', springRate: 25 })

  it('returns the samples on the sample grid and interpolates between them', () => {
    const i = 190
    const exact = poseAt(r, i / (r.count - 1))
    expect(exact.body).toBeCloseTo(r.body[i], 12)
    expect(exact.wheel).toBeCloseTo(r.wheel[i], 12)
    const mid = poseAt(r, (i + 0.5) / (r.count - 1))
    expect(mid.body).toBeCloseTo((r.body[i] + r.body[i + 1]) / 2, 12)
    expect(mid.time).toBeCloseTo(((i + 0.5) / (r.count - 1)) * LAP_SECONDS, 12)
  })

  it('clamps out-of-range and non-finite progress', () => {
    expect(poseAt(r, -1)).toEqual(poseAt(r, 0))
    expect(poseAt(r, 2)).toEqual(poseAt(r, 1))
    expect(poseAt(r, Number.NaN)).toEqual(poseAt(r, 0))
  })

  it('reports tyre load relative to the static weight', () => {
    const p = poseAt(r, 0.05)
    expect(p.loadFactor).toBeCloseTo(p.tyreForce / staticTyreLoad(r.params), 12)
    expect(p.loadFactor).toBeGreaterThan(0.95)
    expect(p.loadFactor).toBeLessThan(1.05)
  })
})

describe('settingsFromParams', () => {
  it('validates loosely typed lab params', () => {
    expect(settingsFromParams({ road: 'pothole', damping: 'stiff', springRate: 40 })).toEqual({ road: 'pothole', damping: 'stiff', springRate: 40 })
    expect(settingsFromParams({ road: 'moon', damping: 7, springRate: 'x' })).toEqual({ road: 'bump', damping: 'balanced', springRate: 25 })
    expect(settingsFromParams({ springRate: 999 }).springRate).toBe(SPRING_RATE_RANGE.max)
    expect(settingsFromParams({ springRate: 1 }).springRate).toBe(SPRING_RATE_RANGE.min)
  })

  it('keeps damping presets as ratios, so the coefficient follows the spring', () => {
    const soft = modelParams({ road: 'bump', damping: 'balanced', springRate: 15 })
    const firm = modelParams({ road: 'bump', damping: 'balanced', springRate: 60 })
    expect(firm.damping / soft.damping).toBeCloseTo(2, 9)
  })
})
