/**
 * Pure exhaust plumbing and gas-flow timing shared by the Sound Lab's two 3D
 * cutaways (CutawayScene and V10Scene). No three.js here.
 *
 * Plumbing: every cylinder gets the same header in its own model frame (out
 * of the Engine Lab head's exhaust port, then down), each bank a collector
 * along the crank, and either a tailpipe per bank or one pipe shared by both
 * banks behind the engine. The scene supplies `place`, which puts a
 * model-frame point into the scene for a bank (leaning it, and mirroring a
 * bank so its port faces out), so one recipe serves inline, boxer and V
 * layouts. The rear of the engine is −x in both scenes.
 *
 * Flow: gas leaves a port only while its exhaust valve is open (a blowdown
 * burst as the valve cracks, then the piston pushing out the rest) and moves
 * along its route at one speed in scene units per crank degree, so the firing rhythm and each route’s length determine when gas arrives in
 * the shared pipes. Past the
 * outlet it slows, spreads and cools as it mixes with the air.
 */
import { VALVE_TIMING, valveDuration, valveOpenFraction } from '@/features/engine-lab/kinematics'
import { mod } from './animation'

export type Vec3 = [number, number, number]
export type ExhaustSide = 'A' | 'B' | 'mid'
export interface ModelPoint {
  z: number
  y: number
}

/* ------------------------------------------------------------ plumbing */

/** Header in a cylinder's own model frame: out of the port on the head's side (z = −0.86), then down to the collector. */
export const HEADER: readonly ModelPoint[] = [
  { z: -0.86, y: 2.55 },
  { z: -1.16, y: 2.52 },
  { z: -1.4, y: 2.3 },
  { z: -1.53, y: 1.96 },
  { z: -1.56, y: 1.62 },
]
/** Where every header of a bank meets its collector (the same lean for the whole bank). */
export const COLLECTOR: ModelPoint = HEADER[HEADER.length - 1]!
/** A bank's own tailpipe, continuing back and down from the collector. */
const BANK_TAIL: readonly ModelPoint[] = [
  { z: -1.45, y: 1.1 },
  { z: -1.32, y: 0.55 },
]
/** Header pipe radius, and the collector and tailpipe radius. */
export const HEADER_RADIUS = 0.068
export const COLLECTOR_RADIUS = 0.105
/** Gas stays inside the pipe wall; shared by its geometry and the camera bounds. */
export const GAS_FILL = 0.74
/** The single-cylinder views stop each header a little past the bend, where the collector would be. */
export const STUB_RUN = 0.7

export interface PlumbingCylinder {
  /** Firing-event index: the key of the cylinder's route. */
  index: number
  side: ExhaustSide
  /** Position along the crankshaft. */
  x: number
}

/** Puts a point given in a bank's cylinder model frame (z sideways, y up) at `x` along the crank in the scene. */
export type Place = (side: ExhaustSide, x: number, p: ModelPoint) => Vec3

export interface ExhaustPlumbing {
  headers: { index: number; side: ExhaustSide; points: Vec3[] }[]
  collectors: { side: ExhaustSide; points: Vec3[] }[]
  tailpipes: Vec3[][]
  /** Full route of each cylinder's gas, port to outlet. */
  routes: Map<number, Vec3[]>
  /** The same route as connected visible pipe curves, so gas never rounds a junction differently from its pipe. */
  routeSegments: Map<number, Vec3[][]>
}

/**
 * Headers, a collector along each bank and the tailpipes. With separate bank
 * exhausts each bank keeps its own pipe (what each ear hears); a shared
 * exhaust joins the banks into one pipe behind the engine. An inline engine
 * has one bank and so one pipe either way.
 */
export function exhaustPlumbing(cylinders: PlumbingCylinder[], place: Place, options: { xFront: number; xRear: number; shared: boolean }): ExhaustPlumbing {
  const { xFront, xRear, shared } = options
  const sides = [...new Set(cylinders.map((c) => c.side))]
  const collectors = sides.map((side) => ({ side, points: [place(side, xFront, COLLECTOR), place(side, xRear, COLLECTOR)] }))
  const bankTail = (side: ExhaustSide): Vec3[] => [
    place(side, xRear, COLLECTOR),
    place(side, xRear - 0.55, BANK_TAIL[0]!),
    place(side, xRear - 1.5, BANK_TAIL[1]!),
  ]
  let tailpipes: Vec3[][]
  let tailSegmentsFor: (side: ExhaustSide) => Vec3[][]
  if (shared && sides.length > 1) {
    const ends = collectors.map((c) => c.points[1]!)
    const mergeY = Math.min(...ends.map((p) => p[1])) - 0.35
    const merge: Vec3 = [xRear - 0.95, mergeY, 0]
    const outlet: Vec3 = [xRear - 2.1, mergeY - 0.15, 0]
    const joint = (side: ExhaustSide): Vec3[] => {
      const end = collectors.find((c) => c.side === side)!.points[1]!
      return [end, [xRear - 0.5, (end[1] + mergeY) / 2, end[2] * 0.45], merge]
    }
    const joints = new Map(sides.map((side) => [side, joint(side)]))
    const sharedTail: Vec3[] = [merge, outlet]
    tailpipes = [...joints.values(), sharedTail]
    tailSegmentsFor = (side) => [joints.get(side)!, sharedTail]
  } else {
    const tails = new Map(sides.map((side) => [side, bankTail(side)]))
    tailpipes = [...tails.values()]
    tailSegmentsFor = (side) => [tails.get(side)!]
  }
  const headers = cylinders.map((c) => ({ index: c.index, side: c.side, points: HEADER.map((p) => place(c.side, c.x, p)) }))
  const routes = new Map<number, Vec3[]>()
  const routeSegments = new Map<number, Vec3[][]>()
  for (const h of headers) {
    const rear = collectors.find((collector) => collector.side === h.side)!.points[1]!
    // The collector is straight, so its suffix from this header's junction is the same curve as the visible collector.
    const segments = [h.points, [h.points[h.points.length - 1]!, rear], ...tailSegmentsFor(h.side)]
    routeSegments.set(h.index, segments)
    routes.set(h.index, segments.flatMap((segment, index) => index === 0 ? segment : segment.slice(1)))
  }
  return { headers, collectors, tailpipes, routes, routeSegments }
}

/** A header that stops just past its bend, running back along the engine: the single-cylinder views. */
export const headerStub = (header: Vec3[]): Vec3[] => {
  const end = header[header.length - 1]!
  return [...header, [end[0] - STUB_RUN, end[1], end[2]]]
}

export function pathLength(path: readonly Vec3[]): number {
  let total = 0
  for (let i = 1; i < path.length; i++) total += Math.hypot(path[i]![0] - path[i - 1]![0], path[i]![1] - path[i - 1]![1], path[i]![2] - path[i - 1]![2])
  return total
}

/** The point `distance` along a polyline (clamped to its ends). */
export function pointAlong(path: readonly Vec3[], distance: number): Vec3 {
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

/* ------------------------------------------------------------ flow */

/** The exhaust valve opens here in the Engine Lab's four-stroke angle (firing top dead centre at 360°)… */
export const EXHAUST_OPENS = VALVE_TIMING.exhaust.opens
/** …and stays open this many crank degrees. */
export const EXHAUST_OPEN_DEG = valveDuration(VALVE_TIMING.exhaust)
/** Bottom and top dead centre of the exhaust stroke, in degrees after the valve opened. */
export const STROKE_START = 540 - EXHAUST_OPENS
export const STROKE_END = 720 - EXHAUST_OPENS
/** The port's flow area grows with lift until the valve is about 30% open, then the throat limits it. */
export const AREA_FULL_LIFT = 0.3
/** Blowdown: the cylinder is still at several bar when the valve cracks, and the choked flow falls away with that pressure. */
export const BLOWDOWN = 6
export const BLOWDOWN_DECAY = 22
/** The piston pushing out the rest on the exhaust stroke, gentler than the blowdown. */
export const DISPLACEMENT = 0.45

function rawPortFlow(e: number): number {
  const area = Math.min(1, valveOpenFraction('exhaust', EXHAUST_OPENS + e) / AREA_FULL_LIFT)
  const push = e > STROKE_START && e < STROKE_END ? Math.sin((Math.PI * (e - STROKE_START)) / (STROKE_END - STROKE_START)) : 0
  return area * (BLOWDOWN * Math.exp(-e / BLOWDOWN_DECAY) + DISPLACEMENT * push)
}

/** The strongest flow of the cycle (the blowdown), so `portFlow` peaks at 1. */
export const PORT_FLOW_PEAK = (() => {
  let peak = 0
  for (let e = 0; e <= EXHAUST_OPEN_DEG; e += 0.25) peak = Math.max(peak, rawPortFlow(e))
  return peak
})()

/** Gas speed in scene units (100 mm) per crank degree: about 58 m/s at 6,000 rpm, a typical exhaust gas velocity. */
export const FLOW_SPEED = 0.016

/** Crank degrees since this cylinder's exhaust valve last opened, from its four-stroke angle. */
export const sinceExhaustOpened = (cycleDeg: number) => mod(cycleDeg - EXHAUST_OPENS, 720)

/**
 * Gas leaving the port `e` crank degrees after the exhaust valve opened, 0–1:
 * a blowdown burst around bottom dead centre while the cylinder is still at
 * several bar, then the piston pushing out the rest on the exhaust stroke,
 * and nothing once the valve has shut. The shader in exhaustGas.ts repeats it.
 */
export function portFlow(e: number): number {
  if (!(e >= 0 && e <= EXHAUST_OPEN_DEG)) return 0
  return rawPortFlow(e) / PORT_FLOW_PEAK
}

/** Temperature of that gas as it leaves the port, relative to the blowdown (1): the last of the stroke leaves cooler. */
export function portTemperature(e: number): number {
  const t = Math.min(1, Math.max(0, e / STROKE_END))
  return 1 - 0.4 * t * t * (3 - 2 * t)
}

/** Past the outlet the jet slows as it mixes with the air: its speed falls as 1 / (1 + s / PLUME_SLOW). */
export const PLUME_SLOW = 0.5
/** How far the visible plume reaches past the outlet, and how fast it widens (radius per unit length, a turbulent jet's spread). */
export const PLUME_LENGTH = 2.4
export const PLUME_SPREAD = 0.22

/** Visible pipe controls and conservative bounds of the actual outlet plumes, for camera framing. */
export function exhaustFramingPoints(plumbing: ExhaustPlumbing): Vec3[] {
  const points = [
    ...plumbing.headers.flatMap((pipe) => pipe.points),
    ...plumbing.collectors.flatMap((pipe) => pipe.points),
    ...plumbing.tailpipes.flat(),
  ]
  const outlets = new Set([...plumbing.routes.values()].flatMap((route) => route.length ? [route[route.length - 1]!.join()] : []))
  const framed = new Set<string>()
  for (const tail of plumbing.tailpipes) {
    if (tail.length < 2) continue
    const end = tail[tail.length - 1]!
    const key = end.join()
    // Shared-bank joints end at the merge, not at a free-air outlet.
    if (!outlets.has(key) || framed.has(key)) continue
    const previous = tail[tail.length - 2]!
    const length = Math.hypot(end[0] - previous[0], end[1] - previous[1], end[2] - previous[2])
    if (length === 0) continue
    framed.add(key)
    const direction = end.map((coordinate, axis) => (coordinate - previous[axis]!) / length)
    for (let step = 0; step <= 4; step++) {
      const s = (step / 4) * PLUME_LENGTH
      const centre: Vec3 = [end[0] + direction[0]! * s, end[1] + direction[1]! * s + 0.07 * s * s, end[2] + direction[2]! * s]
      const radius = COLLECTOR_RADIUS * GAS_FILL + PLUME_SPREAD * s
      // A box around each cross-section stays conservative when the camera rotates.
      for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
        points.push([centre[0] + x * radius, centre[1] + y * radius, centre[2] + z * radius])
      }
    }
  }
  return points
}

/** Crank degrees gas takes to travel `distance` from its port; beyond `routeLength` it is in the slowing plume. */
export function travelDeg(distance: number, routeLength: number, speed = FLOW_SPEED): number {
  if (distance <= routeLength) return distance / speed
  const s = distance - routeLength
  return (routeLength + s + (s * s) / (2 * PLUME_SLOW)) / speed
}

/**
 * How much of a cylinder's gas is at a point now, given the crank degrees
 * since its valve opened and the degrees gas takes to get there: whatever
 * left the port that long ago, in this cycle or an earlier one.
 */
export const gasAt = (since: number, travel: number) => portFlow(mod(since - travel, 720))

/** 0 at idle … 1 at the redline: hotter, harder-working exhaust as the revs rise. */
export function exhaustLoad(rpm: number, idleRpm: number, redlineRpm: number): number {
  if (!(redlineRpm > idleRpm)) return 0
  return Math.min(1, Math.max(0, (rpm - idleRpm) / (redlineRpm - idleRpm)))
}
