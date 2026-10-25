/**
 * Plain-language labels and number formatting for the gearbox lab — pure,
 * shared by the readouts, controls, explanation panel, 2D schematic and
 * tests. Wording is AutoVerse's own.
 */
import {
  CLUTCH,
  HEAD_PAIR,
  REVERSE_TRAIN,
  SPEED_PAIRS,
  clutchEngagement,
  clutchState,
  clutchTorqueFraction,
  gearKind,
  type ClutchState,
  type DriveOutputs,
  type GearId,
  type IndirectGearId,
} from './gearbox'

export const GEAR_SHORT: Record<GearId, string> = { N: 'N', '1': '1', '2': '2', '3': '3', '4': '4', '5': '5', R: 'R' }

export const GEAR_NAME: Record<GearId, string> = {
  N: 'Neutral',
  '1': '1st gear',
  '2': '2nd gear',
  '3': '3rd gear',
  '4': '4th gear',
  '5': '5th gear',
  R: 'Reverse',
}

export const CLUTCH_STATE_LABEL: Record<ClutchState, string> = {
  engaged: 'Engaged (locked)',
  slipping: 'Slipping',
  biting: 'At the bite point',
  disengaged: 'Disengaged',
}

/** One-line summary per gear, used when a lesson step is not available. */
export const GEAR_SUMMARY: Record<GearId, string> = {
  N: 'No collar is engaged. The input shaft, layshaft and every mainshaft gear spin, but the mainshaft is not locked to any of them, so no power reaches the output.',
  '1': 'The 1–2 collar locks the largest mainshaft gear. Two reductions in a row give the biggest torque multiplication and the slowest output.',
  '2': 'The 1–2 collar slides the other way and locks 2nd. Less reduction than 1st, so the output turns faster with less torque.',
  '3': 'The 3–4 collar locks 3rd. The ratio is now close to the engine’s own speed range for town driving.',
  '4': 'Direct drive: the 3–4 collar locks the mainshaft straight to the input pinion. The layshaft still spins but carries no torque, so the ratio is exactly 1 : 1.',
  '5': 'Overdrive: the layshaft’s largest gear drives a small mainshaft gear, so the output turns faster than the engine for relaxed cruising.',
  R: 'A sliding idler gear is placed between the layshaft and the mainshaft reverse gear. The extra mesh reverses the output’s direction.',
}

export const CLUTCH_SUMMARY: Record<ClutchState, string> = {
  engaged: 'The diaphragm spring clamps the disc between flywheel and pressure plate, so engine and gearbox turn as one.',
  slipping: 'The clamp is partly released: the disc is dragged round, but slower than the flywheel. The speed difference turns some power into heat.',
  biting: 'The plate is just starting to grip the disc: a small share of the engine’s torque is getting through.',
  disengaged: 'The release bearing has pushed the diaphragm fingers and the plate has lifted off: the disc and gearbox are disconnected from the engine.',
}

/** "2.13 : 1", or "3.51 : 1 reversed" for a negative ratio; "—" in neutral. */
export function formatRatio(ratio: number | null, digits = 2): string {
  if (ratio === null) return '—'
  return `${Math.abs(ratio).toFixed(digits)} : 1${ratio < 0 ? ' reversed' : ''}`
}

const groupThousands = (n: number) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')

/** Whole rpm rounded to 10, with a true minus sign for reverse: "−1,240 rpm". */
export function formatRpm(rpm: number): string {
  const r = Math.round(rpm / 10) * 10
  if (r === 0) return '0 rpm'
  return `${r < 0 ? '−' : ''}${groupThousands(Math.abs(r))} rpm`
}

export function formatTorque(nm: number): string {
  const r = Math.round(nm)
  return `${r < 0 ? '−' : ''}${groupThousands(Math.abs(r))} N·m`
}

/** "× 2.09" torque multiplication; "—" when nothing is transmitted. */
export const formatMultiplication = (m: number) => (m > 0 ? `× ${m.toFixed(2)}` : '—')

/** "≈ 28 km/h", "≈ 9 km/h backwards", "0 km/h". */
export function formatRoadSpeed(kmh: number): string {
  const r = Math.round(kmh)
  if (r === 0) return '0 km/h'
  return `≈ ${Math.abs(r)} km/h${r < 0 ? ' backwards' : ''}`
}

export const formatPercent = (f: number) => `${Math.round(f * 100)}%`

export const formatKw = (kw: number) => `${kw.toFixed(kw < 10 ? 1 : 0)} kW`

/** The tooth-count arithmetic behind a gear: "34/20 × 30/24". */
export function trainExpression(gear: GearId): string {
  const head = `${HEAD_PAIR.driven}/${HEAD_PAIR.driver}`
  switch (gearKind(gear)) {
    case 'neutral':
      return 'No gear engaged'
    case 'direct':
      return 'Input locked to output'
    case 'reverse':
      return `${head} × ${REVERSE_TRAIN.idler}/${REVERSE_TRAIN.driver} × ${REVERSE_TRAIN.driven}/${REVERSE_TRAIN.idler}`
    case 'indirect': {
      const pair = SPEED_PAIRS[gear as IndirectGearId]
      return `${head} × ${pair.driven}/${pair.driver}`
    }
  }
}

/** Clutch pedal description for the slider's accessible value. */
export function clutchPedalText(pedal: number): string {
  const f = clutchTorqueFraction(clutchEngagement(pedal))
  const travel = `${Math.round(pedal * 100)}% pressed`
  switch (clutchState(pedal)) {
    case 'engaged':
      return pedal <= CLUTCH.freePlay ? `${travel}, clutch fully engaged` : `${travel}, clutch still locked`
    case 'disengaged':
      return `${travel}, clutch disengaged`
    case 'biting':
    case 'slipping':
      return `${travel}, clutch slipping, ${formatPercent(f)} of engine torque passed on`
  }
}

/** Short clutch state for compact UI. */
export function clutchShortLabel(pedal: number): string {
  switch (clutchState(pedal)) {
    case 'engaged':
      return 'Engaged'
    case 'slipping':
      return 'Slipping'
    case 'biting':
      return 'Bite point'
    case 'disengaged':
      return 'Disengaged'
  }
}

/** Screen-reader summary of the whole operating point. */
export function describeDrive(d: DriveOutputs): string {
  const clutch = CLUTCH_STATE_LABEL[d.clutch].toLowerCase()
  if (d.ratio === null) return `${GEAR_NAME[d.gear]}, clutch ${clutch}. The gears spin but nothing drives the output.`
  if (d.torqueFraction <= 0) return `${GEAR_NAME[d.gear]} selected, clutch ${clutch}: no power reaches the gearbox.`
  return (
    `${GEAR_NAME[d.gear]}, ratio ${formatRatio(d.ratio)}, clutch ${clutch}. ` +
    `Engine ${formatRpm(d.engineRpm)}, output ${formatRpm(d.outputRpm)}, torque ${formatMultiplication(d.torqueMultiplication)}, road speed ${formatRoadSpeed(d.roadSpeedKmh)}.`
  )
}
