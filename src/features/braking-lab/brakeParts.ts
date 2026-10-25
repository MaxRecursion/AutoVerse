/**
 * Disc-brake laboratory — scene layout (pure numbers, no three.js).
 *
 * Scene units: 1 unit = 0.2 m (the 0.31 m tyre radius is 1.55 units).
 * World frame: the wheel centre is the origin, the axle is the X axis
 * (outboard = +X, towards the car = −X), up is +Y and the car drives
 * towards −Z. The brake sits on the inboard side, facing the camera.
 *
 * The pedal, servo, master cylinder and ABS modulator are a SCHEMATIC laid
 * out in a vertical plane beside the wheel (in a car they are far away under
 * the dash and in the engine bay), joined to the caliper by one brake line.
 */
import { BRAKE_SPEC } from './braking'

export type Vec3 = [number, number, number]

/** Scene units per metre. */
export const UNITS_PER_M = 1 / 0.2

export const BRAKE_PART_IDS = [
  'brake-pedal',
  'brake-servo',
  'master-cylinder',
  'abs-modulator',
  'brake-line',
  'brake-caliper',
  'caliper-piston',
  'inner-brake-pad',
  'outer-brake-pad',
  'brake-disc',
  'hub-flange',
  'wheel-speed-sensor',
  'braked-wheel',
] as const

export type BrakePartId = (typeof BRAKE_PART_IDS)[number]

/* ------------------------------------------------------------------ */
/* Wheel, hub and disc (world X positions and radii)                    */
/* ------------------------------------------------------------------ */

export const TYRE = {
  radius: BRAKE_SPEC.tyreRadiusM * UNITS_PER_M,
  /** Bead seat (rim) radius. */
  beadRadius: 1.0,
  width: 0.98,
  /** Wheel centre plane. */
  x: 0.36,
} as const

export const RIM = { radius: 0.97, inboardX: -0.1, outboardX: 0.82, faceX: 0.47, faceThickness: 0.06 } as const

export const HUB = { flangeX: 0.37, flangeHalf: 0.03, flangeRadius: 0.33, studRadius: 0.21, knuckleRadius: 0.17, knuckleInboardX: -0.7 } as const

export const DISC = {
  /** Mid-plane of the friction ring. */
  x: 0.12,
  halfThickness: 0.07,
  innerRadius: 0.42,
  outerRadius: BRAKE_SPEC.effectiveRadiusM * UNITS_PER_M + 0.15,
  /** Each friction plate of the ventilated disc. */
  plate: 0.045,
} as const

/** Inboard and outboard friction faces of the disc. */
export const DISC_FACE = { inboard: DISC.x - DISC.halfThickness, outboard: DISC.x + DISC.halfThickness } as const

/* ------------------------------------------------------------------ */
/* Caliper frame                                                        */
/* ------------------------------------------------------------------ */

/** Caliper position: 30° above the forward (−Z) horizontal. */
export const CALIPER_ANGLE_DEG = 30
/**
 * The caliper is modelled in a local frame whose +Y is the radial direction
 * through the caliper centre (X stays the axle). Rotating that frame about X
 * by this angle places it on the disc.
 */
export const CALIPER_FRAME_ROT_X = -((90 - CALIPER_ANGLE_DEG) * Math.PI) / 180

/** Pad running clearance, drawn about 200× real size (real clearance is a fraction of a millimetre). */
export const PAD_GAP = 0.045

export const CALIPER = {
  /** Radius of the caliper piston / pad centre. */
  centreRadius: 0.6,
  pistonRadius: (BRAKE_SPEC.caliperBoreMm / 2000) * UNITS_PER_M,
  housingRadius: 0.2,
  /** Inboard end of the cylinder housing. */
  housingBackX: DISC_FACE.inboard - PAD_GAP - 0.05 - 0.02 - 0.24,
  padInnerRadius: 0.47,
  padOuterRadius: 0.74,
  /** Half the pad's arc, degrees. */
  padHalfAngleDeg: 21,
  frictionThickness: 0.05,
  backingThickness: 0.02,
  bridgeInnerRadius: 0.79,
  bridgeOuterRadius: 0.9,
  /** Half the bridge's tangential width — shorter than the pads so their ends show. */
  bridgeHalfWidth: 0.17,
  fingerThickness: 0.08,
} as const

/** Rest (unclamped) X positions of the pad stack, outboard faces first. */
export const PAD_STACK = (() => {
  const innerFriction = DISC_FACE.inboard - PAD_GAP
  const innerBacking = innerFriction - CALIPER.frictionThickness
  const pistonFace = innerBacking - CALIPER.backingThickness
  const outerFriction = DISC_FACE.outboard + PAD_GAP
  const outerBacking = outerFriction + CALIPER.frictionThickness
  const fingerFace = outerBacking + CALIPER.backingThickness
  return { innerFriction, innerBacking, pistonFace, outerFriction, outerBacking, fingerFace }
})()

export const PISTON_LENGTH = 0.2

/** Point in the caliper frame → world. */
export function caliperToWorld([x, y, z]: Vec3): Vec3 {
  const c = Math.cos(CALIPER_FRAME_ROT_X)
  const s = Math.sin(CALIPER_FRAME_ROT_X)
  return [x, y * c - z * s, y * s + z * c]
}

/** Where the brake line enters the caliper (back of the cylinder housing), caliper frame. */
export const CALIPER_INLET: Vec3 = [CALIPER.housingBackX - 0.03, CALIPER.centreRadius + 0.1, 0]

/* ------------------------------------------------------------------ */
/* Wheel-speed sensor (ABS)                                             */
/* ------------------------------------------------------------------ */

export const TONE_RING = { x: -0.06, innerRadius: 0.22, outerRadius: 0.27, halfWidth: 0.03, teeth: 32 } as const
/** Sensor sits above and behind the axle, aimed at the tone ring. */
export const SENSOR_ANGLE_DEG = 115
export const SENSOR = { x: TONE_RING.x, tipRadius: TONE_RING.outerRadius + 0.025, length: 0.24, radius: 0.035 } as const

/** Point at `radius` on the sensor's radial line (world), measured from +Y towards −Z… */
export function sensorPoint(radius: number, x: number = SENSOR.x): Vec3 {
  const a = (SENSOR_ANGLE_DEG * Math.PI) / 180
  // Angle from the forward horizontal (−Z) upwards; 115° is up and slightly rearwards.
  return [x, radius * Math.sin(a), -radius * Math.cos(a)]
}

/* ------------------------------------------------------------------ */
/* Hydraulic schematic (pedal → servo → master cylinder → ABS)          */
/* ------------------------------------------------------------------ */

/** Schematic plane: local +X runs pedal → master cylinder → ABS, local +Z faces the camera. */
export const SCHEMATIC = {
  position: [-2.45, -0.1, -1.95] as Vec3,
  /** Rotation about world Y. */
  rotY: (-44 * Math.PI) / 180,
} as const

/** Pedal arm: pivot at the top, foot pad 1 unit below; the pushrod pin sits 1/ratio of the way down. */
export const PEDAL = {
  pivot: [0, 1.25] as const,
  length: 1.0,
  pushrodPin: 1.0 / BRAKE_SPEC.pedalRatio,
  /** Arm swing at full pedal travel. */
  maxAngleDeg: 20,
} as const

/** Height of the pushrod / servo / master cylinder axis in the schematic plane. */
export const AXIS_Y = PEDAL.pivot[1] - PEDAL.pushrodPin

export const SERVO = { x0: 0.42, x1: 0.78, radius: 0.34 } as const
export const MASTER = { x0: 0.78, x1: 1.42, radius: 0.12, pistonRadius: 0.095, pistonLength: 0.16, outletX: 1.42 } as const
export const ABS_UNIT = { x: 1.9, width: 0.38, height: 0.34, depth: 0.3 } as const

/** Pushrod travel at full pedal (geometric: pin radius × sin(max angle)). */
export const PUSHROD_TRAVEL = PEDAL.pushrodPin * Math.sin((PEDAL.maxAngleDeg * Math.PI) / 180)

/** Schematic-plane point → world. */
export function schematicToWorld([x, y, z]: Vec3): Vec3 {
  const c = Math.cos(SCHEMATIC.rotY)
  const s = Math.sin(SCHEMATIC.rotY)
  const [px, py, pz] = SCHEMATIC.position
  return [px + x * c + z * s, py + y, pz - x * s + z * c]
}

/** Brake line, world space: master cylinder → ABS modulator (segment A), ABS modulator → caliper (segment B). */
export function brakeLinePoints(): { a: Vec3[]; b: Vec3[] } {
  const mcOut = schematicToWorld([MASTER.outletX, AXIS_Y, 0])
  const absIn = schematicToWorld([ABS_UNIT.x - ABS_UNIT.width / 2, AXIS_Y, 0])
  const absOut = schematicToWorld([ABS_UNIT.x + ABS_UNIT.width / 2, AXIS_Y - 0.06, 0])
  const absClear = schematicToWorld([ABS_UNIT.x + ABS_UNIT.width / 2 + 0.18, AXIS_Y - 0.1, 0])
  const inlet = caliperToWorld(CALIPER_INLET)
  const approach = caliperToWorld([CALIPER_INLET[0] - 0.22, CALIPER_INLET[1] + 0.04, 0])
  return { a: [mcOut, absIn], b: [absOut, absClear, approach, inlet] }
}

/** Sensor wire, world space: sensor → ABS modulator. */
export function sensorWirePoints(): Vec3[] {
  const start = sensorPoint(SENSOR.tipRadius + SENSOR.length, SENSOR.x)
  const out = sensorPoint(SENSOR.tipRadius + SENSOR.length + 0.25, SENSOR.x - 0.15)
  const absBack = schematicToWorld([ABS_UNIT.x, AXIS_Y - ABS_UNIT.height / 2, -ABS_UNIT.depth / 2 + 0.05])
  const below = schematicToWorld([ABS_UNIT.x, AXIS_Y - ABS_UNIT.height / 2 - 0.35, -0.1])
  return [start, out, [(out[0] + below[0]) / 2, (out[1] + below[1]) / 2 + 0.1, (out[2] + below[2]) / 2], below, absBack]
}

/* ------------------------------------------------------------------ */
/* Road                                                                 */
/* ------------------------------------------------------------------ */

export const ROAD = { y: -TYRE.radius, length: 10, width: 2.4, x: TYRE.x, dashSpacing: 2.5, dashLength: 1.1, dashes: 5 } as const

/* ------------------------------------------------------------------ */
/* Exploded view                                                        */
/* ------------------------------------------------------------------ */

/** Exploded-view offsets in each part's parent space (world, caliper frame or schematic plane). */
export const EXPLODE: Record<BrakePartId, Vec3> = {
  'braked-wheel': [1.9, 0, 0],
  'hub-flange': [1.05, 0, 0],
  'brake-disc': [0.5, 0, 0],
  'wheel-speed-sensor': [-0.45, 0, 0],
  // Caliper frame: +Y is radially outwards.
  'brake-caliper': [-0.05, 0.75, 0],
  'caliper-piston': [-0.75, 0.35, 0],
  'inner-brake-pad': [-0.4, 0.3, 0],
  'outer-brake-pad': [0.4, 0.3, 0],
  // Schematic plane.
  'brake-pedal': [-0.25, 0, 0],
  'brake-servo': [0, 0, 0],
  'master-cylinder': [0.2, 0.25, 0],
  'abs-modulator': [0.35, 0.45, 0],
  'brake-line': [0, 0, 0],
}

/* ------------------------------------------------------------------ */
/* Camera                                                               */
/* ------------------------------------------------------------------ */

export interface Framing {
  position: Vec3
  target: Vec3
}

export const BRAKE_CAMERA: Framing & { floorY: number } = { position: [-6.4, 2.3, 2.9], target: [-1.15, 0.3, -0.75], floorY: ROAD.y + 0.004 }
export const BRAKE_CAMERA_NARROW: Framing = { position: [-8.6, 3.0, 4.6], target: [-1.0, 0.1, -0.7] }
export const BRAKE_EXPLODED_CAMERA: Framing = { position: [-7.6, 3.1, 4.2], target: [-0.6, 0.3, -0.6] }
