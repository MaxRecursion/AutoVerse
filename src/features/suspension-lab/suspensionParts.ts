import { DROP_LINK, HARDPOINTS, TIE_ROD_INNER, TYRE, solveLinkage } from './linkage'
import { COILOVER, LOADED_RADIUS } from './suspensionModel'

/**
 * Part ids of the suspension laboratory, in the order the Parts tab lists
 * them, with exploded-view offsets and label anchors (scene units = metres;
 * x outboard, y up, z forward towards the viewer). Every id exists in
 * src/content/components/suspension.json.
 */
export const SUSPENSION_PART_IDS = [
  'wheel-and-tyre',
  'hub-bearing',
  'knuckle-upright',
  'ball-joints',
  'upper-control-arm',
  'lower-control-arm',
  'coil-spring',
  'damper',
  'bump-stop',
  'anti-roll-bar',
  'drop-link',
  'tie-rod',
  'chassis-mounts',
] as const

export type SuspensionPartId = (typeof SUSPENSION_PART_IDS)[number]

type Vec3 = [number, number, number]

export const EXPLODE: Record<SuspensionPartId, Vec3> = {
  'wheel-and-tyre': [0.5, 0, 0],
  'hub-bearing': [0.32, 0, 0],
  'knuckle-upright': [0.17, 0, 0],
  'ball-joints': [0.12, 0, 0.2],
  'upper-control-arm': [0, 0.2, 0],
  'lower-control-arm': [0, -0.14, 0],
  'coil-spring': [0, 0.06, 0.38],
  damper: [0, 0.06, 0.22],
  'bump-stop': [0, 0.2, 0.5],
  'anti-roll-bar': [0, -0.08, -0.25],
  'drop-link': [0, -0.04, -0.12],
  'tie-rod': [0, 0.04, -0.3],
  'chassis-mounts': [-0.28, 0, 0],
}

/** Camera framing: in front of the corner, a little outboard and above, looking back at the wheel. */
export const SUSPENSION_CAMERA: { position: Vec3; target: Vec3 } = {
  position: [1.92, 0.91, 2.26],
  target: [0.36, 0.26, 0],
}

/**
 * Narrow (portrait) canvases: same direction, further back, and shifted down
 * and outboard so the whole corner sits in the band between the readouts and
 * the setup / timeline panels.
 */
export const SUSPENSION_CAMERA_NARROW: { position: Vec3; target: Vec3 } = {
  position: [2.74, 1.08, 3.19],
  target: [0.45, 0.05, 0],
}

/** Wider framing used while the exploded view is on. */
export const SUSPENSION_EXPLODED_CAMERA: { position: Vec3; target: Vec3 } = {
  position: [2.83, 1.4, 3.34],
  target: [0.5, 0.3, 0.1],
}

/* ------------------------------------------------------------------ */
/* Label anchors (world space at static ride height)                    */
/* ------------------------------------------------------------------ */

const STATIC = solveLinkage(0, LOADED_RADIUS)
const mid = (a: { x: number; y: number }, b: { x: number; y: number }, f = 0.5) => [a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f] as const
const axisPoint = (along: number): [number, number] => {
  const a = STATIC.coiloverAngle
  return [STATIC.coiloverLower.x - Math.sin(a) * along, STATIC.coiloverLower.y + Math.cos(a) * along]
}

export const LABEL_ANCHOR: Record<SuspensionPartId, Vec3> = {
  'wheel-and-tyre': [HARDPOINTS.wheelCentreX + TYRE.width / 2 + 0.02, LOADED_RADIUS + TYRE.freeRadius * 0.72, 0.18],
  'hub-bearing': [HARDPOINTS.hubFaceX + 0.06, LOADED_RADIUS + 0.02, 0.05],
  'knuckle-upright': [...mid(STATIC.lowerBallJoint, STATIC.upperBallJoint, 0.62), 0.07],
  'ball-joints': [STATIC.upperBallJoint.x + 0.02, STATIC.upperBallJoint.y + 0.06, 0.03],
  'upper-control-arm': [...mid(HARDPOINTS.upperInner, STATIC.upperBallJoint, 0.35), 0.15],
  'lower-control-arm': [...mid(HARDPOINTS.lowerInner, STATIC.lowerBallJoint, 0.3), 0.17],
  'coil-spring': [...axisPoint(COILOVER.lowerSeat + 0.17), 0.08],
  damper: [...axisPoint(0.1), 0.05],
  'bump-stop': [...axisPoint(STATIC.coiloverLength - 0.04), 0.05],
  'anti-roll-bar': [0.05, HARDPOINTS.antiRollAxis.y + 0.04, HARDPOINTS.antiRollAxis.z],
  'drop-link': [DROP_LINK.x + 0.03, (DROP_LINK.lower0[1] + DROP_LINK.upper0[1]) / 2, DROP_LINK.lower0[2]],
  'tie-rod': [(TIE_ROD_INNER.x + HARDPOINTS.tieRodOuter.x) / 2, HARDPOINTS.tieRodOuter.y + 0.04, HARDPOINTS.tieRodZ],
  'chassis-mounts': [0.22, 0.9, 0],
}
