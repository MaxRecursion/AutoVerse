import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import { cutawayBoundsPoints, fitCutawayBounds, fitCutawayPoints, type Vec3 } from './cutawayFraming'

const subtract = (a: Vec3, b: Vec3): Vec3 => a.map((value, index) => value - b[index]!) as Vec3
const normalize = (v: Vec3): Vec3 => v.map((value) => value / Math.hypot(...v)) as Vec3
const distance = (pose: { position: Vec3; target: Vec3 }) => Math.hypot(...subtract(pose.position, pose.target))

/** Project the actual returned camera, independently of the fitter's corner-distance calculation. */
function projectedCorners(min: Vec3, max: Vec3, aspect: number, direction?: Vec3) {
  const pose = fitCutawayBounds(min, max, aspect, direction)
  return projectedPoints(cutawayBoundsPoints(min, max), pose, aspect)
}

function projectedPoints(points: Vec3[], pose: ReturnType<typeof fitCutawayPoints>, aspect: number) {
  const camera = new PerspectiveCamera(38, Math.max(0.35, aspect), 0.01, 100_000)
  camera.position.set(...pose.position)
  camera.lookAt(...pose.target)
  camera.updateMatrixWorld()
  return points.map((point) => {
    const world = new Vector3(...point)
    const depth = -camera.worldToLocal(world.clone()).z
    const projected = world.project(camera)
    return { depth, x: projected.x, y: projected.y }
  })
}

describe('cutaway bounds framing', () => {
  it.each([16 / 9, 1.2, 0.55, 0.35, 0.1])('fits every near and far corner at aspect %s', (aspect) => {
    const min: Vec3 = [-7.2, -1.2, -4]
    const max: Vec3 = [4.1, 4.3, 4.5]
    for (const direction of [undefined, [1, 0.1, 0.01], [0.05, 0.3, 1], [0.1, 0.995, 0], [0, 1, 0], [0, -1, 0]] as (Vec3 | undefined)[]) {
      for (const corner of projectedCorners(min, max, aspect, direction)) {
        expect(corner.depth).toBeGreaterThan(0)
        expect(Math.abs(corner.x)).toBeLessThan(1)
        expect(Math.abs(corner.y)).toBeLessThan(1)
      }
    }
  })

  it('targets the centre and preserves the requested viewing direction', () => {
    const pose = fitCutawayBounds([-6, -1, -3], [4, 5, 7], 1.6, [2, 1, 3])
    expect(pose.target).toEqual([-1, 2, 2])
    const d = normalize(subtract(pose.position, pose.target))
    const expected = normalize([2, 1, 3])
    d.forEach((value, index) => expect(value).toBeCloseTo(expected[index]!, 12))
  })

  it('moves farther back on a phone and clamps narrower aspect ratios to 0.35', () => {
    const min: Vec3 = [-6, -1, -3]
    const max: Vec3 = [4, 5, 3]
    expect(distance(fitCutawayBounds(min, max, 0.55))).toBeGreaterThan(distance(fitCutawayBounds(min, max, 1.6)))
    expect(fitCutawayBounds(min, max, 0.01)).toEqual(fitCutawayBounds(min, max, 0.35))
  })

  it('keeps a valid camera for degenerate bounds and an invalid direction', () => {
    const pose = fitCutawayBounds([1, 2, 3], [1, 2, 3], 1, [0, 0, 0])
    expect(pose.target).toEqual([1, 2, 3])
    expect(pose.position.every(Number.isFinite)).toBe(true)
    expect(distance(pose)).toBeGreaterThan(0)
  })

  it.each([1.6, 0.55])('fits engine and narrow rear-plume points without phantom bank corners at aspect %s', (aspect) => {
    const engine = cutawayBoundsPoints([-2, -1, -4], [2, 4, 4])
    const plume = cutawayBoundsPoints([-8, -0.5, -0.5], [-3, 1, 0.5])
    const points = [...engine, ...plume]
    const pose = fitCutawayPoints(points, aspect)
    const enclosing = fitCutawayBounds([-8, -1, -4], [2, 4, 4], aspect)
    expect(pose.target).toEqual(enclosing.target)
    expect(distance(pose)).toBeLessThanOrEqual(distance(enclosing))
    // The phantom rear/outer-bank corner controls the portrait fit; desktop is limited by a real engine corner.
    if (aspect < 1) expect(distance(pose)).toBeLessThan(distance(enclosing))
    for (const point of projectedPoints(points, pose, aspect)) {
      expect(point.depth).toBeGreaterThan(0)
      expect(Math.abs(point.x)).toBeLessThan(1)
      expect(Math.abs(point.y)).toBeLessThan(1)
    }
  })

  it('provides eight distinct box corners and a valid empty-cloud view', () => {
    const corners = cutawayBoundsPoints([-1, -2, -3], [4, 5, 6])
    expect(corners).toHaveLength(8)
    expect(new Set(corners.map((point) => point.join(','))).size).toBe(8)
    const pose = fitCutawayPoints([], 1)
    expect(pose.target).toEqual([0, 0, 0])
    expect(pose.position.every(Number.isFinite)).toBe(true)
    expect(distance(pose)).toBeGreaterThan(0)
  })
})
