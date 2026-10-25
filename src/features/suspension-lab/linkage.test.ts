import { describe, expect, it } from 'vitest'
import {
  DROP_LINK_LENGTH,
  HARDPOINTS,
  KNUCKLE_LENGTH,
  LOWER_ARM_LENGTH,
  TIE_ROD_LENGTH,
  TRAVEL_LIMIT,
  UPPER_ARM_LENGTH,
  circleIntersection,
  circumcentre,
  dist,
  dist3,
  motionRatio,
  rotateAbout,
  solveLinkage,
} from './linkage'

const R = 0.298
const TRAVELS = [-0.1, -0.08, -0.05, -0.02, 0, 0.02, 0.05, 0.08, 0.1]

describe('geometry helpers', () => {
  it('rotates counter-clockwise about a centre', () => {
    const p = rotateAbout({ x: 1, y: 0 }, { x: 0, y: 0 }, Math.PI / 2)
    expect(p.x).toBeCloseTo(0, 12)
    expect(p.y).toBeCloseTo(1, 12)
  })

  it('intersects circles, choosing the solution nearest the hint', () => {
    const up = circleIntersection({ x: 0, y: 0 }, 1, { x: 1, y: 0 }, 1, { x: 0.5, y: 1 })!
    expect(up.x).toBeCloseTo(0.5, 12)
    expect(up.y).toBeCloseTo(Math.sqrt(3) / 2, 12)
    const down = circleIntersection({ x: 0, y: 0 }, 1, { x: 1, y: 0 }, 1, { x: 0.5, y: -1 })!
    expect(down.y).toBeCloseTo(-Math.sqrt(3) / 2, 12)
    expect(circleIntersection({ x: 0, y: 0 }, 1, { x: 5, y: 0 }, 1, { x: 0, y: 0 })).toBeNull()
  })

  it('finds the centre of a circle through three points', () => {
    const c = circumcentre({ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 })!
    expect(c.x).toBeCloseTo(0, 12)
    expect(c.y).toBeCloseTo(0, 12)
    expect(circumcentre({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 })).toBeNull()
  })
})

describe('double-wishbone linkage', () => {
  it('raises the wheel centre by exactly the suspension travel', () => {
    for (const s of TRAVELS) expect(solveLinkage(s, R).wheelCentre.y - R).toBeCloseTo(s, 9)
  })

  it('keeps every arm, the knuckle and the links at their lengths (the ball joints stay on the knuckle)', () => {
    for (const s of TRAVELS) {
      const p = solveLinkage(s, R)
      expect(dist(p.lowerBallJoint, HARDPOINTS.lowerInner)).toBeCloseTo(LOWER_ARM_LENGTH, 9)
      expect(dist(p.upperBallJoint, HARDPOINTS.upperInner)).toBeCloseTo(UPPER_ARM_LENGTH, 9)
      expect(dist(p.upperBallJoint, p.lowerBallJoint)).toBeCloseTo(KNUCKLE_LENGTH, 9)
      expect(dist3(p.dropLinkLower, p.dropLinkUpper)).toBeCloseTo(DROP_LINK_LENGTH, 9)
      // The rack-end joint sits at the centre of the steering-arm path: the tie rod length barely changes.
      expect(Math.abs(dist3(p.tieRodInner, p.tieRodOuter) - TIE_ROD_LENGTH)).toBeLessThan(0.0005)
    }
  })

  it('is static at zero travel', () => {
    const p = solveLinkage(0, R)
    expect(p.lowerArmAngle).toBeCloseTo(0, 9)
    expect(p.upperArmAngle).toBeCloseTo(0, 9)
    expect(p.knuckleAngle).toBeCloseTo(0, 9)
    expect(p.antiRollAngle).toBeCloseTo(0, 9)
    expect(p.lowerBallJoint.x).toBeCloseTo(HARDPOINTS.lowerBallJoint.x, 9)
    expect(p.upperBallJoint.y).toBeCloseTo(HARDPOINTS.upperBallJoint.y, 9)
  })

  it('gains negative camber in bump and positive in droop (short upper arm)', () => {
    expect(UPPER_ARM_LENGTH).toBeLessThan(LOWER_ARM_LENGTH)
    expect(solveLinkage(0.06, R).camberChangeDeg).toBeLessThan(-1)
    expect(solveLinkage(-0.06, R).camberChangeDeg).toBeGreaterThan(1)
    for (let i = 1; i < TRAVELS.length; i++)
      expect(solveLinkage(TRAVELS[i], R).camberChangeDeg).toBeLessThan(solveLinkage(TRAVELS[i - 1], R).camberChangeDeg)
  })

  it('shortens the coil-over steadily in bump with a realistic motion ratio', () => {
    for (let i = 1; i < TRAVELS.length; i++) expect(solveLinkage(TRAVELS[i], R).coiloverLength).toBeLessThan(solveLinkage(TRAVELS[i - 1], R).coiloverLength)
    for (const s of TRAVELS) {
      const mr = motionRatio(s, R)
      expect(mr).toBeGreaterThan(0.45)
      expect(mr).toBeLessThan(0.7)
    }
  })

  it('turns the anti-roll bar arm with the wheel and keeps the track change small', () => {
    expect(solveLinkage(0.05, R).antiRollAngle).toBeGreaterThan(0)
    expect(solveLinkage(-0.05, R).antiRollAngle).toBeLessThan(0)
    for (const s of TRAVELS) expect(Math.abs(solveLinkage(s, R).trackChange)).toBeLessThan(0.02)
  })

  it('clamps travel to the range the hard points are laid out for', () => {
    expect(solveLinkage(1, R).travel).toBe(TRAVEL_LIMIT)
    expect(solveLinkage(-1, R).travel).toBe(-TRAVEL_LIMIT)
    expect(solveLinkage(Number.NaN, R).travel).toBe(0)
  })
})
