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
import { VALVES } from '@/features/engine-lab/engineModel'
import { VALVE_TIMING, valveDuration, valveOpenFraction } from '@/features/engine-lab/kinematics'
import { ease, mod, type EngineFrame } from './animation'
import type { EngineSpec } from './engines'

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
/** Header pipe radius, matching the head's exhaust port it bolts to; collectors and tailpipes are wider. */
export const HEADER_RADIUS = VALVES.exhaust.portR
export const COLLECTOR_RADIUS = 0.16
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
  /** For each route segment, how many cylinders' gas flows through that pipe (header 1, then its bank, then all). */
  routeFeeds: Map<number, number[]>
}

/**
 * Headers, a collector along each bank and the tailpipes. With separate bank
 * exhausts each bank keeps its own pipe (what each ear hears); a shared
 * exhaust joins the banks into one pipe behind the engine. An inline engine
 * has one bank and so one pipe either way.
 */
export function exhaustPlumbing(
  cylinders: PlumbingCylinder[],
  place: Place,
  options: {
    xFront: number
    xRear: number
    shared: boolean
    /** A shared exhaust merges under the other bank, so this bank's joint pipe runs further (unequal-length headers). */
    longBank?: ExhaustSide
  },
): ExhaustPlumbing {
  const { xFront, xRear, shared, longBank } = options
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
    const short = longBank ? collectors.find((c) => c.side !== longBank)?.points[1] : undefined
    const mergeZ = short ? 0.6 * short[2] : 0
    const merge: Vec3 = [xRear - 0.95, mergeY, mergeZ]
    const outlet: Vec3 = [xRear - 2.1, mergeY - 0.15, mergeZ]
    const joint = (side: ExhaustSide): Vec3[] => {
      const end = collectors.find((c) => c.side === side)!.points[1]!
      return [end, [xRear - 0.5, (end[1] + mergeY) / 2, mergeZ + (end[2] - mergeZ) * 0.45], merge]
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
  const routeFeeds = new Map<number, number[]>()
  const onSide = (side: ExhaustSide) => cylinders.filter((c) => c.side === side).length
  for (const h of headers) {
    const rear = collectors.find((collector) => collector.side === h.side)!.points[1]!
    // The collector is straight, so its suffix from this header's junction is the same curve as the visible collector.
    const segments = [h.points, [h.points[h.points.length - 1]!, rear], ...tailSegmentsFor(h.side)]
    routeSegments.set(h.index, segments)
    routes.set(h.index, segments.flatMap((segment, index) => index === 0 ? segment : segment.slice(1)))
    routeFeeds.set(h.index, segments.map((_, index) => (index === 0 ? 1 : index === 3 ? cylinders.length : onSide(h.side))))
  }
  return { headers, collectors, tailpipes, routes, routeSegments, routeFeeds }
}

/* ------------------------------------------------------------ drawing */

export interface ExhaustPipe {
  points: Vec3[]
  radius: number
  /** A header leaving an exhaust port: its first stretch can glow with heat. */
  header?: boolean
}

export interface ExhaustRoute {
  /** Firing-event index of the cylinder whose gas this is. */
  index: number
  points: Vec3[]
  /** Exact visible pipe curves, sampled separately so gas stays inside their bends. */
  segments: Vec3[][]
  /** For each segment, how many cylinders' gas shares that pipe. */
  feeds: number[]
  headerLength: number
}

export interface ExhaustDrawing {
  pipes: ExhaustPipe[]
  routes: ExhaustRoute[]
}

/**
 * What a scene draws for its exhaust: every pipe, and each cylinder's route.
 * The whole engine shows headers, collectors and tailpipes; the single-cylinder
 * views stop each header just past its bend, and the whole stub acts as header.
 */
export function exhaustDrawing(layout: ExhaustPlumbing, full: boolean): ExhaustDrawing {
  if (!full) {
    const routes = layout.headers.map((h) => {
      const points = headerStub(h.points)
      return { index: h.index, points, segments: [points], feeds: [1], headerLength: pathLength(points) }
    })
    return { pipes: routes.map((r) => ({ points: r.points, radius: HEADER_RADIUS, header: true })), routes }
  }
  return {
    pipes: [
      ...layout.headers.map((h) => ({ points: h.points, radius: HEADER_RADIUS, header: true })),
      ...layout.collectors.map((c) => ({ points: c.points, radius: COLLECTOR_RADIUS })),
      ...layout.tailpipes.map((points) => ({ points, radius: COLLECTOR_RADIUS })),
    ],
    routes: layout.headers.map((h) => ({
      index: h.index,
      points: layout.routes.get(h.index)!,
      segments: layout.routeSegments.get(h.index)!,
      feeds: layout.routeFeeds.get(h.index)!,
      headerLength: pathLength(h.points),
    })),
  }
}

/**
 * The bank whose headers are longer, for a preset with unequal-length headers
 * (its delayed cylinders all on one bank, as on the Subaru boxer): the shared
 * pipe then merges under the other bank.
 */
export function longHeaderSide(spec: Pick<EngineSpec, 'voice' | 'bankA' | 'bankB'>): ExhaustSide | undefined {
  const delayed = Object.keys(spec.voice.headerDelayMs ?? {}).map(Number)
  if (!delayed.length) return undefined
  if (delayed.every((c) => spec.bankA.includes(c))) return 'A'
  if (delayed.every((c) => spec.bankB.includes(c))) return 'B'
  return undefined
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
/** The port's flow area grows with lift until the valve is about 12% open, then the throat limits it. */
export const AREA_FULL_LIFT = 0.12
/**
 * Blowdown: the cylinder is still at several bar when the valve cracks, and the
 * choked flow falls away with that pressure, over about the Engine Lab's
 * blowdown time. Nearly half the cycle's gas leaves this way, most of it by
 * bottom dead centre.
 */
export const BLOWDOWN = 10
export const BLOWDOWN_DECAY = 14
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

/** How much of each plume the camera keeps in view: its dense first stretch, not the fading far end. */
export const PLUME_FRAMED = 1

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
      const s = (step / 4) * PLUME_FRAMED
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

/* ------------------------------------------------------------ header heat */

/** How far down a header its heat glow reaches (scene units): the pipe is hottest where it leaves the port. */
export const HEADER_HEAT_LENGTH = 0.55
/** Seconds for the header metal to heat up most of the way, and (more slowly) to cool. */
export const WALL_HEAT_UP_S = 3
export const WALL_HEAT_DOWN_S = 5

/** How hot a header's wall is `distance` from its port, relative to the port end. */
export const headerHeat = (distance: number) => (distance >= 0 ? Math.exp(-distance / HEADER_HEAT_LENGTH) : 0)

/**
 * How brightly the headers glow once the revs have been held: nothing below
 * about half load, full at the redline. A diesel's cooler exhaust glows less.
 */
export function wallHeatTarget(load: number, diesel: boolean): number {
  const t = Math.min(1, Math.max(0, (load - 0.55) / 0.45))
  return t * t * (3 - 2 * t) * (diesel ? 0.4 : 1)
}

/** Header metal follows the exhaust temperature with a lag: seconds to heat, longer to cool. */
export function approachWallHeat(current: number, target: number, dt: number): number {
  return ease(current, target, Math.max(0, dt), target > current ? WALL_HEAT_UP_S : WALL_HEAT_DOWN_S)
}

/* ------------------------------------------------------------ the header column */

/**
 * Header-length units of gas a cylinder pushes out each cycle, so the gas in a
 * header moves, on average, at FLOW_SPEED. A header holds only about a tenth
 * of it: the blowdown flushes a header within a couple of dozen degrees.
 */
export const CYCLE_GAS = 720 * FLOW_SPEED
/** Labels wrap after this many cycles: 10 × 11.52 units × 5 noise cells per unit = 576 = 9 × 64 cells, so turbulence wraps seamlessly. */
export const LABEL_WRAP_CYCLES = 10
/** Texels in the flow table the shader samples. */
export const FLOW_TEXELS = 256
/** Real seconds of residence for gas to lose most of its extra heat to the pipe walls. */
export const GAS_COOL_S = 0.05
/** Haze of older, mixed gas in a collector, shared between the cylinders feeding it. */
export const RESIDUAL_TOTAL = 0.3
/** Haze density of a full header column. */
export const HEADER_GAS = 0.45
/** Most crank degrees of motion blur in one frame. */
export const SMEAR_MAX_DEG = 90
/** Below this frame step, motion blur takes a single sample. */
export const SMEAR_SINGLE_DEG = 4

const SHARE_STEP = 0.05
let shareTable: Float64Array | null = null
/** Cumulative port flow, normalised: the share of a cycle's gas out by each SHARE_STEP after the valve opens. */
function shares(): Float64Array {
  if (!shareTable) {
    const steps = Math.ceil(EXHAUST_OPEN_DEG / SHARE_STEP)
    const table = new Float64Array(steps + 1)
    let total = 0
    for (let i = 1; i <= steps; i++) {
      const a = Math.min(EXHAUST_OPEN_DEG, (i - 1) * SHARE_STEP)
      const b = Math.min(EXHAUST_OPEN_DEG, i * SHARE_STEP)
      total += ((portFlow(a) + portFlow(b)) / 2) * (b - a)
      table[i] = total
    }
    for (let i = 0; i <= steps; i++) table[i] = table[i]! / total
    shareTable = table
  }
  return shareTable
}

/** Share of this cycle's gas out of the port `e` degrees after the exhaust valve opened: 0 before, 1 once it has shut. */
export function exhaustedShare(e: number): number {
  if (!(e > 0)) return 0
  if (e >= EXHAUST_OPEN_DEG) return 1
  const table = shares()
  const x = e / SHARE_STEP
  const i = Math.min(Math.floor(x), table.length - 2)
  return table[i]! + (table[i + 1]! - table[i]!) * (x - i)
}

/** Degrees after the valve opened by which share `f` of the cycle's gas had left: the inverse of exhaustedShare. */
export function emissionAtShare(f: number): number {
  if (!(f > 0)) return 0
  if (f >= 1) return EXHAUST_OPEN_DEG
  const table = shares()
  let lo = 0
  let hi = table.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (table[mid]! < f) lo = mid
    else hi = mid
  }
  const span = table[hi]! - table[lo]!
  return Math.min(EXHAUST_OPEN_DEG, (lo + (span > 0 ? (f - table[lo]!) / span : 0)) * SHARE_STEP)
}

/**
 * portFlow blurred over the last `smear` crank degrees with `taps` samples:
 * motion blur for one frame's step. A step under SMEAR_SINGLE_DEG takes one
 * sample at its middle, as the shader does.
 */
export function portFlowOver(e: number, smear: number, taps: number): number {
  if (smear < SMEAR_SINGLE_DEG) return portFlow(mod(e - smear / 2, 720))
  const n = Math.max(1, Math.round(taps))
  let sum = 0
  for (let i = 0; i < n; i++) sum += portFlow(mod(e - (smear * (i + 0.5)) / n, 720))
  return sum / n
}

/**
 * A cylinder's clock: degrees since its exhaust valve last opened, and which
 * of the last LABEL_WRAP_CYCLES cycles this is (`lap` counts the 720° wraps of
 * the playhead).
 */
export function slotClock(playhead: number, lap: number, firingAngle: number): { since: number; cycle: number } {
  const total = mod(playhead + 720 * lap - firingAngle + 360 - EXHAUST_OPENS, LABEL_WRAP_CYCLES * 720)
  const cycle = Math.floor(total / 720)
  return { since: total - 720 * cycle, cycle }
}

export interface Parcel {
  /** Which gas this is, in cycles of gas (wraps with the clock). Turbulence is keyed to it, so eddies move with the gas. */
  label: number
  /** Crank degrees since it left the port. */
  age: number
  /** Degrees after its valve opened at which it left. */
  emitDeg: number
  /** Fresh flow carrying it: 1 in a header, which is always full. */
  flow: number
}

/**
 * The gas `dist` along a route whose header is `header` long. A header is a
 * column, always full, that moves only while its valve is open: as the
 * cylinder pushes gas in, the same amount leaves the header's far end. From
 * there it moves on at FLOW_SPEED. The gas shader runs the same formulas.
 */
export function parcelAt(clock: { since: number; cycle: number }, dist: number, header: number, smear = 0, taps = 1): Parcel {
  let label: number
  let flow: number
  if (dist <= header) {
    label = clock.cycle + exhaustedShare(clock.since) - dist / CYCLE_GAS
    flow = 1
  } else {
    const back = clock.since - (dist - header) / FLOW_SPEED
    const wraps = -Math.floor(back / 720)
    const exit = back + 720 * wraps
    label = clock.cycle - wraps + exhaustedShare(exit) - header / CYCLE_GAS
    flow = portFlowOver(exit, smear, taps)
  }
  const rel = Math.min(label - clock.cycle, 0.99995)
  const cyclesAgo = -Math.floor(rel)
  const emitDeg = emissionAtShare(rel + cyclesAgo)
  return { label, age: 720 * cyclesAgo + clock.since - emitDeg, emitDeg, flow }
}

/**
 * The flow table the gas shader samples (FLOW_TEXELS × RGBA8), at
 * e_i = i / (FLOW_TEXELS − 1) × the valve's open time: r the share out by e_i,
 * g the degrees at which share i / (FLOW_TEXELS − 1) had left (÷ open time),
 * b portFlow and a portTemperature. TypeScript stays the single source.
 */
export function flowTable(): Uint8Array {
  const out = new Uint8Array(FLOW_TEXELS * 4)
  const byte = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255)
  for (let i = 0; i < FLOW_TEXELS; i++) {
    const u = i / (FLOW_TEXELS - 1)
    const e = u * EXHAUST_OPEN_DEG
    out[i * 4] = byte(exhaustedShare(e))
    out[i * 4 + 1] = byte(emissionAtShare(u) / EXHAUST_OPEN_DEG)
    out[i * 4 + 2] = byte(portFlow(e))
    out[i * 4 + 3] = byte(portTemperature(e))
  }
  return out
}

export interface ExhaustDrive {
  /** 0 … 1: how hard the engine works, from revs and throttle together. */
  load: number
  /** Gas per cycle relative to full throttle: a wide-open throttle sends thicker gas. */
  mass: number
  /** Scale of the gas temperature leaving the ports. */
  heat: number
  /** Turns crank degrees spent in the pipes into e-folds of cooling (real seconds ÷ GAS_COOL_S). */
  ageScale: number
  /** 1 while the rev limiter is cutting fuel. */
  cut: number
}

/**
 * What drives the exhaust's look from the engine's state: hotter, thicker gas
 * with revs and throttle; cooler for a lean-running diesel; and, because the
 * pipes cool gas by the second, gas reaches the tailpipe hotter at high revs.
 */
export function exhaustDrive(frame: Pick<EngineFrame, 'running' | 'rpm' | 'throttle' | 'limiting'> | null, spec: Pick<EngineSpec, 'idleRpm' | 'redlineRpm' | 'ignition'>): ExhaustDrive {
  if (!frame?.running) return { load: 0, mass: 0, heat: 0, ageScale: 0, cut: 0 }
  const throttle = Math.min(1, Math.max(0, frame.throttle))
  const load = exhaustLoad(frame.rpm, spec.idleRpm, spec.redlineRpm) * (0.4 + 0.6 * throttle)
  return {
    load,
    mass: 0.35 + 0.65 * throttle,
    heat: (0.75 + 0.25 * load) * (spec.ignition === 'compression' ? 0.7 : 1),
    ageScale: 1 / (6 * Math.max(frame.rpm, 60) * GAS_COOL_S),
    cut: frame.limiting ? 1 : 0,
  }
}

/** How diluted the plume is `s` past the outlet: it slows (concentrating it) but widens much faster (mixing in air). */
export function plumeDilution(s: number): number {
  const d = Math.max(0, s)
  const r0 = COLLECTOR_RADIUS * GAS_FILL
  const r = r0 + PLUME_SPREAD * d
  return ((1 + d / PLUME_SLOW) * r0 * r0) / (r * r)
}
