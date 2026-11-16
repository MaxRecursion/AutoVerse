import { describe, expect, it } from 'vitest'
import { VALVE_TIMING } from '@/features/engine-lab/kinematics'
import { rotationSense } from './animation'
import { cutawayLayout, cutawayMirror, cutawayToWorld } from './cutawayMath'
import { bankOf, engines, type EngineSpec } from './engines'
import { firingEvents } from './firing'
import { exhaustLayout, isV10, v10Model } from './v10Layout'
import {
  COLLECTOR_RADIUS,
  EXHAUST_OPEN_DEG,
  EXHAUST_OPENS,
  FLOW_SPEED,
  GAS_FILL,
  HEADER,
  PLUME_LENGTH,
  PLUME_SPREAD,
  exhaustFramingPoints,
  exhaustLoad,
  exhaustPlumbing,
  gasAt,
  headerStub,
  pathLength,
  pointAlong,
  portFlow,
  portTemperature,
  sinceExhaustOpened,
  STUB_RUN,
  travelDeg,
  type ExhaustSide,
  type ExhaustPlumbing,
  type ModelPoint,
  type Vec3,
} from './exhaust'

/** A plain placement for the recipe tests: bank A on −z, bank B mirrored onto +z, no lean. */
const flatPlace = (side: ExhaustSide, x: number, p: ModelPoint): Vec3 => [x, p.y, side === 'B' ? -p.z : p.z]

function productionPlumbing(spec: EngineSpec) {
  if (isV10(spec)) return exhaustLayout(v10Model(spec).cylinders, spec.bankAngle, !spec.separateBanks)
  const events = firingEvents(spec.intervals, spec.order, bankOf(spec))
  const cylinders = cutawayLayout(spec, events, spec.bankAngle, rotationSense(spec, events))
  return exhaustPlumbing(
    cylinders.map((cylinder) => ({ index: cylinder.event.index, side: cylinder.side, x: cylinder.x })),
    (side, x, point) => cutawayToWorld(side, spec.bankAngle, cutawayMirror(spec.layout, side, false), x, point),
    { xFront: Math.max(...cylinders.map((cylinder) => cylinder.x)) + 0.45, xRear: Math.min(...cylinders.map((cylinder) => cylinder.x)) - 0.85, shared: !spec.separateBanks },
  )
}

describe('exhaust plumbing', () => {
  const inline = [0, 1, 2, 3].map((i) => ({ index: i, side: 'mid' as const, x: 1.5 - i }))
  const vee = [0, 1, 2, 3].map((i) => ({ index: i, side: (i % 2 ? 'B' : 'A') as ExhaustSide, x: 1 - Math.floor(i / 2) }))

  it('starts every route at its cylinder’s exhaust port and follows its header', () => {
    const { routes, headers } = exhaustPlumbing(vee, flatPlace, { xFront: 1.5, xRear: -0.9, shared: false })
    for (const c of vee) {
      const route = routes.get(c.index)!
      expect(route[0]).toEqual(flatPlace(c.side, c.x, HEADER[0]!))
      expect(route.slice(0, HEADER.length)).toEqual(headers.find((h) => h.index === c.index)!.points)
    }
  })

  it('gives an inline engine one collector and one tailpipe', () => {
    const { collectors, tailpipes, routes } = exhaustPlumbing(inline, flatPlace, { xFront: 2, xRear: -2.4, shared: false })
    expect(collectors).toHaveLength(1)
    expect(tailpipes).toHaveLength(1)
    const outlets = new Set([...routes.values()].map((r) => r.at(-1)!.join()))
    expect(outlets.size).toBe(1)
  })

  it('keeps separate banks apart to their own outlets, and joins a shared exhaust into one', () => {
    const separate = exhaustPlumbing(vee, flatPlace, { xFront: 1.5, xRear: -0.9, shared: false })
    expect(separate.tailpipes).toHaveLength(2)
    const sideOutlets = (side: ExhaustSide) => new Set(vee.filter((c) => c.side === side).map((c) => separate.routes.get(c.index)!.at(-1)!.join()))
    expect(sideOutlets('A').size).toBe(1)
    expect(sideOutlets('B').size).toBe(1)
    expect([...sideOutlets('A')][0]).not.toBe([...sideOutlets('B')][0])

    const shared = exhaustPlumbing(vee, flatPlace, { xFront: 1.5, xRear: -0.9, shared: true })
    expect(shared.tailpipes).toHaveLength(3)
    const outlet = shared.tailpipes.at(-1)!.at(-1)!
    expect(outlet[2]).toBe(0)
    for (const route of shared.routes.values()) expect(route.at(-1)).toEqual(outlet)
  })

  it('runs each route along its collector to the rear before the tailpipe', () => {
    const { routes } = exhaustPlumbing(inline, flatPlace, { xFront: 2, xRear: -2.4, shared: false })
    for (const c of inline) {
      const route = routes.get(c.index)!
      // Header end on the collector line, then the collector's rear end.
      expect(route[HEADER.length - 1]![0]).toBeCloseTo(c.x)
      expect(route[HEADER.length]![0]).toBeCloseTo(-2.4)
      // Never doubles back towards the front once it is in the collector.
      for (let i = HEADER.length; i < route.length; i++) expect(route[i]![0]).toBeLessThanOrEqual(route[i - 1]![0] + 1e-9)
    }
  })

  it.each(engines.map((spec) => [spec.id, spec] as const))('%s keeps each gas route on its actual visible pipe curves', (_id, spec) => {
    const layout = productionPlumbing(spec)
    expect(layout.routeSegments.size).toBe(spec.cylinders)
    for (const header of layout.headers) {
      const segments = layout.routeSegments.get(header.index)!
      const collector = layout.collectors.find((pipe) => pipe.side === header.side)!
      expect(segments).toHaveLength(spec.layout !== 'inline' && !spec.separateBanks ? 4 : 3)
      // The header and tail curves are reused, not smoothed again as one long curve across the junctions.
      expect(segments[0]).toBe(header.points)
      for (const segment of segments.slice(2)) expect(layout.tailpipes).toContain(segment)
      const collectorRun = segments[1]!
      expect(collectorRun).toHaveLength(2)
      expect(collectorRun[0]).toEqual(header.points.at(-1))
      expect(collectorRun[1]).toEqual(collector.points[1])
      for (const point of collectorRun) {
        expect(point[1]).toBeCloseTo(collector.points[0]![1], 12)
        expect(point[2]).toBeCloseTo(collector.points[0]![2], 12)
      }
      for (let i = 1; i < segments.length; i++) expect(segments[i]![0]).toEqual(segments[i - 1]!.at(-1))
      const flattened = segments.flatMap((segment, i) => i === 0 ? segment : segment.slice(1))
      expect(flattened).toEqual(layout.routes.get(header.index))
      for (const point of flattened) expect(point.every(Number.isFinite)).toBe(true)
    }
  })

  it('stops a single-cylinder header a short run past its bend', () => {
    const header: Vec3[] = HEADER.map((p) => flatPlace('mid', 0, p))
    const stub = headerStub(header)
    expect(stub).toHaveLength(header.length + 1)
    expect(pathLength(stub) - pathLength(header)).toBeCloseTo(STUB_RUN)
  })

  it('walks along a route', () => {
    const path: Vec3[] = [
      [0, 0, 0],
      [3, 0, 0],
      [3, 4, 0],
    ]
    expect(pathLength(path)).toBeCloseTo(7)
    expect(pointAlong(path, 1.5)).toEqual([1.5, 0, 0])
    expect(pointAlong(path, 5)).toEqual([3, 2, 0])
    expect(pointAlong(path, 99)).toEqual([3, 4, 0])
    expect(pointAlong(path, -1)).toEqual([0, 0, 0])
  })
})

describe('exhaust camera framing', () => {
  it.each(engines.map((spec) => [spec.id, spec] as const))('%s frames its visible pipes and only its actual outlet plumes', (_id, spec) => {
    const plumbing = productionPlumbing(spec)
    const pipes = [...plumbing.headers.flatMap((pipe) => pipe.points), ...plumbing.collectors.flatMap((pipe) => pipe.points), ...plumbing.tailpipes.flat()]
    const framing = exhaustFramingPoints(plumbing)
    expect(framing.slice(0, pipes.length)).toEqual(pipes)
    // The shared exhaust has two merge joints, but one plume; separate banks have two.
    const outletCount = spec.layout !== 'inline' && spec.separateBanks ? 2 : 1
    expect(framing).toHaveLength(pipes.length + outletCount * 5 * 8)
    expect(framing.every((point) => point.every(Number.isFinite))).toBe(true)
  })

  it('extends a plume along its outlet direction, with buoyant rise and widening bounds', () => {
    const tail: Vec3[] = [[3, 2, 1], [1, 2, 1]]
    const plumbing: ExhaustPlumbing = { headers: [], collectors: [], tailpipes: [tail], routes: new Map([[0, tail]]), routeSegments: new Map([[0, [tail]]]) }
    const framing = exhaustFramingPoints(plumbing)
    const bounds = (points: Vec3[], axis: number) => [Math.min(...points.map((point) => point[axis]!)), Math.max(...points.map((point) => point[axis]!))]
    const start = framing.slice(tail.length, tail.length + 8)
    expect(bounds(start, 0)).toEqual([1 - COLLECTOR_RADIUS * GAS_FILL, 1 + COLLECTOR_RADIUS * GAS_FILL])
    const end = framing.slice(-8)
    const radius = COLLECTOR_RADIUS * GAS_FILL + PLUME_SPREAD * PLUME_LENGTH
    expect(bounds(end, 0)).toEqual([1 - PLUME_LENGTH - radius, 1 - PLUME_LENGTH + radius])
    expect(bounds(end, 1)).toEqual([2 + 0.07 * PLUME_LENGTH ** 2 - radius, 2 + 0.07 * PLUME_LENGTH ** 2 + radius])
    expect(bounds(end, 2)).toEqual([1 - radius, 1 + radius])
  })

  it('handles empty plumbing and a collapsed outlet without creating invalid bounds', () => {
    const empty: ExhaustPlumbing = { headers: [], collectors: [], tailpipes: [], routes: new Map(), routeSegments: new Map() }
    expect(exhaustFramingPoints(empty)).toEqual([])
    const tail: Vec3[] = [[0, 0, 0], [0, 0, 0]]
    expect(exhaustFramingPoints({ ...empty, tailpipes: [tail], routes: new Map([[0, tail]]) })).toEqual(tail)
  })
})

describe('exhaust flow', () => {
  it('times the flow from the Engine Lab’s exhaust valve', () => {
    expect(EXHAUST_OPENS).toBe(VALVE_TIMING.exhaust.opens)
    expect(EXHAUST_OPEN_DEG).toBe(230)
    expect(sinceExhaustOpened(EXHAUST_OPENS)).toBe(0)
    expect(sinceExhaustOpened(EXHAUST_OPENS - 1)).toBe(719)
  })

  it('lets gas out only while the valve is open: a blowdown burst, then the piston pushing out the rest', () => {
    expect(portFlow(-1)).toBe(0)
    expect(portFlow(EXHAUST_OPEN_DEG + 0.5)).toBe(0)
    expect(portFlow(0)).toBe(0)
    // The burst peaks within a few degrees and is the strongest flow of the cycle.
    let peak = 0
    let at = 0
    for (let e = 0; e <= EXHAUST_OPEN_DEG; e += 0.5) {
      if (portFlow(e) > peak) {
        peak = portFlow(e)
        at = e
      }
    }
    expect(peak).toBeCloseTo(1, 2)
    // Around bottom dead centre of the exhaust stroke (40° after opening).
    expect(at).toBeGreaterThan(30)
    expect(at).toBeLessThan(50)
    // Mid exhaust stroke the piston keeps gas moving, more gently.
    expect(portFlow(130)).toBeGreaterThan(0.4)
    expect(portFlow(130)).toBeLessThan(0.6)
    // Fades to nothing as the valve closes, without a jump.
    expect(portFlow(EXHAUST_OPEN_DEG)).toBe(0)
    for (let e = 1; e <= EXHAUST_OPEN_DEG; e++) expect(Math.abs(portFlow(e) - portFlow(e - 1))).toBeLessThan(0.06)
  })

  it('sends the blowdown out hottest', () => {
    expect(portTemperature(0)).toBe(1)
    expect(portTemperature(200)).toBeLessThan(portTemperature(40))
    expect(portTemperature(400)).toBeCloseTo(0.6)
  })

  it('moves gas at one speed in the pipes and slows it past the outlet', () => {
    expect(travelDeg(1.6, 8)).toBeCloseTo(1.6 / FLOW_SPEED)
    expect(travelDeg(8, 8)).toBeCloseTo(8 / FLOW_SPEED)
    // Each step past the outlet takes longer than the one before.
    const step = (s: number) => travelDeg(8 + s + 0.1, 8) - travelDeg(8 + s, 8)
    expect(step(0)).toBeGreaterThan(0.1 / FLOW_SPEED - 1e-9)
    expect(step(1)).toBeGreaterThan(step(0))
    expect(step(2)).toBeGreaterThan(step(1))
  })

  it('spaces the gas of cylinders sharing a pipe by their firing gap', () => {
    // Two cylinders 54° apart: the second's gas pattern is the first's, 54° × speed further back.
    const gap = 54
    const since = 300
    for (let d = 0; d < 6; d += 0.37) {
      const first = gasAt(since, travelDeg(d, 8))
      const second = gasAt(since - gap, travelDeg(d - gap * FLOW_SPEED, 8))
      expect(second).toBeCloseTo(first, 9)
    }
  })

  it('keeps a cylinder’s gas flowing from one cycle into the next', () => {
    // Gas that left 700° ago (a long way down the pipe) is the previous cycle’s blowdown when since is small.
    expect(gasAt(10, 10)).toBe(0)
    expect(gasAt(10, 10 + 720 - 12)).toBeCloseTo(portFlow(12), 12)
    expect(gasAt(5, 6)).toBe(0)
  })

  it('scales the work the exhaust does from idle to the redline', () => {
    expect(exhaustLoad(800, 800, 8000)).toBe(0)
    expect(exhaustLoad(4400, 800, 8000)).toBeCloseTo(0.5)
    expect(exhaustLoad(9000, 800, 8000)).toBe(1)
    expect(exhaustLoad(0, 800, 8000)).toBe(0)
    expect(exhaustLoad(1000, 1000, 1000)).toBe(0)
  })
})
