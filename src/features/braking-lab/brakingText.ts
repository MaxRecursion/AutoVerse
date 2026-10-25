/**
 * Disc-brake laboratory — labels, number formatting and the conceptual
 * colour scales shared by the 3D scene, the 2D diagram and the readouts.
 * Pure (no React, no three.js).
 */
import {
  ABS_SLIP_BAND,
  BAR,
  BRAKE_SPEC,
  G,
  PRESSURE_SCALE_PA,
  SURFACES,
  type AbsValveState,
  type BrakingPhase,
  type StopPlan,
  type StopSummary,
} from './braking'

/* ------------------------------------------------------------------ */
/* Phases                                                               */
/* ------------------------------------------------------------------ */

export const PHASE_LABEL: Record<BrakingPhase, string> = {
  rolling: 'Rolling',
  apply: 'Pressure rising',
  braking: 'Braking',
  'wheel-lock': 'Wheel locked',
  'abs-active': 'ABS cycling',
  stopped: 'Stopped',
}

/** Fallback text when the lesson steps are not available (the lesson steps are the primary source). */
export const PHASE_SUMMARY: Record<BrakingPhase, string> = {
  rolling: 'The car rolls with the pedal up. The pads sit a hair away from the disc, so the wheel turns freely.',
  apply: 'The pedal pushes fluid out of the master cylinder. Pressure rises everywhere in the line at once and the caliper piston squeezes the pads onto the disc.',
  braking: 'The pads rub on the spinning disc. Friction turns the car’s movement energy into heat in the disc and pads, and the car slows steadily.',
  'wheel-lock': 'The brakes ask for more grip than the road can give. The wheel stops turning and the tyre slides, so braking is weaker and the car cannot steer.',
  'abs-active': 'ABS sees the wheel slowing too fast and briefly holds, releases and reapplies the caliper pressure, keeping the tyre near its best grip.',
  stopped:
    'The car is at rest. All of its movement energy has become heat: in the disc and pads while the tyre rolled, and in the tyre and road for any part of the stop it spent sliding.',
}

export const VALVE_LABEL: Record<AbsValveState, string> = {
  inactive: 'Not cycling — inlet open, outlet closed',
  hold: 'Hold — both valves closed',
  release: 'Release — outlet open, pressure falls',
  reapply: 'Reapply — inlet open, pressure climbs',
}

/** Short valve-state names for compact readouts. */
export const VALVE_SHORT: Record<AbsValveState, string> = {
  inactive: 'Idle',
  hold: 'Hold',
  release: 'Release',
  reapply: 'Reapply',
}

/** Which ABS valves are open in each stylised state (inactive = normal braking, fluid passes straight through). */
export function valveOpenings(state: AbsValveState): { inlet: boolean; outlet: boolean } {
  switch (state) {
    case 'release':
      return { inlet: false, outlet: true }
    case 'hold':
      return { inlet: false, outlet: false }
    case 'reapply':
    case 'inactive':
      return { inlet: true, outlet: false }
  }
}

/* ------------------------------------------------------------------ */
/* Number formatting                                                    */
/* ------------------------------------------------------------------ */

const nonNegative = (v: number) => (v > 0 && Number.isFinite(v) ? v : 0)

export const formatSpeed = (metresPerSecond: number) => `${Math.round(nonNegative(metresPerSecond) * 3.6)} km/h`

export function formatPressure(pa: number): string {
  const bar = nonNegative(pa) / BAR
  return `${bar < 10 ? bar.toFixed(1) : Math.round(bar)} bar`
}

export function formatForce(newtons: number): string {
  const n = nonNegative(newtons)
  return n < 1000 ? `${Math.round(n)} N` : `${(n / 1000).toFixed(1)} kN`
}

export const formatDecel = (metresPerSecond2: number) => `${(nonNegative(metresPerSecond2) / G).toFixed(2)} g`

export function formatEnergy(joules: number): string {
  const kj = nonNegative(joules) / 1000
  return `${kj < 10 ? kj.toFixed(1) : Math.round(kj)} kJ`
}

export const formatTemp = (celsius: number) => `${Math.round(celsius)} °C`

export const formatSlip = (slip: number) => `${Math.round(Math.min(1, nonNegative(slip)) * 100)} %`

export const formatSeconds = (s: number) => `${nonNegative(s).toFixed(s < 10 ? 2 : 1)} s`

export const formatMetres = (m: number) => `${nonNegative(m) < 10 ? nonNegative(m).toFixed(1) : Math.round(nonNegative(m))} m`

/* ------------------------------------------------------------------ */
/* Conceptual colour scales                                             */
/* ------------------------------------------------------------------ */

export type Rgb = readonly [number, number, number]

const hexToRgb = (hex: string): Rgb => {
  const n = Number.parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}
const mix = (a: Rgb, b: Rgb, k: number): Rgb => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
const clamp01 = (v: number) => (v <= 0 ? 0 : v >= 1 ? 1 : v)

export const rgbToCss = (c: Rgb) => `rgb(${Math.round(c[0] * 255)} ${Math.round(c[1] * 255)} ${Math.round(c[2] * 255)})`

/**
 * The heat map spans this temperature rise: the hottest single stop the lab's
 * sliders allow (140 km/h, dry, ABS) heats the illustrative disc by roughly 90 K.
 */
export const HEAT_MAP_RISE_K = 90

const HEAT_WARM = hexToRgb('#f6a63a')
const HEAT_HOT = hexToRgb('#ff3a1f')

/**
 * Conceptual heat-map glow for the disc: 0 at the starting temperature,
 * amber as it warms, red at the top of the scale. This is a heat MAP, not
 * incandescence — a real disc only glows visibly above roughly 500 °C.
 */
export function heatGlow(discTempC: number, startTempC = BRAKE_SPEC.startTempC): { color: Rgb; intensity: number } {
  const k = clamp01((discTempC - startTempC) / HEAT_MAP_RISE_K)
  return { color: mix(HEAT_WARM, HEAT_HOT, clamp01((k - 0.25) / 0.75)), intensity: k ** 1.4 }
}

const FLUID = hexToRgb('#38d7f2')

/** Conceptual brake-fluid pressure colour (cyan, brighter with pressure), with 0 = no glow. */
export function pressureGlow(pressurePa: number): { color: Rgb; intensity: number } {
  const k = clamp01(nonNegative(pressurePa) / PRESSURE_SCALE_PA)
  return { color: FLUID, intensity: k ** 0.7 }
}

/* ------------------------------------------------------------------ */
/* Descriptions                                                         */
/* ------------------------------------------------------------------ */

export const surfaceLabel = (plan: StopPlan) => SURFACES[plan.params.surface].label

const MODE_TEXT = {
  'within-grip': 'The brakes stay within the tyre’s grip, so the wheel keeps rolling and ABS never acts.',
  lock: 'Without ABS the brakes ask for more than the tyre’s grip: the wheel locks and the tyre slides.',
  abs: `ABS holds wheel slip near ${Math.round(ABS_SLIP_BAND.low * 100)}–${Math.round(ABS_SLIP_BAND.high * 100)} % (conceptual cycle), so the tyre keeps gripping and steering.`,
} as const

/** One-sentence text alternative for a whole stop (chart caption, fallback, screen readers). */
export function describeStop(plan: StopPlan, summary: StopSummary): string {
  const { speedKmh, pedalN, abs } = plan.params
  return (
    `Stop from ${speedKmh} km/h on ${surfaceLabel(plan).toLowerCase()} with ${pedalN} N on the pedal, ABS ${abs ? 'on' : 'off'}: ` +
    `${formatSeconds(summary.stopTime)} and ${formatMetres(summary.stopDistance)} from pedal to standstill. ` +
    `${MODE_TEXT[plan.mode]} ${formatEnergy(summary.energyTotal)} of movement energy becomes heat; the illustrative disc warms by ${Math.round(summary.discRiseK)} K.`
  )
}

export const modeText = (plan: StopPlan) => MODE_TEXT[plan.mode]
