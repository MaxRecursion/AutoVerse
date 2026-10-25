/**
 * Gearbox laboratory — 2D side-view schematic layout (pure, no React).
 *
 * The classic textbook view: shafts as horizontal bars, each gear as a
 * vertical bar as tall as its pitch diameter, so the bars of a meshing pair
 * touch at their pitch point. Uses the same stations, tooth counts and power
 * path as the 3D scene. SVG units are scene units × 100, y pointing down.
 */
import { HEAD_PAIR, REVERSE_TRAIN, SPEED_PAIRS, clutchEngagement, clutchTorqueFraction, type GearId, type IndirectGearId } from './gearbox'
import {
  CLUTCH_GEO,
  COLLAR_TRAVEL,
  FACE_WIDTH,
  HUB_WIDTH,
  IDLER,
  IDLER_CENTRE,
  LAY_REVERSE,
  LAY_Y,
  MAIN_Y,
  OUTPUT_FLANGE,
  SHAFT,
  STATION,
  clutchPose,
  pitchRadius,
} from './gearboxModel'
import { targetPose } from './driveSim'
import { HUB_PART, MAIN_GEAR_PART, powerPathKeys, type HubId, type PathKey } from './powerPath'
import type { TransmissionPartId } from './transmissionParts'

export const SVG_SCALE = 100
/** Plate lift is tiny in reality; the schematic draws it this much larger. */
export const SCHEMATIC_GAP_EXAGGERATION = 3

export type SchematicKind = 'clutch' | 'shaft' | 'gear' | 'synchro' | 'idler'

export interface SchematicRect {
  key: PathKey
  part: TransmissionPartId
  kind: SchematicKind
  /** SVG coordinates (top-left corner, size). */
  x: number
  y: number
  w: number
  h: number
  teeth?: number
  active: boolean
}

export interface SchematicLayout {
  viewBox: string
  rects: SchematicRect[]
  /** Amber power-flow polyline (SVG points); empty when nothing is transmitted. */
  path: [number, number][]
  /** Axis label anchors. */
  axes: { main: number; lay: number; idler: number }
  torqueFraction: number
}

const sx = (x: number) => x * SVG_SCALE
const sy = (y: number) => -y * SVG_SCALE

/** Bar centred on (x, y) with axial width w and radial half-height r (scene units). */
function bar(key: PathKey, part: TransmissionPartId, kind: SchematicKind, x: number, y: number, w: number, r: number, teeth?: number) {
  return { key, part, kind, x: sx(x - w / 2), y: sy(y + r), w: w * SVG_SCALE, h: 2 * r * SVG_SCALE, teeth }
}

const HUB_X: Record<HubId, number> = { h34: STATION.hub34, h12: STATION.hub12, h5: STATION.hub5 }
const GEAR_X: Record<IndirectGearId, number> = { '1': STATION.first, '2': STATION.second, '3': STATION.third, '5': STATION.fifth }

export const VIEWBOX = { x: -315, y: -175, w: 535, h: 350 } as const

/**
 * Schematic for a selected gear and clutch pedal position. The selector is
 * drawn at rest in the selected gear (the 3D scene animates the shift).
 */
export function schematicLayout(gear: GearId, pedal: number): SchematicLayout {
  const engagement = clutchEngagement(pedal)
  const torqueFraction = clutchTorqueFraction(engagement)
  const pose = clutchPose(pedal, engagement)
  const selector = targetPose(gear)
  const active = new Set(powerPathKeys(gear, torqueFraction))
  const c = CLUTCH_GEO
  const lift = pose.plateRetract * SCHEMATIC_GAP_EXAGGERATION

  const rects: Omit<SchematicRect, 'active'>[] = [
    // Clutch stack.
    bar('flywheel', 'clutch-flywheel', 'clutch', c.flywheelFace - c.flywheelThickness / 2, MAIN_Y, c.flywheelThickness, c.flywheelRadius),
    bar('disc', 'clutch-disc', 'clutch', c.flywheelFace + c.discThickness / 2 + lift / 2, MAIN_Y, c.discThickness, c.discRadius),
    bar('plate', 'pressure-plate', 'clutch', c.flywheelFace + c.discThickness + c.plateThickness / 2 + lift, MAIN_Y, c.plateThickness, c.plateOuter),
    // Shafts.
    bar('input-shaft', 'input-shaft', 'shaft', (SHAFT.input.from + SHAFT.input.to) / 2, MAIN_Y, SHAFT.input.to - SHAFT.input.from, SHAFT.input.radius),
    bar('mainshaft', 'mainshaft', 'shaft', (SHAFT.main.from + SHAFT.main.to) / 2, MAIN_Y, SHAFT.main.to - SHAFT.main.from, SHAFT.main.radius),
    bar('mainshaft', 'mainshaft', 'shaft', OUTPUT_FLANGE.x, MAIN_Y, OUTPUT_FLANGE.width, OUTPUT_FLANGE.radius),
    bar('layshaft', 'layshaft', 'shaft', (SHAFT.lay.from + SHAFT.lay.to) / 2, LAY_Y, SHAFT.lay.to - SHAFT.lay.from, SHAFT.lay.radius),
    // Constant-mesh head pair.
    bar('pinion', 'constant-mesh-gears', 'gear', STATION.head, MAIN_Y, FACE_WIDTH, pitchRadius(HEAD_PAIR.driver), HEAD_PAIR.driver),
    bar('lay-head', 'constant-mesh-gears', 'gear', STATION.head, LAY_Y, FACE_WIDTH, pitchRadius(HEAD_PAIR.driven), HEAD_PAIR.driven),
  ]
  for (const g of Object.keys(SPEED_PAIRS) as IndirectGearId[]) {
    const pair = SPEED_PAIRS[g]
    rects.push(bar(`main-${g}`, MAIN_GEAR_PART[g], 'gear', GEAR_X[g], MAIN_Y, FACE_WIDTH, pitchRadius(pair.driven), pair.driven))
    rects.push(bar(`lay-${g}`, 'layshaft', 'gear', GEAR_X[g], LAY_Y, FACE_WIDTH, pitchRadius(pair.driver), pair.driver))
  }
  // Reverse: wide layshaft gear, mainshaft gear, and the idler (which sits off to the side, in front).
  rects.push(bar('lay-reverse', 'layshaft', 'gear', LAY_REVERSE.x, LAY_Y, LAY_REVERSE.width, pitchRadius(REVERSE_TRAIN.driver), REVERSE_TRAIN.driver))
  rects.push(bar('main-reverse', 'mainshaft', 'gear', STATION.reverse, MAIN_Y, FACE_WIDTH * 0.9, pitchRadius(REVERSE_TRAIN.driven), REVERSE_TRAIN.driven))
  const idlerX = IDLER.disengagedX + (IDLER.engagedX - IDLER.disengagedX) * selector.idler
  rects.push(bar('idler', 'reverse-idler', 'idler', idlerX, IDLER_CENTRE.y, IDLER.width, pitchRadius(REVERSE_TRAIN.idler), REVERSE_TRAIN.idler))
  // Synchronisers: hub plus a collar slid towards the gear it locks.
  for (const h of Object.keys(HUB_X) as HubId[]) {
    rects.push(bar(`sync-${h}`, HUB_PART[h], 'synchro', HUB_X[h] + selector[h] * COLLAR_TRAVEL, MAIN_Y, HUB_WIDTH, 0.37))
  }

  return {
    viewBox: `${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.w} ${VIEWBOX.h}`,
    rects: rects.map((r) => ({ ...r, active: active.has(r.key) })),
    path: active.size > 0 ? powerFlowLine(gear) : [],
    axes: { main: sy(MAIN_Y), lay: sy(LAY_Y), idler: sy(IDLER_CENTRE.y) },
    torqueFraction,
  }
}

/** Power-flow polyline from the flywheel to the output flange for a gear (SVG points). */
export function powerFlowLine(gear: GearId): [number, number][] {
  const start: [number, number] = [sx(CLUTCH_GEO.flywheelFace - CLUTCH_GEO.flywheelThickness / 2), sy(MAIN_Y)]
  const end: [number, number] = [sx(OUTPUT_FLANGE.x + OUTPUT_FLANGE.width / 2 + 0.08), sy(MAIN_Y)]
  const head: [number, number] = [sx(STATION.head), sy(MAIN_Y)]
  const down: [number, number] = [sx(STATION.head), sy(LAY_Y)]
  switch (gear) {
    case 'N':
      return []
    case '4':
      return [start, end]
    case 'R':
      return [start, head, down, [sx(STATION.reverse), sy(LAY_Y)], [sx(STATION.reverse), sy(MAIN_Y)], end]
    default:
      return [start, head, down, [sx(GEAR_X[gear]), sy(LAY_Y)], [sx(GEAR_X[gear]), sy(MAIN_Y)], end]
  }
}
