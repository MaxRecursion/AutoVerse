/**
 * Pure helpers behind the Sound Lab's moving diagrams: the slowed visual
 * crank, which firings it passed between two frames, crank-pin and piston
 * geometry for the cylinder sections, and a tiny per-frame message bus.
 * No DOM, no audio, no React.
 */
import type { EngineSpec } from './engines'
import type { FiringEvent } from './firing'
import type { CycleSnapshot } from './synth'

/** How much slower than real time the diagrams turn, so the eye can follow them. */
export const VISUAL_SLOWDOWN = 40

export const DEG = Math.PI / 180
export const mod = (v: number, m: number) => ((v % m) + m) % m

/** Crank degrees the slowed visual crank turns in `dt` seconds at `rpm`. */
export const visualStep = (rpm: number, dt: number) => (Math.max(0, rpm) * 6 * Math.max(0, dt)) / VISUAL_SLOWDOWN

/** Exponential approach: after `tau` seconds about 63% of the way to `target`. */
export function ease(current: number, target: number, dt: number, tau: number): number {
  if (tau <= 0 || !Number.isFinite(current)) return target
  return target + (current - target) * Math.exp(-dt / tau)
}

/**
 * Firings passed when the crank moves forward `step` degrees from `from`
 * (wrapping at 720°), in the order they happened.
 */
export function crossedEvents(events: FiringEvent[], from: number, step: number): number[] {
  if (!(step > 0)) return []
  if (step >= 720) return events.map((e) => e.index)
  return events
    .map((e) => ({ index: e.index, ahead: mod(e.angle - from, 720) }))
    .filter((e) => e.ahead > 0 && e.ahead <= step)
    .sort((a, b) => a.ahead - b.ahead)
    .map((e) => e.index)
}

/* ------------------------------------------------------------ crank sections */

export type Side = 'A' | 'B' | 'mid'

export interface SectionCylinder {
  event: FiringEvent
  side: Side
}

/** One position along the crankshaft: one cylinder (inline) or one from each bank. */
export interface CrankSection {
  slot: number
  cylinders: SectionCylinder[]
}

/**
 * Cylinders grouped by position along the crank, front first, in the maker's
 * numbering. Engines without a published order pair their firings by bank.
 */
export function crankSections(spec: EngineSpec, events: FiringEvent[]): CrankSection[] {
  if (spec.layout === 'inline') {
    return Array.from({ length: spec.cylinders }, (_, i) => {
      const event = events.find((e) => e.cylinder === i + 1) ?? events[i]
      return { slot: i, cylinders: event ? [{ event, side: 'mid' as const }] : [] }
    })
  }
  const byBank = (bank: 'A' | 'B') => {
    const numbers = bank === 'A' ? spec.bankA : spec.bankB
    return numbers.length ? numbers.map((c) => events.find((e) => e.cylinder === c)) : events.filter((e) => e.bank === bank)
  }
  const a = byBank('A')
  const b = byBank('B')
  return Array.from({ length: spec.cylinders / 2 }, (_, i) => {
    const cylinders: SectionCylinder[] = []
    if (a[i]) cylinders.push({ event: a[i], side: 'A' })
    if (b[i]) cylinders.push({ event: b[i], side: 'B' })
    return { slot: i, cylinders }
  })
}

/** Bore axis of a bank, in degrees clockwise from straight up: bank A leans left, bank B right. */
export const bankAxis = (side: Side, bankAngle: number) => (side === 'A' ? -bankAngle / 2 : side === 'B' ? bankAngle / 2 : 0)

const circularDistance = (a: number, b: number) => {
  const d = mod(a - b, 360)
  return Math.min(d, 360 - d)
}

/**
 * Which way the crank must turn in the drawing (+1 clockwise, −1 anticlockwise)
 * for the maker's numbering and firing order to agree with bank A on the left.
 * With shared crankpins the B-bank cylinder of a pair reaches the top one bank
 * angle after A when turning clockwise, or one bank angle before it when
 * turning the other way; the pairs vote. Use the production firing order, so
 * an experiment never reverses the crank.
 */
export function rotationSense(spec: EngineSpec, events: FiringEvent[]): 1 | -1 {
  if (spec.layout === 'inline') return 1
  const angle = spec.layout === 'flat' ? 180 : spec.bankAngle
  let vote = 0
  for (const { cylinders } of crankSections(spec, events)) {
    const [a, b] = cylinders
    if (!a || !b) continue
    const delta = mod(b.event.angle - a.event.angle, 360)
    const clockwise = circularDistance(delta, angle)
    const anticlockwise = circularDistance(delta, 360 - angle)
    vote += clockwise < anticlockwise ? 1 : clockwise > anticlockwise ? -1 : 0
  }
  return vote < 0 ? -1 : 1
}

/**
 * Crank-pin angle seen from a cylinder's own bore (clockwise from its axis,
 * 0 = top dead centre), with the slowed crank at `playhead`. Each cylinder is
 * at top dead centre on its firing angle.
 */
export const localPinAngle = (sense: 1 | -1, playhead: number, firingAngle: number) => sense * (playhead - firingAngle)

/** The same pin angle in the drawing's frame: where the throw actually points. */
export const absolutePinAngle = (side: Side, bankAngle: number, sense: 1 | -1, playhead: number, firingAngle: number) =>
  mod(bankAxis(side, bankAngle) + localPinAngle(sense, playhead, firingAngle), 360)

/** Drawing units: crank throw radius and connecting-rod length. */
export const CRANK_RADIUS = 16
export const ROD_LENGTH = 50

/** Distance from crank centre to piston pin for a pin angle: the slider-crank, rod length constant. */
export function pistonPinDistance(pinDeg: number, r = CRANK_RADIUS, l = ROD_LENGTH): number {
  const t = pinDeg * DEG
  const s = r * Math.sin(t)
  return r * Math.cos(t) + Math.sqrt(l * l - s * s)
}

/* ------------------------------------------------------------ combustion cues */

/** Flame in the chamber: brightest at the firing, gone by the end of the power stroke. */
export const combustionGlow = (phase: number) => {
  const p = mod(phase, 720)
  return p < 160 ? (1 - p / 160) ** 1.5 : 0
}

/** Ignition: a brief flash at the firing angle (the spark, or a diesel's injected fuel lighting). */
export const ignitionFlash = (phase: number) => {
  const p = mod(phase, 720)
  return p < 24 ? 1 - p / 24 : 0
}

/** Exhaust blowdown: the valve opens before bottom dead centre and the pulse leaves during the exhaust stroke. */
export function exhaustPuff(phase: number): { strength: number; travel: number } {
  const p = mod(phase, 720)
  if (p < 140 || p > 360) return { strength: 0, travel: 0 }
  const u = (p - 140) / 220
  return { strength: Math.sin(Math.PI * Math.sqrt(u)) ** 2, travel: u }
}

/* ------------------------------------------------------------ rev counter */

/** Degrees of dial the rev counter sweeps from 0 to its top reading. */
export const DIAL_SWEEP = 240

/** Rev-counter needle angle (degrees clockwise from straight up) on a dial reading to `max` rpm. */
export function dialAngle(rpm: number, max: number): number {
  return -DIAL_SWEEP / 2 + DIAL_SWEEP * Math.min(1.03, Math.max(0, rpm / max))
}

/* ------------------------------------------------------------ frame bus */

export interface EngineFrame {
  /** Slowed crank angle, 0–720. Frozen while the engine is stopped. */
  playhead: number
  running: boolean
  /** Running and motion allowed: diagrams may move. */
  animate: boolean
  /** Engine speed the synthesiser is actually at (smoothed), 0 when stopped. */
  rpm: number
  limiting: boolean
  /** Bank angle as drawn, easing towards the chosen one. */
  bank: number
  /** Firings the slowed crank passed since the previous frame. */
  fired: number[]
  cycle: CycleSnapshot | null
  /** Seconds since the previous frame. */
  dt: number
  /** Frame timestamp (ms). */
  now: number
}

export interface FrameBus {
  publish(frame: EngineFrame): void
  /** Called with the latest frame straight away (if any), then every frame. */
  subscribe(listener: (frame: EngineFrame) => void): () => void
  readonly last: EngineFrame | null
}

export function createFrameBus(): FrameBus {
  const listeners = new Set<(frame: EngineFrame) => void>()
  let last: EngineFrame | null = null
  return {
    publish(frame) {
      last = frame
      for (const listener of listeners) listener(frame)
    },
    subscribe(listener) {
      listeners.add(listener)
      if (last) listener(last)
      return () => {
        listeners.delete(listener)
      }
    },
    get last() {
      return last
    },
  }
}
