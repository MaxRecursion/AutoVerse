/**
 * Where every explorer component sits in the car frame (pure data, unit-
 * tested). Procedural modules are ORIGINAL AutoVerse geometry described as
 * simple shapes; GLB parts are listed with their measured bounding boxes.
 * Boxes drive camera framing; anchors place part names and system hotspots.
 *
 * Packaging (front-engine, transverse, front-wheel drive — see vehicleLayout.ts):
 *  - The Car Concept's placeholder engine fills the whole nose. The explorer
 *    resizes it to ENGINE_BOX (an inline engine's footprint) so the clutch and
 *    transaxle fit at its left-hand (+X) end and the radiator and fan fit
 *    ahead of it, as in a typical transverse front-drive car.
 *  - Final drive on the front axle line just behind the transaxle; unequal-
 *    length driveshafts to the front hubs.
 *  - MacPherson struts at the front, coil-overs with lower wishbones and an
 *    upper link at the rear; steering rack behind the front axle line.
 *  - Battery in the front right (-X) corner, alternator on the engine's right
 *    end, starter on the bellhousing; exhaust leaves the engine's rear face and
 *    runs under the floor to a silencer behind the rear axle; fuel tank ahead
 *    of the rear axle.
 * Positions are plausible, not measured from any real car, and this concept
 * car sits very low, so some modules are drawn tighter than real packaging.
 */
import type { ExplorerSystemId } from './explorerSystems'
import { CAR_HUBS, unionBoxes, type Box, type Vec3 } from './vehicleLayout'

export const ENGINE_BOX: Box = { min: [-0.62, 0.15, 1.64], max: [0.12, 0.72, 2.18] }

export type MaterialKey =
  | 'casting'
  | 'darkCasting'
  | 'steel'
  | 'rubber'
  | 'hose'
  | 'core'
  | 'battery'
  | 'spring'
  | 'damper'
  | 'exhaust'
  | 'catalyst'
  | 'tank'
  | 'pipe'
  | 'copper'
  | 'body'
  | 'glass'
  | 'tyre'
  | 'rim'
  | 'disc'
  | 'caliper'

export type Shape =
  | { kind: 'box'; at: Vec3; size: Vec3; radius?: number; rotation?: Vec3 }
  /** Cylinder (or cone when r2 is set) from one end centre to the other. */
  | { kind: 'cyl'; from: Vec3; to: Vec3; r: number; r2?: number }
  /** Tube along a smooth curve through the points. */
  | { kind: 'tube'; points: Vec3[]; r: number }
  /** Helical coil spring along the from→to axis. */
  | { kind: 'coil'; from: Vec3; to: Vec3; r: number; wire: number; turns: number }
  /** Ring (torus) facing along +Z unless rotated. */
  | { kind: 'ring'; at: Vec3; r: number; tube: number; rotation?: Vec3 }
  /** Electric fan: hub, blades and shroud ring, axis along Z. */
  | { kind: 'fan'; at: Vec3; r: number }

export interface ShapeSpec {
  shape: Shape
  material: MaterialKey
}

const mx = (v: Vec3): Vec3 => [-v[0], v[1], v[2]]

export function mirrorShape(s: Shape): Shape {
  switch (s.kind) {
    case 'box':
      return { ...s, at: mx(s.at), rotation: s.rotation ? [s.rotation[0], -s.rotation[1], -s.rotation[2]] : undefined }
    case 'cyl':
      return { ...s, from: mx(s.from), to: mx(s.to) }
    case 'tube':
      return { ...s, points: s.points.map(mx) }
    case 'coil':
      return { ...s, from: mx(s.from), to: mx(s.to) }
    case 'ring':
      return { ...s, at: mx(s.at), rotation: s.rotation ? [s.rotation[0], -s.rotation[1], -s.rotation[2]] : undefined }
    case 'fan':
      return { ...s, at: mx(s.at) }
  }
}

/** A left-side (+X) shape and its mirror image on the right. */
const pair = (shape: Shape, material: MaterialKey): ShapeSpec[] => [
  { shape, material },
  { shape: mirrorShape(shape), material },
]
const one = (shape: Shape, material: MaterialKey): ShapeSpec[] => [{ shape, material }]

/** Conservative axis-aligned bounds of a shape (rotations ignored except for their extent). */
export function shapeBounds(s: Shape): Box {
  const grow = (pts: Vec3[], pad: number): Box => {
    const b = unionBoxes(pts.map((p) => ({ min: p, max: p })))!
    return { min: [b.min[0] - pad, b.min[1] - pad, b.min[2] - pad], max: [b.max[0] + pad, b.max[1] + pad, b.max[2] + pad] }
  }
  switch (s.kind) {
    case 'box': {
      // Rotated boxes: use the half-diagonal on every axis (safe over-estimate).
      const half = s.rotation ? Math.hypot(...s.size) / 2 : 0
      const h: Vec3 = s.rotation ? [half, half, half] : [s.size[0] / 2, s.size[1] / 2, s.size[2] / 2]
      return { min: [s.at[0] - h[0], s.at[1] - h[1], s.at[2] - h[2]], max: [s.at[0] + h[0], s.at[1] + h[1], s.at[2] + h[2]] }
    }
    case 'cyl':
      return grow([s.from, s.to], Math.max(s.r, s.r2 ?? 0))
    case 'tube':
      return grow(s.points, s.r)
    case 'coil':
      return grow([s.from, s.to], s.r + s.wire)
    case 'ring':
      return grow([s.at], s.r + s.tube)
    case 'fan':
      return { min: [s.at[0] - s.r, s.at[1] - s.r, s.at[2] - 0.04], max: [s.at[0] + s.r, s.at[1] + s.r, s.at[2] + 0.04] }
  }
}

const { frontZ: FZ, rearZ: RZ, hubY: HY } = CAR_HUBS

/* ------------------------------------------------------------------------ */
/* Original procedural modules                                               */
/* ------------------------------------------------------------------------ */

const CRANK: [number, number] = [0.3, 1.9] // y, z of the crank axis
const MC_FRONT: Vec3 = [0.2, 0.58, 1.75]

export const PROCEDURAL_SHAPES: Readonly<Record<string, readonly ShapeSpec[]>> = {
  /* Drivetrain */
  'clutch-bellhousing': one({ kind: 'cyl', from: [0.12, CRANK[0], CRANK[1]], to: [0.27, CRANK[0], CRANK[1]], r: 0.185, r2: 0.15 }, 'casting'),
  transaxle: [
    ...one({ kind: 'cyl', from: [0.27, 0.32, 1.86], to: [0.6, 0.32, 1.86], r: 0.135, r2: 0.11 }, 'casting'),
    ...one({ kind: 'box', at: [0.44, 0.33, 1.7], size: [0.3, 0.24, 0.36], radius: 0.06 }, 'casting'),
    // Gear-lever cables to the cabin
    ...one({ kind: 'tube', points: [[0.42, 0.46, 1.7], [0.3, 0.55, 1.55], [0.12, 0.5, 1.3]], r: 0.009 }, 'rubber'),
  ],
  'final-drive': one({ kind: 'cyl', from: [0.3, HY, FZ], to: [0.54, HY, FZ], r: 0.115 }, 'darkCasting'),
  driveshafts: [
    // Long right-hand shaft (passes behind the engine) and short left-hand shaft
    ...one({ kind: 'cyl', from: [0.3, HY, FZ], to: [-0.78, HY, FZ], r: 0.022 }, 'steel'),
    ...one({ kind: 'cyl', from: [0.54, HY, FZ], to: [0.78, HY, FZ], r: 0.022 }, 'steel'),
    // Constant-velocity joint boots, inner and outer
    ...one({ kind: 'cyl', from: [0.26, HY, FZ], to: [0.18, HY, FZ], r: 0.06, r2: 0.03 }, 'rubber'),
    ...one({ kind: 'cyl', from: [-0.62, HY, FZ], to: [-0.76, HY, FZ], r: 0.03, r2: 0.065 }, 'rubber'),
    ...one({ kind: 'cyl', from: [0.58, HY, FZ], to: [0.64, HY, FZ], r: 0.06, r2: 0.03 }, 'rubber'),
    ...one({ kind: 'cyl', from: [0.66, HY, FZ], to: [0.78, HY, FZ], r: 0.03, r2: 0.065 }, 'rubber'),
  ],

  /* Engine & fuel */
  'fuel-tank': [
    ...one({ kind: 'box', at: [0, 0.3, -0.82], size: [1.16, 0.24, 0.38], radius: 0.07 }, 'tank'),
    // Filler neck to the right rear quarter, and the feed line to the engine
    ...one({ kind: 'tube', points: [[-0.5, 0.36, -0.9], [-0.8, 0.55, -0.95], [-1.0, 0.72, -0.98]], r: 0.03 }, 'tank'),
    ...one({ kind: 'tube', points: [[0.3, 0.2, -0.62], [0.36, 0.11, -0.3], [0.36, 0.11, 1.1], [0.05, 0.3, 1.6]], r: 0.008 }, 'pipe'),
  ],

  /* Brakes */
  'servo-and-master-cylinder': [
    ...one({ kind: 'cyl', from: [0.2, 0.56, 1.5], to: [0.2, 0.56, 1.63], r: 0.1 }, 'darkCasting'),
    ...one({ kind: 'cyl', from: [0.2, 0.58, 1.63], to: MC_FRONT, r: 0.035 }, 'casting'),
    ...one({ kind: 'box', at: [0.2, 0.65, 1.69], size: [0.08, 0.05, 0.08], radius: 0.015 }, 'tank'),
    // Pushrod from the pedal
    ...one({ kind: 'cyl', from: [0.08, 0.36, 1.56], to: [0.2, 0.52, 1.5], r: 0.008 }, 'steel'),
  ],
  'brake-pipes': [
    ...one({ kind: 'tube', points: [MC_FRONT, [0.45, 0.56, 1.72], [0.72, 0.55, 1.52], [0.93, 0.52, 1.4]], r: 0.007 }, 'pipe'),
    ...one({ kind: 'tube', points: [[0.2, 0.6, 1.66], [-0.1, 0.76, 1.6], [-0.55, 0.62, 1.58], [-0.9, 0.53, 1.46]], r: 0.007 }, 'pipe'),
    ...one(
      { kind: 'tube', points: [[0.2, 0.52, 1.66], [0.3, 0.16, 1.32], [0.62, 0.12, 0.4], [0.66, 0.12, -0.9], [0.78, 0.18, -1.22], [0.93, 0.24, -1.3]], r: 0.007 },
      'pipe',
    ),
    ...one({ kind: 'tube', points: [[0.66, 0.12, -0.9], [0.2, 0.12, -1.12], [-0.6, 0.15, -1.3], [-0.93, 0.28, -1.42]], r: 0.007 }, 'pipe'),
  ],

  /* Suspension */
  'coil-springs': [
    ...pair({ kind: 'coil', from: [0.785, 0.62, FZ], to: [0.75, 0.84, FZ], r: 0.075, wire: 0.011, turns: 5 }, 'spring'),
    ...pair({ kind: 'coil', from: [0.785, 0.48, RZ - 0.11], to: [0.74, 0.76, RZ - 0.1], r: 0.07, wire: 0.011, turns: 6 }, 'spring'),
  ],
  dampers: [
    ...pair({ kind: 'cyl', from: [0.8, 0.5, FZ], to: [0.775, 0.7, FZ], r: 0.032 }, 'damper'),
    ...pair({ kind: 'cyl', from: [0.775, 0.7, FZ], to: [0.75, 0.87, FZ], r: 0.012 }, 'steel'),
    ...pair({ kind: 'cyl', from: [0.8, 0.22, RZ - 0.11], to: [0.78, 0.55, RZ - 0.11], r: 0.03 }, 'damper'),
    ...pair({ kind: 'cyl', from: [0.78, 0.55, RZ - 0.11], to: [0.74, 0.79, RZ - 0.1], r: 0.011 }, 'steel'),
  ],
  'control-arms': [
    // Front lower wishbones (two links each)
    ...pair({ kind: 'cyl', from: [0.86, 0.17, FZ], to: [0.4, 0.17, FZ + 0.1], r: 0.02 }, 'darkCasting'),
    ...pair({ kind: 'cyl', from: [0.86, 0.17, FZ], to: [0.4, 0.17, FZ - 0.16], r: 0.02 }, 'darkCasting'),
    // Rear lower wishbones and upper links
    ...pair({ kind: 'cyl', from: [0.86, 0.17, RZ], to: [0.42, 0.17, RZ + 0.14], r: 0.02 }, 'darkCasting'),
    ...pair({ kind: 'cyl', from: [0.86, 0.17, RZ], to: [0.42, 0.17, RZ - 0.15], r: 0.02 }, 'darkCasting'),
    ...pair({ kind: 'cyl', from: [0.82, 0.6, RZ + 0.02], to: [0.5, 0.62, RZ + 0.02], r: 0.016 }, 'darkCasting'),
  ],

  /* Steering */
  'steering-column': one({ kind: 'cyl', from: [0, 0.5, 1.52], to: [0.0, 0.31, 1.33], r: 0.016 }, 'steel'),
  'steering-gear': [
    ...one({ kind: 'cyl', from: [-0.55, 0.28, 1.3], to: [0.55, 0.28, 1.3], r: 0.03 }, 'casting'),
    ...one({ kind: 'cyl', from: [0, 0.27, 1.3], to: [0, 0.34, 1.34], r: 0.045 }, 'darkCasting'),
    ...pair({ kind: 'cyl', from: [0.5, 0.28, 1.3], to: [0.6, 0.28, 1.3], r: 0.04, r2: 0.022 }, 'rubber'),
  ],
  'tie-rods': pair({ kind: 'cyl', from: [0.6, 0.28, 1.3], to: [0.83, 0.31, 1.33], r: 0.012 }, 'steel'),

  /* Electrical */
  battery: [
    ...one({ kind: 'box', at: [-0.78, 0.3, 2.12], size: [0.24, 0.19, 0.17], radius: 0.015 }, 'battery'),
    ...one({ kind: 'cyl', from: [-0.72, 0.395, 2.08], to: [-0.72, 0.42, 2.08], r: 0.014 }, 'copper'),
    ...one({ kind: 'cyl', from: [-0.84, 0.395, 2.08], to: [-0.84, 0.42, 2.08], r: 0.014 }, 'steel'),
  ],
  alternator: [
    ...one({ kind: 'cyl', from: [-0.64, 0.55, 1.95], to: [-0.78, 0.55, 1.95], r: 0.07 }, 'casting'),
    ...one({ kind: 'cyl', from: [-0.62, 0.55, 1.95], to: [-0.645, 0.55, 1.95], r: 0.035 }, 'steel'),
    // Drive belt from the crank pulley
    ...one({ kind: 'tube', points: [[-0.635, 0.55, 1.915], [-0.635, CRANK[0], CRANK[1] - 0.07]], r: 0.007 }, 'rubber'),
    ...one({ kind: 'tube', points: [[-0.635, 0.55, 1.985], [-0.635, CRANK[0], CRANK[1] + 0.07]], r: 0.007 }, 'rubber'),
    ...one({ kind: 'cyl', from: [-0.62, CRANK[0], CRANK[1]], to: [-0.65, CRANK[0], CRANK[1]], r: 0.075 }, 'steel'),
  ],
  'starter-motor': [
    ...one({ kind: 'cyl', from: [0.13, 0.21, 2.13], to: [0.32, 0.21, 2.13], r: 0.05 }, 'darkCasting'),
    ...one({ kind: 'cyl', from: [0.2, 0.27, 2.13], to: [0.29, 0.27, 2.13], r: 0.025 }, 'casting'),
  ],
  'battery-cables': [
    ...one({ kind: 'tube', points: [[-0.72, 0.42, 2.08], [-0.6, 0.3, 2.22], [-0.2, 0.2, 2.23], [0.12, 0.2, 2.22], [0.22, 0.27, 2.15]], r: 0.011 }, 'hose'),
    ...one({ kind: 'tube', points: [[-0.72, 0.42, 2.08], [-0.72, 0.5, 2.02], [-0.72, 0.56, 1.98]], r: 0.009 }, 'hose'),
    ...one({ kind: 'tube', points: [[-0.84, 0.42, 2.08], [-0.92, 0.45, 2.02], [-0.98, 0.38, 1.98]], r: 0.009 }, 'rubber'),
  ],

  /* Cooling */
  radiator: [
    ...one({ kind: 'box', at: [0, 0.43, 2.335], size: [0.9, 0.3, 0.045] }, 'core'),
    ...one({ kind: 'box', at: [0.47, 0.43, 2.335], size: [0.05, 0.34, 0.06], radius: 0.01 }, 'darkCasting'),
    ...one({ kind: 'box', at: [-0.47, 0.43, 2.335], size: [0.05, 0.34, 0.06], radius: 0.01 }, 'darkCasting'),
  ],
  'radiator-fan': one({ kind: 'fan', at: [0, 0.43, 2.26], r: 0.14 }, 'darkCasting'),
  'coolant-hoses': [
    ...one({ kind: 'tube', points: [[-0.47, 0.56, 2.33], [-0.42, 0.62, 2.26], [-0.32, 0.64, 2.2], [-0.3, 0.62, 2.16]], r: 0.022 }, 'hose'),
    ...one({ kind: 'tube', points: [[0.47, 0.29, 2.33], [0.4, 0.24, 2.27], [0.22, 0.24, 2.22], [0.06, 0.3, 2.17]], r: 0.022 }, 'hose'),
    // Heater hoses to the bulkhead
    ...one({ kind: 'tube', points: [[-0.35, 0.6, 1.66], [-0.36, 0.64, 1.58], [-0.36, 0.62, 1.48]], r: 0.012 }, 'hose'),
    ...one({ kind: 'tube', points: [[-0.25, 0.6, 1.66], [-0.26, 0.64, 1.58], [-0.26, 0.62, 1.48]], r: 0.012 }, 'hose'),
  ],

  /* Exhaust */
  'exhaust-manifold': [
    ...[-0.52, -0.38, -0.24, -0.1].map((x): ShapeSpec => ({
      shape: { kind: 'tube', points: [[x, 0.56, 1.645], [x * 0.7 - 0.09, 0.52, 1.6], [-0.3, 0.44, 1.575]], r: 0.022 },
      material: 'exhaust',
    })),
    ...one({ kind: 'cyl', from: [-0.3, 0.46, 1.575], to: [-0.3, 0.3, 1.575], r: 0.035 }, 'exhaust'),
  ],
  'catalytic-converter': one({ kind: 'cyl', from: [-0.25, 0.17, 1.44], to: [-0.18, 0.15, 1.08], r: 0.065, r2: 0.065 }, 'catalyst'),
  'exhaust-pipework': [
    ...one({ kind: 'tube', points: [[-0.3, 0.3, 1.575], [-0.29, 0.2, 1.52], [-0.25, 0.17, 1.44]], r: 0.03 }, 'exhaust'),
    ...one({ kind: 'tube', points: [[-0.18, 0.15, 1.08], [-0.13, 0.12, 0.8], [-0.12, 0.12, -0.6], [-0.15, 0.13, -1.45], [-0.2, 0.2, -1.62]], r: 0.026 }, 'exhaust'),
    ...one({ kind: 'tube', points: [[-0.34, 0.24, -1.8], [-0.35, 0.24, -1.88], [-0.35, 0.23, -1.93]], r: 0.034 }, 'exhaust'),
  ],
  'rear-silencer': one({ kind: 'box', at: [-0.1, 0.25, -1.71], size: [0.8, 0.17, 0.24], radius: 0.07 }, 'exhaust'),
}

/** Procedural stand-ins for parts the fallback models lack (same positions as the Car Concept parts). */
const WHEELS: Vec3[] = [
  [CAR_HUBS.halfTrack, HY, FZ],
  [-CAR_HUBS.halfTrack, HY, FZ],
  [CAR_HUBS.halfTrack, HY, RZ],
  [-CAR_HUBS.halfTrack, HY, RZ],
]
const side = (x: number) => Math.sign(x)

export const SUBSTITUTE_SHAPES: Readonly<Record<string, readonly ShapeSpec[]>> = {
  'engine-unit': one(
    {
      kind: 'box',
      at: [(ENGINE_BOX.min[0] + ENGINE_BOX.max[0]) / 2, (ENGINE_BOX.min[1] + ENGINE_BOX.max[1]) / 2, (ENGINE_BOX.min[2] + ENGINE_BOX.max[2]) / 2],
      size: [ENGINE_BOX.max[0] - ENGINE_BOX.min[0], ENGINE_BOX.max[1] - ENGINE_BOX.min[1], ENGINE_BOX.max[2] - ENGINE_BOX.min[2]],
      radius: 0.05,
    },
    'darkCasting',
  ),
  'brake-discs': WHEELS.map((w) => ({
    shape: { kind: 'cyl', from: [w[0] - side(w[0]) * 0.07, w[1], w[2]], to: [w[0] - side(w[0]) * 0.045, w[1], w[2]], r: 0.25 },
    material: 'disc',
  })),
  'brake-calipers': WHEELS.map((w) => ({
    shape: { kind: 'box', at: [w[0] - side(w[0]) * 0.06, w[1] + 0.2, w[2] - 0.06], size: [0.07, 0.1, 0.18], radius: 0.02 },
    material: 'caliper',
  })),
  'steering-wheel': one({ kind: 'ring', at: [0, 0.65, 0.96], r: 0.16, tube: 0.018, rotation: [-0.35, 0, 0] }, 'rubber'),
  'rear-stub-axles': pair({ kind: 'cyl', from: [0.76, HY, RZ], to: [1.0, HY, RZ], r: 0.04 }, 'steel'),
  'body-shell': [
    ...one({ kind: 'box', at: [0, 0.38, 0.24], size: [1.94, 0.46, 4.28], radius: 0.18 }, 'body'),
    ...one({ kind: 'box', at: [0, 0.8, -0.1], size: [1.5, 0.42, 2.0], radius: 0.18 }, 'body'),
  ],
  windscreen: one({ kind: 'box', at: [0, 0.86, 0.95], size: [1.36, 0.03, 0.5], rotation: [0.62, 0, 0] }, 'glass'),
  'road-wheels': WHEELS.map((w) => ({
    shape: { kind: 'cyl', from: [w[0] - side(w[0]) * 0.1, w[1], w[2]], to: [w[0] + side(w[0]) * 0.12, w[1], w[2]], r: 0.25 },
    material: 'rim',
  })),
  tyres: WHEELS.map((w) => ({
    shape: { kind: 'ring', at: [w[0] + side(w[0]) * 0.01, w[1], w[2]], r: 0.3, tube: 0.085, rotation: [0, Math.PI / 2, 0] },
    material: 'tyre',
  })),
}

/* ------------------------------------------------------------------------ */
/* Bounding boxes (framing) and anchors (labels, hotspots)                   */
/* ------------------------------------------------------------------------ */

const wheelBox = (x: number, z: number, halfWidth = 0.15, r = 0.39): Box => ({
  min: [x - halfWidth, HY - r, z - r],
  max: [x + halfWidth, HY + r, z + r],
})
const allWheels = (halfWidth?: number, r?: number) =>
  unionBoxes(WHEELS.map((w) => wheelBox(w[0], w[2], halfWidth, r)))!

/** Measured Car Concept parts (world boxes from the optimised GLB). */
export const GLB_BOXES: Readonly<Record<string, Box>> = {
  'body-shell': { min: [-1.11, 0.09, -1.94], max: [1.11, 1.15, 2.4] },
  windscreen: { min: [-0.88, 0.76, 0.07], max: [0.88, 1.13, 1.72] },
  'front-clamshell': { min: [-1.11, 0.13, 1.17], max: [1.11, 0.88, 2.42] },
  'rear-clamshell': { min: [-1.12, 0.19, -1.94], max: [1.12, 1.14, -0.43] },
  'side-doors': { min: [-1.17, 0.16, -0.68], max: [1.17, 1.11, 0.99] },
  'cabin-interior': { min: [-1.1, 0.09, -1.4], max: [1.1, 1.11, 1.81] },
  'engine-unit': ENGINE_BOX,
  'accelerator-pedal': { min: [-0.11, 0.13, 1.46], max: [-0.04, 0.44, 1.64] },
  'footbrake-pedal': { min: [0, 0.19, 1.47], max: [0.16, 0.44, 1.65] },
  'steering-wheel': { min: [-0.2, 0.48, 0.86], max: [0.2, 0.82, 1.21] },
  'steering-column': { min: [-0.13, 0.36, 1.15], max: [0.13, 0.68, 1.66] },
  'road-wheels': allWheels(0.15, 0.39),
  tyres: allWheels(0.15, 0.39),
  'brake-discs': allWheels(0.08, 0.28),
  'brake-calipers': allWheels(0.1, 0.3),
  driveshafts: { min: [-1.05, 0.29, 1.39], max: [1.05, 0.48, 1.59] },
  'rear-stub-axles': { min: [-1.05, 0.29, -1.41], max: [1.05, 0.48, -1.21] },
}

/** Bounds of each component: GLB box and/or procedural shapes. */
export function componentBox(id: string): Box | null {
  const boxes: Box[] = []
  const glb = GLB_BOXES[id]
  if (glb) boxes.push(glb)
  for (const s of PROCEDURAL_SHAPES[id] ?? []) boxes.push(shapeBounds(s.shape))
  if (!boxes.length) for (const s of SUBSTITUTE_SHAPES[id] ?? []) boxes.push(shapeBounds(s.shape))
  return unionBoxes(boxes)
}

/** Components with one instance per wheel are framed on the front-left corner. */
const FRONT_LEFT_CORNER: Box = { min: [0.55, 0, 1.0], max: [1.15, 0.9, 1.95] }
const REAR_LEFT_CORNER: Box = { min: [0.4, 0, -1.8], max: [1.15, 0.85, -0.85] }
export const FOCUS_BOX_OVERRIDES: Readonly<Record<string, Box>> = {
  'road-wheels': FRONT_LEFT_CORNER,
  tyres: FRONT_LEFT_CORNER,
  'brake-discs': FRONT_LEFT_CORNER,
  'brake-calipers': FRONT_LEFT_CORNER,
  'coil-springs': FRONT_LEFT_CORNER,
  dampers: FRONT_LEFT_CORNER,
  'control-arms': FRONT_LEFT_CORNER,
  'tie-rods': { min: [0.3, 0.1, 1.1], max: [1.0, 0.5, 1.6] },
  'rear-stub-axles': REAR_LEFT_CORNER,
  'side-doors': { min: [0.7, 0.1, -0.7], max: [1.2, 1.15, 1.0] },
}

export const componentFocusBox = (id: string): Box | null => FOCUS_BOX_OVERRIDES[id] ?? componentBox(id)

/** Label anchors: explicit for multi-instance parts, otherwise just above the part. */
const EXPLICIT_ANCHORS: Readonly<Record<string, Vec3>> = {
  'road-wheels': [1.16, 0.62, FZ - 0.18],
  tyres: [1.16, 0.12, FZ + 0.28],
  'brake-discs': [1.1, 0.06, FZ + 0.3],
  'brake-calipers': [1.05, 0.82, FZ - 0.12],
  'footbrake-pedal': [0, 0.58, 1.38],
  'servo-and-master-cylinder': [0.2, 0.86, 1.62],
  'coil-springs': [0.86, 0.9, FZ],
  dampers: [0.86, 0.72, RZ - 0.11],
  'control-arms': [0.6, 0.09, FZ - 0.25],
  driveshafts: [-0.4, 0.46, FZ],
  'rear-stub-axles': [0.9, 0.5, RZ],
  'tie-rods': [0.72, 0.4, 1.3],
  'brake-pipes': [0.66, 0.24, -0.4],
  'side-doors': [1.2, 0.8, 0.3],
  'body-shell': [0, 1.22, -0.1],
  'cabin-interior': [0.4, 1.0, -0.2],
  'front-clamshell': [0, 0.95, 2.0],
  'rear-clamshell': [0, 1.2, -1.3],
  windscreen: [0, 1.17, 0.5],
  'engine-unit': [-0.25, 0.8, 1.9],
  'fuel-tank': [0.3, 0.5, -0.82],
  'exhaust-pipework': [-0.12, 0.22, -0.3],
  'rear-silencer': [-0.1, 0.42, -1.71],
}

export function labelAnchor(id: string): Vec3 | undefined {
  if (EXPLICIT_ANCHORS[id]) return EXPLICIT_ANCHORS[id]
  const b = componentBox(id)
  if (!b) return undefined
  return [(b.min[0] + b.max[0]) / 2, b.max[1] + 0.06, (b.min[2] + b.max[2]) / 2]
}

/** System hotspot positions (just above or beside each system, readable from the default view). */
export const SYSTEM_HOTSPOTS: Readonly<Record<ExplorerSystemId, Vec3>> = {
  body: [0.2, 1.42, -0.35],
  engine: [-0.25, 1.2, 1.95],
  drivetrain: [0.55, 0.5, 1.62],
  braking: [1.22, 0.78, FZ + 0.05],
  suspension: [1.12, 0.98, RZ],
  steering: [0, 1.24, 0.85],
  electrical: [-0.8, 0.78, 2.12],
  cooling: [0.1, 0.4, 2.5],
  exhaust: [-0.15, 0.42, -1.86],
}
