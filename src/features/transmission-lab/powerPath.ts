/**
 * Which parts carry engine torque in each gear — pure, shared by the 3D
 * glow, the 2D schematic and the explanation panel.
 */
import type { DriveGearId, GearId, IndirectGearId } from './gearbox'
import type { TransmissionPartId } from './transmissionParts'

export type HubId = 'h34' | 'h12' | 'h5'

/** Synchro hub serving each synchronised gear (4th = direct, through the 3–4 collar). */
export const GEAR_HUB: Record<Exclude<DriveGearId, 'R'>, HubId> = { '1': 'h12', '2': 'h12', '3': 'h34', '4': 'h34', '5': 'h5' }

export const HUB_PART: Record<HubId, TransmissionPartId> = { h34: 'synchro-3-4', h12: 'synchro-1-2', h5: 'synchro-5' }

export const MAIN_GEAR_PART: Record<IndirectGearId, TransmissionPartId> = {
  '1': 'first-gear',
  '2': 'second-gear',
  '3': 'third-gear',
  '5': 'fifth-gear',
}

/**
 * Individual torque-carrying elements of the scene (finer than parts: the
 * layshaft cluster carries torque only through the gear in use).
 */
export type PathKey =
  | 'flywheel'
  | 'plate'
  | 'disc'
  | 'input-shaft'
  | 'pinion'
  | 'lay-head'
  | 'layshaft'
  | `lay-${IndirectGearId}`
  | 'lay-reverse'
  | 'idler'
  | `main-${IndirectGearId}`
  | 'main-reverse'
  | `sync-${HubId}`
  | 'mainshaft'

const CLUTCH_KEYS: PathKey[] = ['flywheel', 'plate', 'disc', 'input-shaft']

/**
 * Elements carrying torque, in power-flow order. Nothing carries torque in
 * neutral (the gears just spin) or with the clutch fully released.
 */
export function powerPathKeys(engaged: GearId | null, torqueFraction: number): PathKey[] {
  if (engaged === null || engaged === 'N' || torqueFraction <= 0) return []
  if (engaged === '4') return [...CLUTCH_KEYS, 'pinion', 'sync-h34', 'mainshaft']
  if (engaged === 'R') return [...CLUTCH_KEYS, 'pinion', 'lay-head', 'layshaft', 'lay-reverse', 'idler', 'main-reverse', 'mainshaft']
  return [...CLUTCH_KEYS, 'pinion', 'lay-head', 'layshaft', `lay-${engaged}`, `main-${engaged}`, `sync-${GEAR_HUB[engaged]}`, 'mainshaft']
}

/** Parts on the power path for a selected gear, in flow order (for the explanation panel). */
export function powerPathParts(gear: GearId): TransmissionPartId[] {
  if (gear === 'N') return []
  const clutch: TransmissionPartId[] = ['clutch-flywheel', 'pressure-plate', 'clutch-disc', 'input-shaft']
  if (gear === '4') return [...clutch, 'constant-mesh-gears', 'synchro-3-4', 'mainshaft']
  if (gear === 'R') return [...clutch, 'constant-mesh-gears', 'layshaft', 'reverse-idler', 'mainshaft']
  return [...clutch, 'constant-mesh-gears', 'layshaft', MAIN_GEAR_PART[gear], HUB_PART[GEAR_HUB[gear]], 'mainshaft']
}
