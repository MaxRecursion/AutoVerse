/**
 * Pure geometry and timing for the Sound Lab's V10 cutaway (Claude's half of
 * the 3D work; Codex's CutawayScene covers the other presets). Every cylinder
 * is the Engine Lab's illustrative single cylinder (engine-lab/engineModel.ts),
 * placed and timed as this engine's. No three.js here.
 *
 * Frame: the crank axis runs along x with the front of the engine at +x,
 * cylinders point up +y, and the camera sits on the +x side. Bank A leans to
 * +z, bank B to −z, by half the bank angle each. Each bank-B cylinder sits one
 * rod width behind its bank-A partner on the same throw, as in a real V10.
 * Bank A's cylinders are mirrored (z → −z) so both banks' exhaust ports face
 * outwards, away from the vee.
 */
import { CRANK_R, DECK_Y } from '@/features/engine-lab/engineModel'
import { VALVE_TIMING } from '@/features/engine-lab/kinematics'
import { crankSections, mod, rotationSense } from './animation'
import { bankOf, type EngineSpec } from './engines'
import { firingEvents, type FiringEvent } from './firing'

const DEG = Math.PI / 180
export type Vec3 = [number, number, number]
export type V10Side = 'A' | 'B'

/** Distance between crank throws along the crankshaft. */
export const THROW_PITCH = 1.25
/** Bank B sits this far behind bank A along the crank: the second rod on each throw. */
export const BANK_STAGGER = 0.2

export const isV10 = (spec: EngineSpec) => spec.cylinders === 10 && spec.layout === 'v'

export interface V10Cylinder {
  event: FiringEvent
  side: V10Side
  /** Crank throw, 0 at the front. */
  throwIndex: number
  /** Position along the crankshaft. */
  x: number
  /** Scale on z for this cylinder's copy of the Engine Lab model: bank A is mirrored so its exhaust faces out. */
  mirror: 1 | -1
}

/** Throw 0 at the front (+x). */
export const throwX = (throwIndex: number) => (2 - throwIndex) * THROW_PITCH

/** The ten cylinders, two per throw, from the preset's own numbering (or its firing order where numbering is not published). */
export function v10Cylinders(spec: EngineSpec, events: FiringEvent[]): V10Cylinder[] {
  return crankSections(spec, events).flatMap((section) =>
    section.cylinders.map(({ event, side }) => {
      const bank: V10Side = side === 'B' ? 'B' : 'A'
      return {
        event,
        side: bank,
        throwIndex: section.slot,
        x: throwX(section.slot) - (bank === 'B' ? BANK_STAGGER : 0),
        mirror: bank === 'A' ? -1 : 1,
      }
    }),
  )
}

/** Lean of a bank about +x (radians): A towards +z, B towards −z. */
export const leanAngle = (side: V10Side, bankAngle: number) => (side === 'A' ? 1 : -1) * (bankAngle / 2) * DEG

/** The Engine Lab's four-stroke angle (valves, gas, spark): firing top dead centre at 360°. */
export const cycleAngle = (playhead: number, firingAngle: number) => mod(playhead - firingAngle + 360, 720)

/**
 * Crank rotation inside a cylinder's (perhaps mirrored) copy of the model, in
 * degrees about +x. Every pin's angle in the scene is then
 * `lean − sense·(playhead − firing)`, which puts both rods of a shared throw
 * on one pin (see `rotationSense`), whichever copy is mirrored.
 */
export const moduleCrankDeg = (sense: 1 | -1, mirror: 1 | -1, playhead: number, firingAngle: number) => -sense * mirror * (playhead - firingAngle)

/** The camshafts turn with the crank (at half speed): +1 or −1 times the Engine Lab's cam angle. */
export const camDirection = (sense: 1 | -1, mirror: 1 | -1) => -sense * mirror

/** A point given in a cylinder's own model frame (z sideways, y up), placed in the scene. */
export function toWorld(side: V10Side, bankAngle: number, x: number, p: { z: number; y: number }): Vec3 {
  const l = leanAngle(side, bankAngle)
  const z = (side === 'A' ? -1 : 1) * p.z
  return [x, p.y * Math.cos(l) - z * Math.sin(l), p.y * Math.sin(l) + z * Math.cos(l)]
}

/** Where a cylinder's crank pin is, with the same transforms the scene applies (Engine Lab pin y = r·cosθ, z = r·sinθ). */
export function crankPinWorld(cylinder: V10Cylinder, bankAngle: number, sense: 1 | -1, playhead: number): Vec3 {
  const t = moduleCrankDeg(sense, cylinder.mirror, playhead, cylinder.event.angle) * DEG
  return toWorld(cylinder.side, bankAngle, cylinder.x, { z: CRANK_R * Math.sin(t), y: CRANK_R * Math.cos(t) })
}

/** Angle (degrees, 0–359) between the two crank pins of a throw: 0 for a shared pin, 18 or 342 for split pins. */
export function throwPinOffset(cylinders: V10Cylinder[], throwIndex: number, bankAngle: number, sense: 1 | -1): number | null {
  const a = cylinders.find((c) => c.throwIndex === throwIndex && c.side === 'A')
  const b = cylinders.find((c) => c.throwIndex === throwIndex && c.side === 'B')
  if (!a || !b) return null
  const angle = (p: Vec3) => Math.atan2(p[2], p[1]) / DEG
  return Math.round(mod(angle(crankPinWorld(b, bankAngle, sense, 0)) - angle(crankPinWorld(a, bankAngle, sense, 0)), 360)) % 360
}

/* ------------------------------------------------------------ exhausts */

/** Exhaust header in a cylinder's own frame: out of the port on the head's side, then down to the collector. */
const HEADER: { z: number; y: number }[] = [
  { z: -0.86, y: 2.55 },
  { z: -1.16, y: 2.52 },
  { z: -1.4, y: 2.3 },
  { z: -1.53, y: 1.96 },
  { z: -1.56, y: 1.62 },
]
/** Where every header of a bank meets its collector (same lean for the whole bank). */
const COLLECTOR = HEADER[HEADER.length - 1]!
/** A bank's own tailpipe, continuing back and down from the collector. */
const BANK_TAIL: { z: number; y: number }[] = [
  { z: -1.45, y: 1.1 },
  { z: -1.32, y: 0.55 },
]

export interface ExhaustLayout {
  headers: { index: number; side: V10Side; points: Vec3[] }[]
  collectors: { side: V10Side; points: Vec3[] }[]
  tailpipes: Vec3[][]
  /** Full route of each cylinder's exhaust pulse, port to outlet. */
  routes: Map<number, Vec3[]>
}

/**
 * Headers, a collector along each bank and the tailpipes. With separate bank
 * exhausts each bank keeps its own pipe (what each ear hears); a shared exhaust
 * joins the banks into one pipe behind the engine.
 */
export function exhaustLayout(cylinders: V10Cylinder[], bankAngle: number, shared: boolean): ExhaustLayout {
  const xFront = throwX(0) + 0.45
  const xRear = throwX(4) - BANK_STAGGER - 0.85
  const collectors = (['A', 'B'] as const).map((side) => ({
    side,
    points: [toWorld(side, bankAngle, xFront, COLLECTOR), toWorld(side, bankAngle, xRear, COLLECTOR)],
  }))
  const bankTail = (side: V10Side): Vec3[] => [
    toWorld(side, bankAngle, xRear, COLLECTOR),
    toWorld(side, bankAngle, xRear - 0.55, BANK_TAIL[0]!),
    toWorld(side, bankAngle, xRear - 1.5, BANK_TAIL[1]!),
  ]
  let tailpipes: Vec3[][]
  let tailFor: (side: V10Side) => Vec3[]
  if (shared) {
    const ends = collectors.map((c) => c.points[1]!)
    const mergeY = Math.min(...ends.map((p) => p[1])) - 0.35
    const merge: Vec3 = [xRear - 0.95, mergeY, 0]
    const outlet: Vec3 = [xRear - 2.1, mergeY - 0.15, 0]
    const joint = (side: V10Side): Vec3[] => {
      const end = collectors.find((c) => c.side === side)!.points[1]!
      return [end, [xRear - 0.5, (end[1] + mergeY) / 2, end[2] * 0.45], merge]
    }
    tailpipes = [joint('A'), joint('B'), [merge, outlet]]
    tailFor = (side) => [...joint(side), outlet]
  } else {
    tailpipes = [bankTail('A'), bankTail('B')]
    tailFor = bankTail
  }
  const headers = cylinders.map((c) => ({ index: c.event.index, side: c.side, points: HEADER.map((p) => toWorld(c.side, bankAngle, c.x, p)) }))
  const routes = new Map<number, Vec3[]>()
  for (const h of headers) routes.set(h.index, [...h.points, ...tailFor(h.side)])
  return { headers, collectors, tailpipes, routes }
}

export function pathLength(path: Vec3[]): number {
  let total = 0
  for (let i = 1; i < path.length; i++) total += Math.hypot(path[i]![0] - path[i - 1]![0], path[i]![1] - path[i - 1]![1], path[i]![2] - path[i - 1]![2])
  return total
}

/** The point `distance` along a polyline (clamped to its ends). */
export function pointAlong(path: Vec3[], distance: number): Vec3 {
  if (path.length === 0) return [0, 0, 0]
  let left = Math.max(0, distance)
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!
    const b = path[i]!
    const step = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
    if (left <= step && step > 0) {
      const t = left / step
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
    }
    left -= step
  }
  return [...path[path.length - 1]!]
}

/** A pulse leaves when the exhaust valve opens (the Engine Lab's EVO). */
export const PULSE_START = VALVE_TIMING.exhaust.opens
/** Crank degrees the longest route takes; shorter routes finish sooner at the same speed. */
export const PULSE_TRAVEL_DEG = 520

/**
 * Where a cylinder's exhaust pulse is along its route. Every pulse moves at
 * the same speed, so pulses that share a pipe are spaced by their firing gaps.
 */
export function pulseAt(cycle: number, routeLength: number, speed: number): { distance: number; visible: boolean; heat: number } {
  const since = mod(cycle - PULSE_START, 720)
  const distance = since * speed
  const visible = distance <= routeLength && since < 700
  return { distance, visible, heat: visible ? 1 - 0.55 * (distance / routeLength) : 0 }
}

/* ------------------------------------------------------------ views and camera */

export type V10View = 'engine' | 'pair'

export interface CameraPose {
  position: Vec3
  target: Vec3
}

const FOV = 38

/**
 * Camera for the whole engine or one throw, fitted to a canvas of this aspect
 * ratio. Both look mostly from the front: every bore is cut open on its
 * front face, so that is where the pistons show, in both banks at once.
 */
export function v10Framing(view: V10View, bankAngle: number, aspect: number): CameraPose {
  const h = (bankAngle / 2) * DEG
  const tanHalf = Math.tan((FOV / 2) * DEG)
  const a = Math.max(0.35, aspect || 1)
  if (view === 'pair') {
    // Two cylinders leaning apart: about 2 × (head reach) wide, block bottom to cam tops tall.
    const width = 2 * (3.75 * Math.sin(h) + 0.95 * Math.cos(h)) + 0.6
    const height = 3.75 * Math.cos(h) + 0.95 * Math.sin(h) + 1.0
    const target: Vec3 = [0, height / 2 - 0.95, 0]
    const distance = Math.max(width / (2 * tanHalf * a), height / (2 * tanHalf)) * 0.98 + 0.5
    const dir = [0.93, 0.24, 0.28]
    const n = Math.hypot(...dir)
    return { position: [target[0] + (distance * dir[0]!) / n, target[1] + (distance * dir[1]!) / n, target[2] + (distance * dir[2]!) / n], target }
  }
  // Across the banks (exhausts included) and from the crank's sweep up to the cams.
  const width = 2 * (4.05 * Math.sin(h) + 1.6 * Math.cos(h))
  const height = 4.1 * Math.cos(h) + 1.6
  const target: Vec3 = [-0.2, height / 2 - 0.85, 0]
  // Seen obliquely the row looks narrower than its full width, so phones can sit a little closer.
  const distance = Math.max(width / (2 * tanHalf * a), height / (2 * tanHalf)) * (a < 1 ? 1.02 : 1.28) + (a < 1 ? 2.2 : 3.2)
  const dir = [0.84, 0.42, 0.34]
  const n = Math.hypot(...dir)
  return { position: [target[0] + (distance * dir[0]!) / n, target[1] + (distance * dir[1]!) / n, target[2] + (distance * dir[2]!) / n], target }
}

/* ------------------------------------------------------------ words */

/** Label for a throw's button: its two cylinders, or "A · B" when numbering is not published. */
export const throwLabel = (cylinders: V10Cylinder[], throwIndex: number) =>
  cylinders
    .filter((c) => c.throwIndex === throwIndex)
    .sort((x, y) => (x.side < y.side ? -1 : 1))
    .map((c) => c.event.cylinder ?? c.side)
    .join(' · ')

/** How the two rods of a throw share the crank, in words. */
export function describeThrow(offset: number | null): string {
  if (offset === null) return ''
  if (offset === 0) return 'Both rods ride one shared crankpin.'
  const split = Math.min(offset, 360 - offset)
  return `The two crankpins are split ${split}° apart.`
}

/** Everything the scene needs for a V10 preset, from its production firing order. */
export function v10Model(spec: EngineSpec) {
  const production = firingEvents(spec.intervals, spec.order, bankOf(spec))
  const cylinders = v10Cylinders(spec, production)
  return { cylinders, sense: rotationSense(spec, production) }
}

/** Height of the deck above the crank axis, for placing labels. */
export const LABEL_HEIGHT = DECK_Y + 2.05
