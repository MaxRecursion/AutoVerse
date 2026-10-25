import { PerspectiveCamera, Vector3 } from 'three'
import { tipRadius, CASE, CLUTCH_GEO, IDLER_CENTRE, LAY_Y, MAIN_Y, OUTPUT_FLANGE, SHAFT, type Vec3 } from './gearboxModel'
import { REVERSE_TRAIN } from './gearbox'
import { EXPLODE, TRANSMISSION_CAMERA, TRANSMISSION_EXPLODED_CAMERA, type CameraFraming } from './transmissionParts'

/**
 * Aspect-aware camera framing (pure; three.js maths only, no renderer).
 *
 * The gearbox is long and low, the scene canvas can be anything from a tall
 * phone panel to a wide desktop pane, and the lab's overlays (cue badge and
 * readouts on top, the control deck along the bottom) cover part of it. A
 * fixed camera is therefore either too close (the model runs under the
 * controls) or too far (a small model in a big canvas). `fitFraming` keeps
 * the view direction and solves for the distance and target that fit the
 * model's bounding box into the canvas area the overlays leave free.
 */

export interface Box3Like {
  min: Vec3
  max: Vec3
}

/** Pixel insets of the canvas covered by overlays. */
export interface Insets {
  top: number
  right: number
  bottom: number
  left: number
}

export interface FitOptions {
  /** Canvas size, CSS pixels. */
  width: number
  height: number
  insets: Insets
  box: Box3Like
  /** View direction: from the target towards the camera (any length). */
  direction: Vec3
  /** Vertical field of view, degrees. */
  fov: number
  minDistance: number
  maxDistance: number
  /** Breathing room around the model, as a fraction of the free area (0..0.4). */
  margin?: number
}

/** Field of view used by the lab's SceneCanvas (degrees). */
export const SCENE_FOV = 38

/** Bounding box of the assembled gearbox and clutch (casing, flywheel, output flange, idler). */
export const ASSEMBLED_BOX: Box3Like = (() => {
  const shell = CASE.radius + CASE.wall
  const idlerTip = IDLER_CENTRE.z + tipRadius(REVERSE_TRAIN.idler)
  return {
    min: [Math.min(CASE.bellFrom, CLUTCH_GEO.flywheelFace - CLUTCH_GEO.flywheelThickness), LAY_Y - shell, -shell],
    max: [Math.max(SHAFT.main.to, OUTPUT_FLANGE.x + OUTPUT_FLANGE.width / 2), MAIN_Y + shell, Math.max(shell, idlerTip)],
  }
})()

/** The assembled box grown by the largest exploded-view offsets in each direction. */
export const EXPLODED_BOX: Box3Like = (() => {
  const offsets = Object.values(EXPLODE)
  const lo = (i: 0 | 1 | 2) => Math.min(0, ...offsets.map((o) => o[i]))
  const hi = (i: 0 | 1 | 2) => Math.max(0, ...offsets.map((o) => o[i]))
  const { min, max } = ASSEMBLED_BOX
  return {
    min: [min[0] + lo(0), min[1] + lo(1), min[2] + lo(2)],
    max: [max[0] + hi(0), max[1] + hi(1), max[2] + hi(2)],
  }
})()

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]

/** Front three-quarter view direction shared by every framing. */
export const VIEW_DIRECTION: Vec3 = sub(TRANSMISSION_CAMERA.position, TRANSMISSION_CAMERA.target)

interface Extent {
  minX: number
  maxX: number
  minY: number
  maxY: number
  /** False if any corner falls outside the clip volume (camera inside or behind the box). */
  valid: boolean
}

function corners(box: Box3Like): Vector3[] {
  const out: Vector3[] = []
  for (const x of [box.min[0], box.max[0]])
    for (const y of [box.min[1], box.max[1]]) for (const z of [box.min[2], box.max[2]]) out.push(new Vector3(x, y, z))
  return out
}

/**
 * Camera position and target that fit `box` into the canvas area left free by
 * `insets`, looking along `direction`. Falls back to `fallback` when the
 * canvas has no measurable size (e.g. before layout, or in jsdom).
 */
export function fitFraming(o: FitOptions, fallback: CameraFraming = TRANSMISSION_CAMERA): CameraFraming {
  if (!(o.width > 0 && o.height > 0)) return fallback
  const aspect = o.width / o.height
  const cam = new PerspectiveCamera(o.fov, aspect, 0.05, 200)
  const dir = new Vector3(...o.direction).normalize()
  const pts = corners(o.box)
  const p = new Vector3()

  // Free window in normalised device coordinates (−1..1), shrunk by the margin.
  const margin = Math.min(0.4, Math.max(0, o.margin ?? 0.08))
  let x0 = -1 + (2 * o.insets.left) / o.width
  let x1 = 1 - (2 * o.insets.right) / o.width
  let y0 = -1 + (2 * o.insets.bottom) / o.height
  let y1 = 1 - (2 * o.insets.top) / o.height
  // Overlays that leave almost nothing free are ignored rather than shrinking the model to a dot.
  if (x1 - x0 < 0.5) [x0, x1] = [-1, 1]
  if (y1 - y0 < 0.5) [y0, y1] = [-1, 1]
  const winW = (x1 - x0) * (1 - margin)
  const winH = (y1 - y0) * (1 - margin)
  const winCx = (x0 + x1) / 2
  const winCy = (y0 + y1) / 2

  const extent = (target: Vector3, distance: number): Extent => {
    cam.position.copy(target).addScaledVector(dir, distance)
    cam.lookAt(target)
    cam.updateMatrixWorld()
    const e: Extent = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, valid: true }
    for (const c of pts) {
      p.copy(c).project(cam)
      if (!(p.z > -1 && p.z < 1)) e.valid = false
      e.minX = Math.min(e.minX, p.x)
      e.maxX = Math.max(e.maxX, p.x)
      e.minY = Math.min(e.minY, p.y)
      e.maxY = Math.max(e.maxY, p.y)
    }
    return e
  }
  const fits = (e: Extent) => e.valid && e.maxX - e.minX <= winW && e.maxY - e.minY <= winH

  const target = new Vector3(
    (o.box.min[0] + o.box.max[0]) / 2,
    (o.box.min[1] + o.box.max[1]) / 2,
    (o.box.min[2] + o.box.max[2]) / 2,
  )
  const right = new Vector3()
  const up = new Vector3()
  const tanHalf = Math.tan(((o.fov / 2) * Math.PI) / 180)
  let distance = o.maxDistance

  // Size, then centre in the free window; the centring shift barely changes the size, so two rounds settle it.
  for (let round = 0; round < 3; round++) {
    let lo = o.minDistance
    let hi = o.maxDistance
    if (fits(extent(target, lo))) hi = lo
    else
      for (let i = 0; i < 32; i++) {
        const mid = (lo + hi) / 2
        if (fits(extent(target, mid))) hi = mid
        else lo = mid
      }
    distance = hi
    const e = extent(target, distance)
    const dx = winCx - (e.minX + e.maxX) / 2
    const dy = winCy - (e.minY + e.maxY) / 2
    right.setFromMatrixColumn(cam.matrixWorld, 0)
    up.setFromMatrixColumn(cam.matrixWorld, 1)
    const halfH = distance * tanHalf
    // Moving the camera (and target) right shifts the model left on screen, hence the minus signs.
    target.addScaledVector(right, -dx * halfH * aspect).addScaledVector(up, -dy * halfH)
  }

  const position = target.clone().addScaledVector(dir, distance)
  const round3 = (v: Vector3): Vec3 => [v.x, v.y, v.z].map((n) => Math.round(n * 1000) / 1000) as Vec3
  return { position: round3(position), target: round3(target) }
}

/** Assembled and exploded framings for one canvas size. */
export interface LabFramings {
  assembled: CameraFraming
  exploded: CameraFraming
}

export const DEFAULT_FRAMINGS: LabFramings = { assembled: TRANSMISSION_CAMERA, exploded: TRANSMISSION_EXPLODED_CAMERA }

/** Camera distance limits shared with the SceneCanvas orbit controls. */
export const DISTANCE = { min: 3, max: 22 } as const

/** Both framings for a canvas of `width` × `height` with the given overlay insets. */
export function labFramings(width: number, height: number, insets: Insets): LabFramings {
  const common = { width, height, insets, direction: VIEW_DIRECTION, fov: SCENE_FOV, minDistance: DISTANCE.min, maxDistance: DISTANCE.max }
  return {
    assembled: fitFraming({ ...common, box: ASSEMBLED_BOX }, TRANSMISSION_CAMERA),
    exploded: fitFraming({ ...common, box: EXPLODED_BOX, margin: 0.04 }, TRANSMISSION_EXPLODED_CAMERA),
  }
}
