/**
 * Vehicle explorer layout (pure, unit-tested): the car frame, where each
 * original procedural module sits, component bounding boxes for camera
 * framing and hotspots, and the framing maths.
 *
 * CAR FRAME — the Car Concept GLB as shipped: metres, +Y up, front towards +Z,
 * wheels on y = 0, left side of the car towards +X.
 *
 * ASSUMED LAYOUT — front engine, front-wheel drive, engine mounted
 * transversely. Evidence from the model: the fused `Engine` mesh sits under
 * the front clamshell entirely ahead of the front axle (z 1.60…2.33 m, axle at
 * z 1.49 m) and is wider than it is long (1.20 m across × 0.73 m), which is the
 * shape of an engine turned sideways. The model has no gearbox, suspension,
 * steering gear, radiator, battery, exhaust or tank, so those are original
 * procedural modules placed where such a car would normally carry them.
 */

export type Vec3 = [number, number, number]

export interface HubLayout {
  /** Half the distance between left and right hub centres. */
  halfTrack: number
  hubY: number
  frontZ: number
  rearZ: number
}

/** Measured from the Car Concept wheel groups (manifest framing). */
export const CAR_HUBS: HubLayout = { halfTrack: 0.98, hubY: 0.384, frontZ: 1.49, rearZ: -1.31 }
export const WHEEL_RADIUS = 0.38
export const TYRE_WIDTH = 0.28
/** Overall size of the Car Concept (bounding box). */
export const CAR_BOX = { min: [-1.12, 0, -1.94] as Vec3, max: [1.12, 1.15, 2.42] as Vec3 }

export interface HubFit {
  /** Non-uniform scale for a fused body so its hubs land on the target hubs. */
  bodyScale: Vec3
  bodyOffset: Vec3
  /** Uniform wheel scale (keeps wheels round). */
  wheelScale: number
}

/** Fit another car's hubs onto CAR_HUBS (used for the Kenney fallback). */
export function fitToHubs(src: HubLayout, target: HubLayout = CAR_HUBS): HubFit {
  const safe = (n: number) => (Math.abs(n) > 1e-6 ? n : 1)
  const sx = target.halfTrack / safe(src.halfTrack)
  const sy = target.hubY / safe(src.hubY)
  const sz = (target.frontZ - target.rearZ) / safe(src.frontZ - src.rearZ)
  return {
    bodyScale: [sx, sy, sz],
    bodyOffset: [0, 0, target.frontZ - src.frontZ * sz],
    wheelScale: sy,
  }
}

export interface Box {
  min: Vec3
  max: Vec3
}

export const boxCentre = (b: Box): Vec3 => [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2]

export function unionBoxes(boxes: readonly Box[]): Box | null {
  if (!boxes.length) return null
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const b of boxes)
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], b.min[i])
      max[i] = Math.max(max[i], b.max[i])
    }
  return { min, max }
}

/** Mirror a left-side (+X) box to the right side. */
export const mirrorX = (b: Box): Box => ({ min: [-b.max[0], b.min[1], b.min[2]], max: [-b.min[0], b.max[1], b.max[2]] })

export interface Framing {
  position: Vec3
  target: Vec3
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const normalise = (v: Vec3): Vec3 => {
  const len = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / len, v[1] / len, v[2] / len]
}

/**
 * Camera position that frames a box seen from `direction` (target → camera):
 * the closest distance at which all eight corners fit inside both the
 * vertical and the horizontal field of view (times `margin`), so a long car
 * fills a wide canvas and still fits a narrow portrait one.
 */
export function frameBox(box: Box, direction: Vec3, fovDeg: number, aspect: number, margin = 1.15, minDistance = 1.6): Framing {
  const target = boxCentre(box)
  const d = normalise(direction)
  // Camera basis (looking along -d, world +Y up). Straight-down views fall back to +Z as "up".
  const right = normalise(Math.abs(d[1]) > 0.999 ? cross([0, 0, 1], d) : cross([0, 1, 0], d))
  const up = cross(d, right)
  const tanV = Math.tan((fovDeg * Math.PI) / 360)
  const tanH = tanV * Math.max(0.2, aspect)
  let distance = 0
  for (const x of [box.min[0], box.max[0]])
    for (const y of [box.min[1], box.max[1]])
      for (const z of [box.min[2], box.max[2]]) {
        const c: Vec3 = [x - target[0], y - target[1], z - target[2]]
        const depth = dot(c, d)
        distance = Math.max(distance, depth + (margin * Math.abs(dot(c, right))) / tanH, depth + (margin * Math.abs(dot(c, up))) / tanV)
      }
  distance = Math.max(minDistance, distance)
  return { target, position: [target[0] + d[0] * distance, target[1] + d[1] * distance, target[2] + d[2] * distance] }
}
