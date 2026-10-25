import { BLOCK } from './engineModel'

/**
 * Part ids of the engine laboratory, in the order the Parts tab lists them,
 * with their exploded-view offsets (scene units, x toward the viewer, y up,
 * z towards the intake side). Shared by the 3D scene and the 2D section so
 * both views explode the same way. Every id exists in
 * src/content/components/engine.json.
 */
export const ENGINE_PART_IDS = [
  'piston',
  'piston-rings',
  'wrist-pin',
  'connecting-rod',
  'crankshaft',
  'flywheel',
  'cylinder',
  'combustion-chamber',
  'spark-plug',
  'intake-valve',
  'exhaust-valve',
  'valve-spring',
  'cam-follower',
  'intake-camshaft',
  'exhaust-camshaft',
  'timing-belt',
  'intake-port',
  'exhaust-port',
  'cylinder-head',
  'engine-block',
  'oil-sump',
] as const

export type EnginePartId = (typeof ENGINE_PART_IDS)[number]

type Vec3 = [number, number, number]

/** Camera framing shared by the lab and the hero: looking at the section plane from the +x side, slightly from the intake side. */
export const ENGINE_CAMERA: { position: Vec3; target: Vec3; floorY: number } = {
  position: [8.3, 3.5, 5.2],
  // Aimed a little below the engine's centre so it sits above the transport bar.
  target: [-0.15, 1.05, 0],
  floorY: BLOCK.sumpBottomY - 0.04,
}

/** Framing for narrow (phone) canvases: same direction, further back, aimed lower so the engine clears the transport bar. */
export const ENGINE_CAMERA_NARROW: { position: Vec3; target: Vec3 } = {
  position: [11.2, 4.4, 7.0],
  target: [-0.15, 0.75, 0],
}

/** Wider framing used while the exploded view is on (same viewing direction, pulled back and raised). */
export const ENGINE_EXPLODED_CAMERA: { position: Vec3; target: Vec3 } = {
  position: [12.2, 5.5, 7.6],
  target: [-0.15, 2.0, 0],
}

export const EXPLODE: Record<EnginePartId, Vec3> = {
  'engine-block': [0, 0, 0],
  cylinder: [-0.25, 0.2, 0],
  'oil-sump': [0, -0.75, 0],
  crankshaft: [0, -0.55, 0],
  flywheel: [-0.55, -0.55, 0],
  'connecting-rod': [0.55, -0.1, 0],
  'wrist-pin': [0.9, 0.35, 0],
  piston: [0, 0.4, 0],
  'piston-rings': [0, 0.72, 0],
  'combustion-chamber': [0, 1.05, 0],
  'cylinder-head': [0, 1.3, 0],
  'intake-port': [0, 1.3, 0.55],
  'exhaust-port': [0, 1.3, -0.55],
  'spark-plug': [0, 2.25, 0],
  'intake-valve': [0, 1.55, 0.25],
  'exhaust-valve': [0, 1.55, -0.25],
  'valve-spring': [0, 1.9, 0],
  'cam-follower': [0, 2.15, 0],
  'intake-camshaft': [0, 2.5, 0.3],
  'exhaust-camshaft': [0, 2.5, -0.3],
  'timing-belt': [-0.45, 0, 0],
}
