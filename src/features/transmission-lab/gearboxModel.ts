/**
 * Gearbox laboratory — scene layout and meshing kinematics (pure, no three.js).
 *
 * Scene frame: the shafts run along x (engine/clutch at −x, output at +x),
 * y is up, the camera looks from +z. The mainshaft (coaxial with the input
 * shaft) sits above the layshaft. Gear angles ψ are measured in the y–z plane
 * from +y towards +z, which is exactly three.js `rotation.x`.
 *
 * Gear sizes come straight from tooth counts (pitch radius = module × teeth ÷ 2),
 * so meshing gears visibly match and every speed pair spans the same centre
 * distance. Tooth phases are derived with `meshPhase`, which keeps a tooth of
 * one gear centred in a gap of its partner at every angle — no drift.
 */
import { CLUTCH, HEAD_PAIR, REVERSE_TRAIN, SPEED_PAIRS, TOOTH_SUM, type DriveGearId, type IndirectGearId } from './gearbox'

export type Vec3 = [number, number, number]

/* ------------------------------------------------------------------ */
/* Tooth geometry                                                       */
/* ------------------------------------------------------------------ */

/** Gear module in scene units (pitch diameter per tooth). */
export const MODULE = 0.045
export const pitchRadius = (teeth: number, module = MODULE) => (module * teeth) / 2
export const tipRadius = (teeth: number, module = MODULE) => pitchRadius(teeth, module) + module
export const rootRadius = (teeth: number, module = MODULE) => pitchRadius(teeth, module) - 1.25 * module

/** Layshaft-to-mainshaft centre distance shared by every head and speed pair. */
export const CENTRE_DISTANCE = (MODULE * TOOTH_SUM) / 2

/** Axis heights. */
export const MAIN_Y = 0.55
export const LAY_Y = MAIN_Y - CENTRE_DISTANCE

/** Helix angle of the (helical) forward gears; reverse is straight-cut. */
export const HELIX_ANGLE = (18 * Math.PI) / 180

/** Dog teeth on each free gear's engagement ring (and in each synchro collar). */
export const DOG_TEETH = 24
export const DOG_MODULE = 0.0225

/* ------------------------------------------------------------------ */
/* Axial stations (x, gear face centres)                                */
/* ------------------------------------------------------------------ */

export const FACE_WIDTH = 0.2
export const DOG_WIDTH = 0.06
export const HUB_WIDTH = 0.2
/** Collar slide from neutral to full engagement. */
export const COLLAR_TRAVEL = 0.11

export const STATION = {
  head: -1.5,
  hub34: -1.18,
  third: -0.86,
  second: -0.42,
  hub12: -0.1,
  first: 0.22,
  reverse: 0.62,
  fifth: 1.16,
  hub5: 1.48,
} as const

/** Wide layshaft reverse gear: the idler stays in mesh with it at both ends of its slide. */
export const LAY_REVERSE = { x: 0.75, width: 0.5 } as const
export const IDLER = { width: 0.18, engagedX: STATION.reverse, disengagedX: 0.88 } as const

export const SHAFT = {
  input: { from: -2.8, to: -1.42, radius: 0.11 },
  main: { from: -1.36, to: 2.02, radius: 0.13 },
  lay: { from: -1.82, to: 1.74, radius: 0.12 },
  idler: { from: 0.46, to: 1.0, radius: 0.07 },
} as const

export const OUTPUT_FLANGE = { x: 1.98, width: 0.08, radius: 0.34 } as const

export const CASE = {
  bellFrom: -3.05,
  front: -1.85,
  rear: 1.75,
  extensionTo: 1.92,
  wall: 0.06,
  /** Radius of the half-stadium around each axis. */
  radius: 1.12,
} as const

/** Selector rails run above the largest mainshaft gear. */
export const RAIL_Y = MAIN_Y + 1.0

/* ------------------------------------------------------------------ */
/* Clutch stack (engaged positions)                                     */
/* ------------------------------------------------------------------ */

export const CLUTCH_GEO = {
  flywheelFace: -2.82,
  flywheelThickness: 0.16,
  flywheelRadius: 1.0,
  discThickness: 0.07,
  discRadius: 0.78,
  plateThickness: 0.09,
  plateInner: 0.42,
  plateOuter: 0.8,
  /** Diaphragm: outer rim on the plate, fulcrum on the cover, fingers to the bearing. */
  diaphragm: { outer: 0.78, fulcrum: 0.66, inner: 0.22, outerDrop: 0.06, fingerRise: 0.16 },
  /** Plate lift-off at full release (drawn exaggerated so it is visible). */
  plateGap: 0.04,
  /** Release-bearing clearance to the fingers with the pedal fully up (free play). */
  bearingFreeGap: 0.03,
  bearingWidth: 0.08,
} as const

/** x of the disc's flywheel-side face and the plate's back face when clamped. */
export const CLUTCH_X = {
  discCentre: CLUTCH_GEO.flywheelFace + CLUTCH_GEO.discThickness / 2,
  plateFront: CLUTCH_GEO.flywheelFace + CLUTCH_GEO.discThickness,
  plateBack: CLUTCH_GEO.flywheelFace + CLUTCH_GEO.discThickness + CLUTCH_GEO.plateThickness,
  fulcrum: CLUTCH_GEO.flywheelFace + CLUTCH_GEO.discThickness + CLUTCH_GEO.plateThickness + CLUTCH_GEO.diaphragm.outerDrop,
} as const

export const FINGER_TIP_X = CLUTCH_X.fulcrum + CLUTCH_GEO.diaphragm.fingerRise

export interface ClutchPose {
  /** Plate lift-off from the disc (+x). */
  plateRetract: number
  /** Disc axial float (+x), half the gap so it sits free between the faces. */
  discFloat: number
  /** Diaphragm cone x-scale about its fulcrum (1 = clamping, < 1 = pivoted towards release). */
  diaphragmScale: number
  /** Release-bearing face x. */
  bearingX: number
}

/**
 * Clutch mechanism pose from pedal travel and clamp fraction. The plate lift
 * follows the loss of clamp load; the diaphragm pivots on its fulcrum so its
 * rim follows the plate and its fingers follow the release bearing.
 */
export function clutchPose(pedal: number, engagement: number): ClutchPose {
  const p = Math.min(1, Math.max(0, pedal))
  const d = CLUTCH_GEO.diaphragm
  const plateRetract = CLUTCH_GEO.plateGap * (1 - engagement)
  const diaphragmScale = 1 - plateRetract / d.outerDrop
  const fingerTip = CLUTCH_X.fulcrum + d.fingerRise * diaphragmScale
  // Until the free play is taken up the bearing closes its clearance; after that it rides on the finger tips.
  const clearance = p < CLUTCH.freePlay ? CLUTCH_GEO.bearingFreeGap * (1 - p / CLUTCH.freePlay) : 0
  return { plateRetract, discFloat: plateRetract / 2, diaphragmScale, bearingX: fingerTip + clearance }
}

/* ------------------------------------------------------------------ */
/* Meshing kinematics                                                   */
/* ------------------------------------------------------------------ */

/** Direction (ψ) from one gear centre to another in the y–z plane. */
export const directionTo = (from: { y: number; z: number }, to: { y: number; z: number }) => Math.atan2(to.z - from.z, to.y - from.y)

/**
 * Angle of gear B driven by gear A. Teeth sit at ψ = 2πk/z (+ the gear's
 * angle); `alpha` is the direction from A's centre to B's. Rolling contact
 * gives φB = −(zA/zB)·φA, and the constant phase keeps A's tooth centred in
 * B's gap whenever it crosses the line of centres, for every φA.
 */
export function meshPhase(phiA: number, teethA: number, teethB: number, alpha: number): number {
  const delta = alpha + Math.PI + (alpha * teethA - Math.PI) / teethB
  return -(teethA / teethB) * phiA + delta
}

/**
 * Fractional "tooth index" of a gear at its contact point with a partner in
 * direction `alpha` (integer = tooth centred on the line of centres,
 * .5 = gap centred). Used by the tests to prove meshes never drift.
 */
export const toothIndexAt = (phi: number, teeth: number, alpha: number) => ((alpha - phi) * teeth) / (2 * Math.PI)

/** Reverse idler axis, found from its two centre distances (it sits towards the camera, +z). */
export const IDLER_CENTRE = (() => {
  const dLay = (MODULE * (REVERSE_TRAIN.driver + REVERSE_TRAIN.idler)) / 2
  const dMain = (MODULE * (REVERSE_TRAIN.driven + REVERSE_TRAIN.idler)) / 2
  const c = CENTRE_DISTANCE
  const up = (dLay * dLay - dMain * dMain + c * c) / (2 * c)
  return { y: LAY_Y + up, z: Math.sqrt(dLay * dLay - up * up) }
})()

const MAIN_AXIS = { y: MAIN_Y, z: 0 }
const LAY_AXIS = { y: LAY_Y, z: 0 }
const ALPHA_DOWN = Math.PI // main → lay
const ALPHA_UP = 0 // lay → main
const ALPHA_LAY_IDLER = directionTo(LAY_AXIS, IDLER_CENTRE)
const ALPHA_IDLER_MAIN = directionTo(IDLER_CENTRE, MAIN_AXIS)

export const MESH_DIRECTIONS = { down: ALPHA_DOWN, up: ALPHA_UP, layToIdler: ALPHA_LAY_IDLER, idlerToMain: ALPHA_IDLER_MAIN } as const

export interface TrainAngles {
  /** Input shaft, clutch disc and input pinion. */
  input: number
  /** Layshaft cluster (head gear and every layshaft speed gear). */
  layshaft: number
  /** Reverse idler (always in mesh with the wide layshaft reverse gear). */
  idler: number
  /** Free-running mainshaft gears, each driven by its layshaft partner. */
  main: Record<IndirectGearId, number>
  /** Angle the mainshaft reverse gear must have to mesh with the idler. */
  reverse: number
}

/** Every gear-train angle, derived from the single input-shaft angle. */
export function trainAngles(input: number): TrainAngles {
  const layshaft = meshPhase(input, HEAD_PAIR.driver, HEAD_PAIR.driven, ALPHA_DOWN)
  const main = {} as Record<IndirectGearId, number>
  for (const g of Object.keys(SPEED_PAIRS) as IndirectGearId[]) {
    const pair = SPEED_PAIRS[g]
    main[g] = meshPhase(layshaft, pair.driver, pair.driven, ALPHA_UP)
  }
  const idler = meshPhase(layshaft, REVERSE_TRAIN.driver, REVERSE_TRAIN.idler, ALPHA_LAY_IDLER)
  const reverse = meshPhase(idler, REVERSE_TRAIN.idler, REVERSE_TRAIN.driven, ALPHA_IDLER_MAIN)
  return { input, layshaft, idler, main, reverse }
}

/**
 * The mainshaft angle (before its lock offset) when a gear is engaged: it
 * turns with the selected free gear, with the input pinion (4th, direct) or
 * as the idler drives the reverse gear.
 */
export function lockedBase(gear: DriveGearId, t: TrainAngles): number {
  if (gear === '4') return t.input
  if (gear === 'R') return t.reverse
  return t.main[gear]
}

/**
 * Angular step at which the mainshaft may lock to a gear: one dog tooth for
 * the synchronised gears, one reverse-gear tooth for reverse (so the idler
 * mesh stays exact).
 */
export const lockPitch = (gear: DriveGearId) => (2 * Math.PI) / (gear === 'R' ? REVERSE_TRAIN.driven : DOG_TEETH)

/* ------------------------------------------------------------------ */
/* Visual speed                                                         */
/* ------------------------------------------------------------------ */

/** Real shaft speeds are far too fast to follow; the animation runs this many times slower. */
export const VISUAL_SLOWDOWN = 100

/** Visual angular speed (rad/s) for a real speed in rpm. */
export const visualRadPerSecond = (rpm: number) => ((rpm / 60) * 2 * Math.PI) / VISUAL_SLOWDOWN
