import { describe, expect, it } from 'vitest'
import { TYRE, dist, solveLinkage } from './linkage'
import { BASE_PARAMS, LAP_LENGTH, SPRING_RATE_RANGE } from './quarterCar'
import { COILOVER, LOADED_RADIUS, ROLL_RADIUS, STATIC_TYRE_DEFLECTION, WHEEL_SPOKES, coiloverState, createFrameCache, suspensionFrameAt } from './suspensionModel'

const params = (over: Record<string, string | number> = {}) => ({ road: 'bump', damping: 'balanced', springRate: SPRING_RATE_RANGE.initial, ...over })
const ROADS = ['bump', 'pothole', 'washboard'] as const
const LAP = Array.from({ length: 81 }, (_, i) => i / 80)

describe('suspension frame', () => {
  it('puts the wheel centre where the quarter-car model says the wheel is', () => {
    for (const road of ROADS)
      for (const p of LAP) {
        const f = suspensionFrameAt(p, params({ road }))
        // Linkage (body frame) + body displacement = static height + wheel displacement.
        expect(f.wheelCentreY, `${road} @ ${p}`).toBeCloseTo(LOADED_RADIUS + f.pose.wheel, 9)
        expect(f.link.travel).toBeCloseTo(f.pose.travel, 12)
      }
  })

  it('keeps the drawn tyre on the road while the model says it is in contact, and above it when airborne', () => {
    for (const road of ROADS)
      for (const damping of ['soft', 'balanced', 'stiff'])
        for (const p of LAP) {
          const f = suspensionFrameAt(p, params({ road, damping }))
          const squash = f.pose.roadZ - (f.wheelCentreY - TYRE.freeRadius)
          if (f.pose.contact) expect(squash, `${road}/${damping} @ ${p}`).toBeGreaterThan(-1e-6)
          else expect(squash, `${road}/${damping} @ ${p}`).toBeLessThan(1e-6)
        }
  })

  it('rolls the wheel a whole number of spoke pitches per lap, so the loop is seamless', () => {
    const pitch = (2 * Math.PI) / WHEEL_SPOKES
    const turns = LAP_LENGTH / ROLL_RADIUS / pitch
    expect(Math.abs(turns - Math.round(turns))).toBeLessThan(1e-9)
    // …with a rolling radius between the loaded and free radius, like a real tyre.
    expect(ROLL_RADIUS).toBeGreaterThan(TYRE.freeRadius - STATIC_TYRE_DEFLECTION)
    expect(ROLL_RADIUS).toBeLessThan(TYRE.freeRadius)
    expect(suspensionFrameAt(0.5, params()).wheelSpin).toBeCloseTo(LAP_LENGTH / 2 / ROLL_RADIUS, 9)
  })

  it('is a pure function of progress and params', () => {
    const a = suspensionFrameAt(0.37, params({ road: 'pothole' }))
    const b = suspensionFrameAt(0.37, params({ road: 'pothole' }))
    expect(b.pose).toEqual(a.pose)
    expect(b.link).toEqual(a.link)
    expect(b.wheelSpin).toBe(a.wheelSpin)
  })

  it('caches one frame per (progress, params object)', () => {
    const frame = createFrameCache()
    const p = params()
    const a = frame(0.2, p)
    expect(frame(0.2, p)).toBe(a)
    expect(frame(0.3, p)).not.toBe(a)
    const q = params({ damping: 'stiff' })
    const c = frame(0.3, q)
    expect(c.settings.damping).toBe('stiff')
    expect(frame(0.3, q)).toBe(c)
  })
})

describe('coil-over layout', () => {
  it('keeps the spring, rod and bump stop consistent with the coil-over length', () => {
    for (const road of ROADS)
      for (const p of LAP) {
        const { link } = suspensionFrameAt(p, params({ road, damping: 'soft', springRate: SPRING_RATE_RANGE.min }))
        const c = coiloverState(link)
        expect(c.length).toBe(link.coiloverLength)
        expect(c.springLength).toBeCloseTo(c.length - COILOVER.lowerSeat - COILOVER.upperSeatGap, 12)
        expect(c.springLength).toBeGreaterThan(0)
        // The rod never pulls out of the damper body; the bump stop never squashes below a fifth of its length.
        expect(c.rodExposed).toBeLessThan(COILOVER.rodLength)
        expect(c.bumpStopLength).toBeGreaterThanOrEqual(0.2 * COILOVER.bumpStopLength - 1e-12)
        expect(c.bumpStopLength).toBeLessThanOrEqual(COILOVER.bumpStopLength + 1e-12)
      }
  })

  it('touches the bump stop exactly where the model’s stop starts to push', () => {
    const stopAt = BASE_PARAMS.bumpStopAt
    expect(coiloverState(solveLinkage(stopAt - 0.002, LOADED_RADIUS)).bumpStopLength).toBe(COILOVER.bumpStopLength)
    expect(coiloverState(solveLinkage(stopAt, LOADED_RADIUS)).bumpStopLength).toBeCloseTo(COILOVER.bumpStopLength, 9)
    expect(coiloverState(solveLinkage(stopAt + 0.002, LOADED_RADIUS)).bumpStopLength).toBeLessThan(COILOVER.bumpStopLength - 0.0005)
    // Deepest point on a soft spring: the stop is squashed.
    const r = suspensionFrameAt(0, params({ springRate: SPRING_RATE_RANGE.min })).response
    let deepest = 0
    for (let i = 0; i < r.count; i++) if (r.travel[i] > r.travel[deepest]) deepest = i
    const f = suspensionFrameAt(deepest / (r.count - 1), params({ springRate: SPRING_RATE_RANGE.min }))
    expect(f.pose.travel).toBeGreaterThan(r.params.bumpStopAt)
    expect(coiloverState(f.link).bumpStopLength).toBeLessThan(COILOVER.bumpStopLength)
  })

  it('moves the ball joints with the arms (closed linkage at every frame)', () => {
    const f0 = suspensionFrameAt(0, params())
    const knuckle = dist(f0.link.lowerBallJoint, f0.link.upperBallJoint)
    for (const p of LAP) {
      const f = suspensionFrameAt(p, params({ road: 'pothole' }))
      expect(dist(f.link.lowerBallJoint, f.link.upperBallJoint)).toBeCloseTo(knuckle, 9)
    }
  })
})
