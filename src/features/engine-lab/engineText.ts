/**
 * Plain-language readouts derived from the engine state — pure, shared by the
 * explanation panel, scene readouts, the 2D section's text alternative and
 * tests. Wording here is AutoVerse's own.
 */
import {
  SPARK_ANGLE,
  STROKES,
  inOverlap,
  mod,
  strokeIndex,
  strokeLabel,
  type EngineState,
  type PistonMotion,
  type StrokeId,
} from './kinematics'

/** Momentary events worth calling out while a stroke plays (each has a step in the four-stroke lesson). */
export type EngineEvent = 'overlap' | 'spark'

/** Crank-angle window (degrees) in which the spark callout is shown: from just before the spark to just after firing TDC. */
export const SPARK_CALLOUT = { from: SPARK_ANGLE - 5, to: 375 } as const

/**
 * The event happening at a crank angle, if any. Discrete on purpose: React
 * selectors built on it only re-render when the event changes. (TDC and BDC
 * are reported by pistonMotionLabel instead.)
 */
export function engineEventAt(crankDeg: number): EngineEvent | null {
  const t = mod(Math.round(crankDeg * 1e6) / 1e6, 720)
  if (inOverlap(t)) return 'overlap'
  if (t >= SPARK_CALLOUT.from && t < SPARK_CALLOUT.to) return 'spark'
  return null
}

export const EVENT_LABEL: Record<EngineEvent, string> = {
  overlap: 'Valve overlap',
  spark: 'Ignition',
}

export function pistonMotionLabel(motion: PistonMotion): string {
  switch (motion) {
    case 'up':
      return 'Moving up'
    case 'down':
      return 'Moving down'
    case 'tdc':
      return 'At top dead centre'
    case 'bdc':
      return 'At bottom dead centre'
  }
}

/** Valve state for readouts, e.g. "Closed" or "62% open". */
export function valveStateLabel(openFraction: number): string {
  const pct = Math.round(openFraction * 100)
  if (pct <= 0) return openFraction > 0 ? 'Cracking open' : 'Closed'
  return `${pct}% open`
}

/** Whole degrees, floored so a readout never claims the next stroke early. */
export const formatDegrees = (deg: number) => `${Math.floor(deg + 1e-6)}°`

/** Camshaft angle with half-degree resolution (it turns at half crank speed). */
export const formatCamDegrees = (deg: number) => `${(Math.floor(deg * 2 + 1e-6) / 2).toFixed(1)}°`

/** Crank-angle range of a stroke, e.g. "0–180°". */
export function strokeRange(id: StrokeId): string {
  const s = STROKES[strokeIndex(id)]
  return `${s.start}–${s.end}°`
}

/** Conceptual description of the cylinder contents. */
export function gasStateLabel(state: EngineState): string {
  switch (state.stroke) {
    case 'intake':
      return 'Fresh charge flowing in'
    case 'compression':
      return state.burn > 0 ? 'Flame starting' : state.intakeOpen > 0 ? 'Charge trapped as the valve closes' : 'Charge being squeezed'
    case 'power':
      return state.exhaustOpen > 0 ? 'Blow-down: hot gas escaping' : state.combustion > 0.15 ? 'Burning, pushing the piston' : 'Expanding'
    case 'exhaust':
      return 'Burnt gas being pushed out'
  }
}

/**
 * Stroke-level summary for live regions: it only changes when the stroke
 * changes, so screen readers are not flooded while the animation plays.
 */
export const STROKE_SUMMARY: Record<StrokeId, string> = {
  intake: 'Intake stroke: the piston moves down while the intake valve is open, drawing in fresh air and fuel.',
  compression: 'Compression stroke: both valves are shut and the rising piston squeezes the charge; the spark fires just before the top.',
  power: 'Power stroke: burning gas at high pressure drives the piston down and turns the crankshaft.',
  exhaust: 'Exhaust stroke: the exhaust valve is open and the rising piston pushes the burnt gas out.',
}

/**
 * One-sentence text alternative of the current pose, for screen readers and
 * the 2D section caption.
 */
export function describeEngineState(state: EngineState): string {
  const parts = [
    `${strokeLabel(state.stroke)} stroke, crank ${formatDegrees(state.crankDeg)}`,
    `piston ${pistonMotionLabel(state.motion).toLowerCase()}`,
    `intake valve ${valveStateLabel(state.intakeOpen).toLowerCase()}`,
    `exhaust valve ${valveStateLabel(state.exhaustOpen).toLowerCase()}`,
  ]
  if (state.spark > 0) parts.push('spark plug firing')
  return `${parts.join(', ')}.`
}
