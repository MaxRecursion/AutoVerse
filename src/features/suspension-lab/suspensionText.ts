/**
 * Wording and number formatting for the suspension lab (pure). Shared by the
 * readouts, the explanation panel, the 2D diagram and the scene's text
 * alternative, so every view words the same state the same way.
 */
import {
  BASE_PARAMS,
  DAMPING_PRESETS,
  ROAD_INPUTS,
  bodyFrequency,
  staticTyreLoad,
  wheelHopFrequency,
  type DampingPreset,
  type QuarterCarResponse,
  type ResponsePhase,
  type SuspensionSettings,
} from './quarterCar'
import type { SuspensionFrame } from './suspensionModel'

const MINUS = '−'

/** Signed millimetres, e.g. "+12 mm", "−3 mm", "0 mm". */
export function formatMm(metres: number): string {
  const mm = Math.round(metres * 1000)
  if (mm === 0) return '0 mm'
  return `${mm > 0 ? '+' : MINUS}${Math.abs(mm)} mm`
}

/** Suspension travel in words: "24 mm bump", "9 mm rebound", "at ride height". */
export function formatTravel(travel: number): string {
  const mm = Math.round(travel * 1000)
  if (mm === 0) return 'at ride height'
  return `${Math.abs(mm)} mm ${mm > 0 ? 'bump' : 'rebound'}`
}

/** Tyre load relative to the static weight on the corner: "1.25 × static" or "off the road". */
export function formatLoad(loadFactor: number, contact: boolean): string {
  if (!contact) return 'off the road'
  return `${loadFactor.toFixed(2)} × static`
}

/** Tyre force in kilonewtons, e.g. "3.3 kN". */
export const formatKn = (newtons: number) => `${(Math.max(0, newtons) / 1000).toFixed(1)} kN`

export const formatHz = (hz: number) => `${hz.toFixed(hz < 3 ? 1 : 0)} Hz`

/** Camber change in degrees with the conventional sign: "−1.2°" (top of the wheel in). */
export function formatCamber(deg: number): string {
  const r = Math.round(deg * 10) / 10
  if (r === 0) return '0.0°'
  return `${r > 0 ? '+' : MINUS}${Math.abs(r).toFixed(1)}°`
}

export const dampingLabel = (preset: DampingPreset) => DAMPING_PRESETS.find((p) => p.id === preset)?.label ?? preset
export const roadLabel = (road: SuspensionSettings['road']) => ROAD_INPUTS.find((r) => r.id === road)?.label ?? road

/** "Single bump · Balanced damper · 25 N/mm spring" */
export const settingsSummary = (s: SuspensionSettings) => `${roadLabel(s.road)} · ${dampingLabel(s.damping)} damper · ${s.springRate} N/mm spring`

/** Short fallback text for each phase (the lesson steps carry the full explanations). */
export const PHASE_SUMMARY: Record<ResponsePhase, string> = {
  approach: 'Cruising on smooth road: the spring holds the body up at its ride height and the tyre carries a steady load.',
  compression: 'The road pushes the wheel up. The control arms swing up, the spring shortens and the damper resists the motion.',
  rebound: 'The spring pushes back and the wheel extends down again; the damper slows the rebound so the body does not bounce.',
  ripples: 'Small, quick ripples are soaked up mostly by the tyre and the wheel moving on its spring — the heavy body barely follows.',
  settle: 'The damper turns what is left of the movement into heat and the car settles back to its ride height.',
}

export const PHASE_LABEL: Record<ResponsePhase, string> = {
  approach: 'Approach',
  compression: 'Compression (bump)',
  rebound: 'Rebound',
  ripples: 'Ripples',
  settle: 'Settling',
}

/** Suspension motion in plain words from the travel velocity (m/s, + = compressing). */
export function suspensionMotionLabel(travelVelocity: number): string {
  if (Math.abs(travelVelocity) < 0.01) return 'Nearly still'
  return travelVelocity > 0 ? 'Compressing' : 'Extending'
}

/** Natural frequencies of the current setup (illustrative model values). */
export function frequencies(springRateNmm: number) {
  const p = { ...BASE_PARAMS, springRate: springRateNmm * 1000 }
  return { body: bodyFrequency(p), wheelHop: wheelHopFrequency(p) }
}

/** One-line verdict on a whole lap's response — what the reader should notice. */
export function responseVerdict(r: QuarterCarResponse): string {
  const s = r.stats
  const range = `the body moved between ${formatMm(s.minBody)} and ${formatMm(s.maxBody)}`
  const contact = s.contactLost
    ? `the tyre left the road for ${Math.round(s.airborneSeconds * 1000)} ms in total`
    : `the tyre stayed on the road (lightest moment ${Math.round((s.minTyreForce / staticTyreLoad(r.params)) * 100)}% of its static load)`
  const stop = s.stopHit ? ' and the suspension reached its rubber stop' : ''
  return `Over this lap ${range}; ${contact}${stop}.`
}

/** Text alternative for the scene at an instant (used by the 2D diagram and tests). */
export function describeFrame(f: SuspensionFrame): string {
  const { pose, link } = f
  return (
    `${PHASE_LABEL[pose.phase]}. Body ${formatMm(pose.body)}, wheel ${formatMm(pose.wheel)}, ` +
    `suspension ${formatTravel(pose.travel)}, tyre load ${formatLoad(pose.loadFactor, pose.contact)}, ` +
    `camber change ${formatCamber(link.camberChangeDeg)}.`
  )
}
