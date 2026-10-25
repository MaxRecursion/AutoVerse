import { describe, expect, it } from 'vitest'
import {
  beltTravel,
  loopSampler,
  BORE_R,
  CAM_CENTRE_S,
  CRANK_R,
  DECK_Y,
  GAS_COLOURS,
  HEAD,
  ROD_L,
  ROLLER_REST_S,
  TIMING,
  VALVES,
  VALVE_S,
  camCentre,
  camLobeProfile,
  camRotation,
  crownYFromPinMm,
  gasAppearance,
  headSectionPieces,
  portGasAppearance,
  portPath,
  rodEnds,
  timingBeltPath,
  visualLift,
  type Vec2,
} from './engineModel'
import { crankPinPosition, pistonPinHeight } from './kinematics'

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.z - b.z, a.y - b.y)

function distanceToSegment(p: Vec2, a: Vec2, b: Vec2) {
  const dz = b.z - a.z
  const dy = b.y - a.y
  const t = Math.max(0, Math.min(1, ((p.z - a.z) * dz + (p.y - a.y) * dy) / (dz * dz + dy * dy)))
  return Math.hypot(p.z - (a.z + t * dz), p.y - (a.y + t * dy))
}

function segmentsCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2) {
  const o = (p: Vec2, q: Vec2, r: Vec2) => Math.sign((q.z - p.z) * (r.y - p.y) - (q.y - p.y) * (r.z - p.z))
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0
}

describe('connecting rod', () => {
  it('always spans exactly the wrist pin and the crank pin', () => {
    for (let deg = 0; deg < 720; deg += 3) {
      const { small, big } = rodEnds(pistonPinHeight(deg), crankPinPosition(deg))
      expect(dist(small, big)).toBeCloseTo(ROD_L, 9)
      expect(Math.hypot(big.z, big.y)).toBeCloseTo(CRANK_R, 9)
    }
  })

  it('never lets the crown reach the head, and leaves the deck clearance at TDC', () => {
    for (let deg = 0; deg < 720; deg += 1) expect(crownYFromPinMm(pistonPinHeight(deg))).toBeLessThan(DECK_Y)
    expect(DECK_Y - crownYFromPinMm(pistonPinHeight(0))).toBeCloseTo(0.01, 9)
  })
})

describe('valvetrain', () => {
  it('keeps the roller follower in contact with the rotating lobe at every crank angle', () => {
    for (const valve of ['intake', 'exhaust'] as const) {
      const profile = camLobeProfile(valve, 360)
      for (let deg = 0; deg < 720; deg += 5) {
        const a = camRotation(valve, deg)
        // Rotate the lobe about x exactly as three.js does: (y, z) → (y·cos a − z·sin a, y·sin a + z·cos a).
        const rotated = profile.map((p) => ({ y: p.y * Math.cos(a) - p.z * Math.sin(a), z: p.y * Math.sin(a) + p.z * Math.cos(a) }))
        const roller: Vec2 = { z: 0, y: -(CAM_CENTRE_S - (ROLLER_REST_S - visualLift(valve, deg))) }
        let gap = Infinity
        for (let i = 0; i < rotated.length; i++) gap = Math.min(gap, distanceToSegment(roller, rotated[i], rotated[(i + 1) % rotated.length]))
        expect(gap).toBeCloseTo(VALVE_S.rollerR, 3)
      }
    }
  })

  it('places each valve on the pent roof inside the bore, with its cam above it', () => {
    for (const v of Object.values(VALVES)) {
      expect(Math.abs(v.seat.z) + v.headR).toBeLessThan(BORE_R)
      expect(Math.hypot(v.axis.z, v.axis.y)).toBeCloseTo(1, 12)
      expect(v.axis.z * v.outward.z + v.axis.y * v.outward.y).toBeCloseTo(0, 12)
      expect(camCentre(v.id).y).toBeGreaterThan(DECK_Y + 1)
    }
    // Intake and exhaust heads must not touch each other or the plug well.
    expect(VALVES.intake.seat.z - VALVES.intake.headR).toBeGreaterThan(HEAD.plugWell - 0.02)
    expect(-VALVES.exhaust.seat.z - VALVES.exhaust.headR).toBeGreaterThan(HEAD.plugWell - 0.02)
  })
})

describe('head section', () => {
  it('builds simple (non-self-intersecting) polygons', () => {
    for (const piece of headSectionPieces()) {
      expect(piece.length).toBeGreaterThanOrEqual(3)
      for (let i = 0; i < piece.length; i++)
        for (let j = i + 2; j < piece.length; j++) {
          if (i === 0 && j === piece.length - 1) continue
          expect(segmentsCross(piece[i], piece[(i + 1) % piece.length], piece[j], piece[(j + 1) % piece.length])).toBe(false)
        }
    }
  })

  it('runs each port from its valve throat to the side of the head', () => {
    for (const valve of ['intake', 'exhaust'] as const) {
      const p = portPath(valve)
      expect(dist(p.centre[0], VALVES[valve].seat)).toBeCloseTo(0, 9)
      const last = p.centre[p.centre.length - 1]
      expect(Math.abs(last.z)).toBeCloseTo(HEAD.halfWidth, 6)
      for (const pt of [...p.inner, ...p.outer]) expect(Math.abs(pt.z)).toBeLessThanOrEqual(HEAD.halfWidth + 1e-9)
    }
  })
})

describe('timing belt', () => {
  it('wraps a closed loop around the crank sprocket and both cam pulleys at 2:1', () => {
    expect(TIMING.camPulleyR / TIMING.crankSprocketR).toBe(2)
    const path = timingBeltPath(24)
    for (const centre of [{ z: 0, y: 0 }, camCentre('intake'), camCentre('exhaust')]) {
      const r = centre.y === 0 ? TIMING.crankSprocketR : TIMING.camPulleyR
      const closest = Math.min(...path.map((p) => dist(p, centre)))
      expect(closest).toBeCloseTo(r, 6)
    }
  })

  it('samples the loop by arc length, wrapping in both directions', () => {
    const path = timingBeltPath(24)
    const sampler = loopSampler(path)
    expect(sampler.at(0).point).toEqual(path[0])
    const a = sampler.at(0.37)
    const b = sampler.at(0.37 + sampler.length)
    const c = sampler.at(0.37 - 3 * sampler.length)
    expect(b.point.z).toBeCloseTo(a.point.z, 9)
    expect(c.point.y).toBeCloseTo(a.point.y, 9)
    expect(Math.hypot(a.tangent.z, a.tangent.y)).toBeCloseTo(1, 9)
  })

  it('moves the belt one cam-pulley circumference per 720° cycle, against the path order', () => {
    expect(beltTravel(0)).toBeCloseTo(0, 12)
    expect(Math.abs(beltTravel(720))).toBeCloseTo(2 * Math.PI * TIMING.camPulleyR, 9)
    expect(beltTravel(90)).toBeLessThan(0)
  })
})

describe('conceptual gas colours', () => {
  it('is continuous all round the cycle', () => {
    let prev = gasAppearance(0)
    for (let deg = 0.25; deg <= 720; deg += 0.25) {
      const g = gasAppearance(deg)
      expect(Math.abs(g.opacity - prev.opacity)).toBeLessThan(0.03)
      for (let k = 0; k < 3; k++) expect(Math.abs(g.color[k] - prev.color[k])).toBeLessThan(0.05)
      prev = g
    }
  })

  it('shows fresh charge, combustion and exhaust in the right strokes', () => {
    expect(gasAppearance(200).color).toEqual(GAS_COLOURS.fresh)
    expect(gasAppearance(600).color).toEqual(GAS_COLOURS.burnt)
    expect(gasAppearance(385).glow).toBeGreaterThan(1)
    expect(gasAppearance(300).glow).toBeLessThan(0.3)
    expect(portGasAppearance('intake', 100).opacity).toBeGreaterThan(0.3)
    expect(portGasAppearance('intake', 400).opacity).toBe(0)
    expect(portGasAppearance('exhaust', 620).opacity).toBeGreaterThan(0.3)
    expect(portGasAppearance('exhaust', 300).opacity).toBe(0)
  })
})
