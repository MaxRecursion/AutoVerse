import { CLUTCH_GEO, IDLER, IDLER_CENTRE, LAY_Y, MAIN_Y, RAIL_Y, STATION, type Vec3 } from './gearboxModel'

/**
 * Part ids of the gearbox laboratory in the order the Parts tab lists them
 * (power-flow order), with exploded-view offsets and label anchors. Every id
 * exists in src/content/components/transmission.json.
 */
export const TRANSMISSION_PART_IDS = [
  'clutch-flywheel',
  'clutch-disc',
  'pressure-plate',
  'release-bearing',
  'input-shaft',
  'constant-mesh-gears',
  'layshaft',
  'first-gear',
  'second-gear',
  'third-gear',
  'fifth-gear',
  'synchro-1-2',
  'synchro-3-4',
  'synchro-5',
  'reverse-idler',
  'mainshaft',
  'selector-forks',
  'gearbox-casing',
] as const

export type TransmissionPartId = (typeof TRANSMISSION_PART_IDS)[number]

export const EXPLODE: Record<TransmissionPartId, Vec3> = {
  'clutch-flywheel': [-1.7, 0, 0],
  'clutch-disc': [-1.15, 0, 0],
  'pressure-plate': [-0.6, 0, 0],
  'release-bearing': [-0.15, 0, 0.9],
  'input-shaft': [-0.3, 0, 0.9],
  'constant-mesh-gears': [0, 0, 1.1],
  layshaft: [0, -0.95, 0],
  'first-gear': [0, 0.75, 0.6],
  'second-gear': [0, 0.75, 0.6],
  'third-gear': [0, 0.75, 0.6],
  'fifth-gear': [0, 0.75, 0.6],
  'synchro-1-2': [0, 1.3, 0.9],
  'synchro-3-4': [0, 1.3, 0.9],
  'synchro-5': [0, 1.3, 0.9],
  'reverse-idler': [0, -0.35, 1.3],
  mainshaft: [0, 0.3, 0],
  'selector-forks': [0, 1.9, 0],
  'gearbox-casing': [0, 0, -1.6],
}

/** Label anchors in world space (the Part groups sit at the origin). */
export const LABEL: Record<TransmissionPartId, Vec3> = {
  'clutch-flywheel': [CLUTCH_GEO.flywheelFace - 0.1, MAIN_Y + CLUTCH_GEO.flywheelRadius + 0.18, 0],
  'clutch-disc': [CLUTCH_GEO.flywheelFace + 0.04, MAIN_Y - CLUTCH_GEO.discRadius - 0.12, 0.25],
  'pressure-plate': [CLUTCH_GEO.flywheelFace + 0.2, MAIN_Y + CLUTCH_GEO.plateOuter + 0.12, 0.3],
  'release-bearing': [-2.38, MAIN_Y - 0.36, 0.3],
  'input-shaft': [-2.05, MAIN_Y + 0.24, 0.1],
  'constant-mesh-gears': [STATION.head, MAIN_Y + 0.62, 0.25],
  layshaft: [0.0, LAY_Y - 0.92, 0.3],
  'first-gear': [STATION.first, MAIN_Y + 1.02, 0.15],
  'second-gear': [STATION.second, MAIN_Y + 0.86, 0.15],
  'third-gear': [STATION.third, MAIN_Y + 0.74, 0.15],
  'fifth-gear': [STATION.fifth, MAIN_Y + 0.56, 0.15],
  'synchro-1-2': [STATION.hub12, MAIN_Y + 0.52, 0.35],
  'synchro-3-4': [STATION.hub34, MAIN_Y + 0.52, 0.35],
  'synchro-5': [STATION.hub5, MAIN_Y + 0.52, 0.35],
  'reverse-idler': [IDLER.engagedX, IDLER_CENTRE.y - 0.15, IDLER_CENTRE.z + 0.55],
  mainshaft: [1.82, MAIN_Y + 0.3, 0.1],
  'selector-forks': [-0.6, RAIL_Y + 0.16, 0],
  'gearbox-casing': [0.4, LAY_Y - 1.2, -0.5],
}

export interface CameraFraming {
  position: Vec3
  target: Vec3
}

/**
 * Front three-quarter view into the cutaway (the casing's near half is removed).
 * Sets the view direction; framing.ts fits the distance to the actual canvas.
 */
export const TRANSMISSION_CAMERA: CameraFraming & { floorY: number } = {
  position: [1.4, 2.7, 7.6],
  target: [-0.45, 0.05, 0],
  floorY: LAY_Y - 1.25,
}

/** Exploded-view framing when the canvas cannot be measured (framing.ts fits it otherwise). */
export const TRANSMISSION_EXPLODED_CAMERA: CameraFraming = {
  position: [2.0, 4.6, 12.2],
  target: [-0.6, 0.35, 0],
}
