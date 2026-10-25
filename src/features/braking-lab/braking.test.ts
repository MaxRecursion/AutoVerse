import { describe, expect, it } from 'vitest'
import {
  ABS_PRESSURE_BAND,
  ABS_SLIP_BAND,
  BAR,
  BRAKE_SPEC,
  DEFAULT_PARAMS,
  EVENT_TIMING,
  G,
  KMH,
  PEDAL_RANGE,
  SPEED_RANGE,
  SURFACES,
  absSlipAtPhase,
  absValveAtPhase,
  boreArea,
  brakingStateAt,
  clampMultiplication,
  discTemperatureRise,
  forcesAtPressure,
  hydraulicChain,
  kineticEnergy,
  planFor,
  planStop,
  readParams,
  sampleStop,
  stateFor,
  summarizeStop,
  toLabParams,
  type BrakingParams,
  type EventTiming,
  type StopPlan,
} from './braking'

const NO_RAMP: EventTiming = { ...EVENT_TIMING, leadIn: 0, applyTime: 0 }
const params = (p: Partial<BrakingParams> = {}): BrakingParams => ({ ...DEFAULT_PARAMS, ...p })

/** Midpoint-rule integral of f over [a, b]. */
function integrate(f: (t: number) => number, a: number, b: number, n = 20000): number {
  const h = (b - a) / n
  let sum = 0
  for (let i = 0; i < n; i++) sum += f(a + (i + 0.5) * h)
  return sum * h
}

const times = (plan: StopPlan, n = 400) => Array.from({ length: n + 1 }, (_, i) => (i / n) * plan.duration)

describe('hydraulic force multiplication', () => {
  it('turns pedal force into master-cylinder pressure through lever, servo and piston area', () => {
    const chain = hydraulicChain(100)
    expect(chain.pushrodN).toBeCloseTo(100 * BRAKE_SPEC.pedalRatio, 9)
    expect(chain.masterForceN).toBeCloseTo(100 * BRAKE_SPEC.pedalRatio * BRAKE_SPEC.servoGain, 9)
    expect(chain.pressurePa).toBeCloseTo(chain.masterForceN / boreArea(BRAKE_SPEC.masterBoreMm), 6)
    // 1,050 N on a 22.2 mm bore ≈ 27 bar.
    expect(chain.pressurePa / BAR).toBeCloseTo(27.1, 1)
  })

  it('applies the same pressure to the larger caliper piston, multiplying force by the area ratio (Pascal)', () => {
    const chain = hydraulicChain(120)
    const ratio = boreArea(BRAKE_SPEC.caliperBoreMm) / boreArea(BRAKE_SPEC.masterBoreMm)
    expect(ratio).toBeCloseTo((57 / 22.2) ** 2, 9)
    expect(chain.clampN / chain.masterForceN).toBeCloseTo(ratio, 9)
    expect(chain.clampN / chain.pedalN).toBeCloseTo(clampMultiplication(), 9)
    expect(clampMultiplication()).toBeGreaterThan(60)
  })

  it('follows clamp → pad friction → torque → tyre force → deceleration', () => {
    const f = forcesAtPressure(40 * BAR)
    expect(f.clampN).toBeCloseTo(40 * BAR * boreArea(57), 6)
    expect(f.frictionN).toBeCloseTo(2 * 0.4 * f.clampN, 6)
    expect(f.torqueNm).toBeCloseTo(f.frictionN * 0.12, 6)
    expect(f.tyreForceN).toBeCloseTo(f.torqueNm / 0.31, 6)
    expect(f.decel).toBeCloseTo(f.tyreForceN / 400, 9)
  })

  it('is linear in pedal force', () => {
    expect(hydraulicChain(240).pressurePa).toBeCloseTo(2 * hydraulicChain(120).pressurePa, 6)
    expect(hydraulicChain(240).decel).toBeCloseTo(2 * hydraulicChain(120).decel, 9)
  })
})

describe('stopping time and distance', () => {
  it('matches t = v0/a and d = v0²/2a for an instant, constant deceleration', () => {
    const plan = planStop(params({ pedalN: 100, speedKmh: 72 }), NO_RAMP)
    const v0 = 72 * KMH
    const a = hydraulicChain(100).decel
    expect(plan.mode).toBe('within-grip')
    expect(plan.tStop).toBeCloseTo(v0 / a, 9)
    const s = summarizeStop(plan)
    expect(s.stopTime).toBeCloseTo(v0 / a, 9)
    expect(s.stopDistance).toBeCloseTo((v0 * v0) / (2 * a), 6)
  })

  it('adds the pressure-ramp correction: d = v0²/2a + v0·τ/2 − a·τ²/24, t = v0/a + τ/2', () => {
    const plan = planStop(params({ pedalN: 120, speedKmh: 80 }))
    const v0 = 80 * KMH
    const a = plan.demandDecel
    const tau = EVENT_TIMING.applyTime
    const s = summarizeStop(plan)
    expect(s.stopTime).toBeCloseTo(v0 / a + tau / 2, 9)
    expect(s.stopDistance).toBeCloseTo((v0 * v0) / (2 * a) + (v0 * tau) / 2 - (a * tau * tau) / 24, 6)
  })

  it('caps deceleration at the tyre’s grip, μ·g', () => {
    for (const surface of ['dry', 'wet', 'ice'] as const) {
      for (const abs of [true, false]) {
        const plan = planStop(params({ pedalN: PEDAL_RANGE.max, surface, abs }))
        for (const t of times(plan)) expect(brakingStateAt(plan, t).decel).toBeLessThanOrEqual(SURFACES[surface].muPeak * G + 1e-9)
      }
    }
  })

  it('keeps speed continuous and never negative', () => {
    for (const p of [params(), params({ surface: 'wet', pedalN: 220, abs: false }), params({ surface: 'ice', abs: true })]) {
      const plan = planStop(p)
      let prev = plan.v0
      for (const t of times(plan, 2000)) {
        const v = brakingStateAt(plan, t).vehicleSpeed
        expect(v).toBeGreaterThanOrEqual(0)
        expect(prev - v).toBeLessThan(0.25)
        prev = v
      }
      expect(brakingStateAt(plan, plan.duration).vehicleSpeed).toBe(0)
    }
  })
})

describe('wheel rotation', () => {
  it('follows θ = (v0·t − ½·a·t²)/r while the tyre rolls', () => {
    const plan = planStop(params({ pedalN: 100, speedKmh: 60 }), NO_RAMP)
    const v0 = 60 * KMH
    const a = plan.demandDecel
    for (const t of [0, 0.3, 1, plan.tStop * 0.75]) {
      expect(brakingStateAt(plan, t).wheelAngle).toBeCloseTo((v0 * t - 0.5 * a * t * t) / BRAKE_SPEC.tyreRadiusM, 6)
    }
    // After the stop the wheel stays where it stopped.
    const atStop = (v0 * v0) / (2 * a) / BRAKE_SPEC.tyreRadiusM
    expect(brakingStateAt(plan, plan.duration).wheelAngle).toBeCloseTo(atStop, 6)
  })

  it('agrees with the integral of wheel speed in every mode (no jumps)', () => {
    for (const p of [params(), params({ surface: 'wet', pedalN: 220, abs: false }), params({ surface: 'wet', pedalN: 220, abs: true })]) {
      const plan = planStop(p)
      for (const t of [0.5, plan.tLimit + 0.03, plan.tLimit + 0.4, plan.tStop * 0.8, plan.duration]) {
        if (!Number.isFinite(t)) continue
        const expected = integrate((u) => brakingStateAt(plan, u).wheelSpeed, 0, t) / BRAKE_SPEC.tyreRadiusM
        expect(brakingStateAt(plan, t).wheelAngle).toBeCloseTo(expected, 2)
      }
    }
  })
})

describe('energy: kinetic energy becomes heat', () => {
  const cases = [
    params(),
    params({ speedKmh: SPEED_RANGE.max, pedalN: 150 }),
    params({ surface: 'wet', pedalN: 220, abs: false }),
    params({ surface: 'wet', pedalN: 220, abs: true }),
    params({ surface: 'ice', pedalN: 120, abs: true }),
  ]

  it('converts exactly the lost kinetic energy at every instant (heat = ΔKE)', () => {
    for (const p of cases) {
      const plan = planStop(p)
      for (const t of times(plan, 200)) {
        const s = brakingStateAt(plan, t)
        const deltaKE = kineticEnergy(400, plan.v0) - kineticEnergy(400, s.vehicleSpeed)
        expect(s.energyTotal).toBeCloseTo(deltaKE, 6)
        expect(s.energyBrake + s.energyTyre).toBeCloseTo(deltaKE, 3)
        expect(s.energyBrake).toBeGreaterThanOrEqual(0)
        expect(s.energyTyre).toBeGreaterThanOrEqual(-1e-6)
      }
      expect(brakingStateAt(plan, plan.duration).energyTotal).toBeCloseTo(kineticEnergy(400, plan.v0), 6)
    }
  })

  it('matches the work done by the braking force, ∫ m·a·v dt', () => {
    for (const p of cases.slice(0, 4)) {
      const plan = planStop(p)
      const work = integrate((t) => {
        const s = brakingStateAt(plan, t)
        return 400 * s.decel * s.vehicleSpeed
      }, 0, plan.duration)
      expect(work / kineticEnergy(400, plan.v0)).toBeCloseTo(1, 3)
    }
  })

  it('sends all the energy into the brake while the tyre rolls, but into the sliding tyre once the wheel locks', () => {
    const rolling = summarizeStop(planStop(params()))
    expect(rolling.energyTyre).toBe(0)
    expect(rolling.energyBrake).toBeCloseTo(kineticEnergy(400, 80 * KMH), 6)

    const locked = summarizeStop(planStop(params({ surface: 'wet', pedalN: 220, abs: false })))
    expect(locked.energyTyre / locked.energyTotal).toBeGreaterThan(0.8)

    const abs = summarizeStop(planStop(params({ surface: 'wet', pedalN: 220, abs: true })))
    const tyreShare = abs.energyTyre / abs.energyTotal
    expect(tyreShare).toBeGreaterThan(ABS_SLIP_BAND.low * 0.8)
    expect(tyreShare).toBeLessThan(ABS_SLIP_BAND.high)
  })

  it('raises the disc temperature by E / (m·c)', () => {
    expect(discTemperatureRise(3450)).toBeCloseTo(1, 9)
    const plan = planStop(params())
    const end = brakingStateAt(plan, plan.duration)
    expect(end.discTempC - BRAKE_SPEC.startTempC).toBeCloseTo(end.energyBrake / (7.5 * 460), 9)
    // ½·400·(22.2 m/s)² ≈ 98.8 kJ → about +29 K for one stop.
    expect(summarizeStop(plan).discRiseK).toBeCloseTo(28.6, 1)
  })
})

describe('wheel lock and the conceptual ABS', () => {
  const wetHard = { surface: 'wet', pedalN: 220 } as const

  it('locks the wheel without ABS when the demand exceeds grip: wheel speed → 0, slip → 100 %', () => {
    const plan = planStop(params({ ...wetHard, abs: false }))
    expect(plan.mode).toBe('lock')
    expect(plan.demandDecel).toBeGreaterThan(plan.gripDecel)
    const s = brakingStateAt(plan, plan.tLimit + EVENT_TIMING.lockUpTime + 0.05)
    expect(s.phase).toBe('wheel-lock')
    expect(s.wheelSpeed).toBe(0)
    expect(s.slip).toBe(1)
    expect(s.wheelLocked).toBe(true)
    expect(s.vehicleSpeed).toBeGreaterThan(5)
    expect(s.decel).toBeCloseTo(SURFACES.wet.muSlide * G, 9)
    expect(s.absValve).toBe('inactive')
  })

  it('keeps slip inside the illustrative 10–20 % band with ABS while the car moves', () => {
    for (const surface of ['dry', 'wet', 'ice'] as const) {
      const plan = planStop(params({ surface, pedalN: PEDAL_RANGE.max, abs: true }))
      expect(plan.mode).toBe('abs')
      let minSlip = 1
      let maxSlip = 0
      for (let t = plan.tAbsCycles; t < plan.tStop - 0.01; t += 0.004) {
        const s = brakingStateAt(plan, t)
        expect(s.phase).toBe('abs-active')
        expect(s.wheelSpeed).toBeGreaterThan(0)
        minSlip = Math.min(minSlip, s.slip)
        maxSlip = Math.max(maxSlip, s.slip)
      }
      expect(minSlip).toBeGreaterThanOrEqual(ABS_SLIP_BAND.low - 1e-9)
      expect(maxSlip).toBeLessThanOrEqual(ABS_SLIP_BAND.high + 1e-9)
      expect(maxSlip - minSlip).toBeGreaterThan(0.08)
    }
  })

  it('modulates caliper pressure (hold → release → hold → reapply) while the master cylinder stays high', () => {
    const plan = planStop(params({ ...wetHard, abs: true }))
    const states = new Set<string>()
    // First whole cycle after the driver's pressure ramp has finished.
    const T = plan.timing.absPeriod
    const start = plan.tAbsCycles + Math.ceil((plan.tRampEnd - plan.tAbsCycles) / T) * T
    for (let t = start; t < start + T; t += 0.002) {
      const s = brakingStateAt(plan, t)
      states.add(s.absValve)
      expect(s.masterPressurePa).toBeCloseTo(plan.chain.pressurePa, 6)
      expect(s.caliperPressurePa).toBeGreaterThanOrEqual(plan.limitPressurePa * ABS_PRESSURE_BAND.low - 1e-6)
      expect(s.caliperPressurePa).toBeLessThanOrEqual(plan.limitPressurePa * ABS_PRESSURE_BAND.high + 1e-6)
      expect(s.caliperPressurePa).toBeLessThan(s.masterPressurePa)
    }
    expect([...states].sort()).toEqual(['hold', 'reapply', 'release'])
    expect(absValveAtPhase(0.05)).toBe('hold')
    expect(absValveAtPhase(0.2)).toBe('release')
    expect(absValveAtPhase(0.45)).toBe('hold')
    expect(absValveAtPhase(0.8)).toBe('reapply')
    expect(absSlipAtPhase(1.0)).toBeCloseTo(absSlipAtPhase(0), 12)
  })

  it('stops shorter with ABS than with a locked wheel on the same surface', () => {
    for (const surface of ['dry', 'wet', 'ice'] as const) {
      const abs = summarizeStop(planStop(params({ surface, pedalN: PEDAL_RANGE.max, abs: true })))
      const lock = summarizeStop(planStop(params({ surface, pedalN: PEDAL_RANGE.max, abs: false })))
      expect(abs.stopDistance).toBeLessThan(lock.stopDistance)
    }
  })

  it('leaves ABS idle when the brakes stay within grip', () => {
    const plan = planStop(params({ abs: true }))
    expect(plan.mode).toBe('within-grip')
    for (const t of times(plan)) {
      const s = brakingStateAt(plan, t)
      expect(s.absValve).toBe('inactive')
      expect(s.slip).toBe(0)
      expect(s.caliperPressurePa).toBeCloseTo(s.masterPressurePa, 6)
    }
  })
})

describe('timeline phases and visuals', () => {
  it('runs rolling → apply → braking → stopped', () => {
    const plan = planStop(params())
    expect(brakingStateAt(plan, 0.1).phase).toBe('rolling')
    expect(brakingStateAt(plan, plan.tApply + 0.1).phase).toBe('apply')
    expect(brakingStateAt(plan, plan.tRampEnd + 0.1).phase).toBe('braking')
    expect(brakingStateAt(plan, plan.tStop + 0.01).phase).toBe('stopped')
    expect(plan.duration).toBeCloseTo(plan.tStop + EVENT_TIMING.holdAfterStop, 12)
  })

  it('closes the pad clearance early and moves the pedal with pressure', () => {
    const plan = planStop(params())
    expect(brakingStateAt(plan, 0).padContact).toBe(0)
    expect(brakingStateAt(plan, 0).pedalTravel).toBe(0)
    const mid = brakingStateAt(plan, plan.tApply + EVENT_TIMING.applyTime * 0.5)
    expect(mid.padContact).toBe(1)
    expect(brakingStateAt(plan, plan.tRampEnd + 0.5).pedalTravel).toBeGreaterThan(mid.pedalTravel)
  })

  it('samples the stop densely enough to resolve each ABS cycle', () => {
    const plan = planStop(params({ surface: 'wet', pedalN: 220, abs: true }))
    const samples = sampleStop(plan)
    expect(samples[0].t).toBe(0)
    expect(samples[samples.length - 1].t).toBeCloseTo(plan.duration, 9)
    const perCycle = (samples.length - 1) / (plan.duration / plan.timing.absPeriod)
    expect(perCycle).toBeGreaterThanOrEqual(7)
  })
})

describe('params and caching', () => {
  it('reads, clamps and defaults store params', () => {
    expect(readParams({})).toEqual(DEFAULT_PARAMS)
    expect(readParams({ pedal: 5000, speed: 1, surface: 'gravel', abs: 'yes' })).toEqual({
      pedalN: PEDAL_RANGE.max,
      speedKmh: SPEED_RANGE.min,
      surface: DEFAULT_PARAMS.surface,
      abs: DEFAULT_PARAMS.abs,
    })
    const p = params({ surface: 'ice', abs: false, pedalN: 90, speedKmh: 50 })
    expect(readParams(toLabParams(p))).toEqual(p)
  })

  it('memoises plans and per-frame state', () => {
    const raw = toLabParams(params({ speedKmh: 100 }))
    expect(planFor(raw)).toBe(planFor({ ...raw }))
    expect(stateFor(raw, 0.4)).toBe(stateFor(raw, 0.4))
    expect(stateFor(raw, 0.4).t).toBeCloseTo(0.4 * planFor(raw).duration, 12)
  })

  it('rejects a zero pedal force or speed', () => {
    expect(() => planStop(params({ pedalN: 0 }))).toThrow(RangeError)
    expect(() => planStop(params({ speedKmh: 0 }))).toThrow(RangeError)
  })
})
