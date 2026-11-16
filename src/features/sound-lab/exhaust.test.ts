import { describe, expect, it } from 'vitest'
import { VALVE_TIMING } from '@/features/engine-lab/kinematics'
import { mod, rotationSense } from './animation'
import { cutawayLayout, cutawayMirror, cutawayToWorld } from './cutawayMath'
import { bankOf, engines, getEngine, type EngineSpec } from './engines'
import { firingEvents } from './firing'
import { exhaustLayout, isV10, v10Model } from './v10Layout'
import {
  COLLECTOR_RADIUS,
  CYCLE_GAS,
  EXHAUST_OPEN_DEG,
  EXHAUST_OPENS,
  FLOW_SPEED,
  GAS_FILL,
  HEADER,
  PLUME_FRAMED,
  PLUME_SPREAD,
  approachWallHeat,
  FLOW_TEXELS,
  HEADER_RADIUS,
  LABEL_WRAP_CYCLES,
  emissionAtShare,
  exhaustDrawing,
  exhaustDrive,
  exhaustedShare,
  exhaustFramingPoints,
  exhaustLoad,
  exhaustPlumbing,
  flowTable,
  longHeaderSide,
  parcelAt,
  plumeDilution,
  portFlowOver,
  slotClock,
  gasAt,
  headerHeat,
  headerInlets,
  headerStub,
  INLET_RECESS,
  pathLength,
  pointAlong,
  portFlow,
  parcelTemperature,
  portTemperature,
  sinceExhaustOpened,
  STUB_RUN,
  travelDeg,
  wallGlow,
  wallHeatTarget,
  type ExhaustSide,
  type ExhaustPlumbing,
  type ModelPoint,
  type Vec3,
} from './exhaust'

describe('exhaust header heat', () => {
  it('keeps idle headers cool and concentrates heat near the exhaust port', () => {
    expect(wallHeatTarget(0, false)).toBe(0)
    expect(wallHeatTarget(0.5, false)).toBe(0)
    expect(wallHeatTarget(1, false)).toBe(1)
    expect(wallHeatTarget(1, true)).toBeLessThan(wallHeatTarget(1, false))
    expect(headerHeat(0)).toBe(1)
    expect(headerHeat(2)).toBeLessThan(0.03)
    expect(headerHeat(-1)).toBe(0)
  })

  it('heats gradually and gives the same result at different frame rates', () => {
    const after = (fps: number) => {
      let heat = 0
      for (let i = 0; i < 3 * fps; i++) heat = approachWallHeat(heat, 1, 1 / fps)
      return heat
    }
    expect(after(30)).toBeGreaterThan(0.5)
    expect(after(30)).toBeLessThan(0.8)
    expect(after(30)).toBeCloseTo(after(120), 10)
    expect(approachWallHeat(0, 1, 0)).toBe(0)
  })

  it('cools more slowly than it heats and never overshoots its target', () => {
    const heated = approachWallHeat(0, 1, 3)
    const cooled = approachWallHeat(1, 0, 3)
    expect(1 - cooled).toBeLessThan(heated)
    expect(cooled).toBeGreaterThan(0)
    expect(cooled).toBeLessThan(1)
    expect(approachWallHeat(0, 1, 1000)).toBe(1)
    expect(approachWallHeat(1, 0, 1000)).toBeCloseTo(0)
  })

  it('glows like the pipe walls: nothing when barely warm, dull red rising to orange', () => {
    expect(wallGlow(0)).toEqual([0, 0, 0])
    expect(wallGlow(0.12)).toEqual([0, 0, 0])
    const warm = wallGlow(0.5)
    const hot = wallGlow(1)
    // The pipe shader's emissive at full heat: mix(...)(1) × 1 × 1.5.
    expect(hot[0]).toBeCloseTo(0.95 * 1.5, 12)
    expect(hot[1]).toBeCloseTo(0.17 * 1.5, 12)
    expect(hot[2]).toBeCloseTo(0.02 * 1.5, 12)
    expect(warm[0]).toBeGreaterThan(0)
    expect(warm[0]).toBeLessThan(hot[0])
    // Redder while warm, more orange when hot.
    expect(warm[1] / warm[0]).toBeLessThan(hot[1] / hot[0])
  })
})

describe('header bores', () => {
  it('closes each header just inside its inlet with a disc facing back into the port', () => {
    const header = { points: [[0, 1, 0], [-1, 1, 0], [-1.5, 0.5, 0]] as Vec3[], radius: 0.1, header: true }
    const collector = { points: [[-1.5, 0.5, 0], [-3, 0.5, 0]] as Vec3[], radius: 0.16 }
    const [inlet, ...rest] = headerInlets([header, collector])
    expect(rest).toHaveLength(0)
    expect(inlet!.centre[0]).toBeCloseTo(-INLET_RECESS, 12)
    expect(inlet!.centre[1]).toBeCloseTo(1, 12)
    // The header runs along −x from the port, so its bore faces +x, back into the port.
    expect(inlet!.facing[0]).toBeCloseTo(1, 12)
    expect(inlet!.facing[1]).toBeCloseTo(0, 12)
    expect(inlet!.facing[2]).toBeCloseTo(0, 12)
    expect(inlet!.radius).toBeLessThan(header.radius)
    expect(inlet!.radius).toBeGreaterThan(0.9 * header.radius)
    // A degenerate header gets no disc rather than a NaN one.
    expect(headerInlets([{ points: [[0, 0, 0], [0, 0, 0]], radius: 0.1, header: true }])).toEqual([])
  })

  it('gives every production header a disc whose normal points back along the pipe', () => {
    for (const spec of engines) {
      const { pipes } = exhaustDrawing(productionPlumbing(spec), true)
      const inlets = headerInlets(pipes)
      expect(inlets).toHaveLength(pipes.filter((pipe) => pipe.header).length)
      expect(inlets.length).toBe(spec.cylinders)
      for (const inlet of inlets) expect(Math.hypot(...inlet.facing)).toBeCloseTo(1, 12)
    }
  })
})

/** A plain placement for the recipe tests: bank A on −z, bank B mirrored onto +z, no lean. */
const flatPlace = (side: ExhaustSide, x: number, p: ModelPoint): Vec3 => [x, p.y, side === 'B' ? -p.z : p.z]

function productionPlumbing(spec: EngineSpec) {
  if (isV10(spec)) return exhaustLayout(v10Model(spec).cylinders, spec.bankAngle, !spec.separateBanks)
  const events = firingEvents(spec.intervals, spec.order, bankOf(spec))
  const cylinders = cutawayLayout(spec, events, spec.bankAngle, rotationSense(spec, events))
  return exhaustPlumbing(
    cylinders.map((cylinder) => ({ index: cylinder.event.index, side: cylinder.side, x: cylinder.x })),
    (side, x, point) => cutawayToWorld(side, spec.bankAngle, cutawayMirror(spec.layout, side, false), x, point),
    { xFront: Math.max(...cylinders.map((cylinder) => cylinder.x)) + 0.45, xRear: Math.min(...cylinders.map((cylinder) => cylinder.x)) - 0.85, shared: !spec.separateBanks, longBank: longHeaderSide(spec) },
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
    const plumbing: ExhaustPlumbing = { headers: [], collectors: [], tailpipes: [tail], routes: new Map([[0, tail]]), routeSegments: new Map([[0, [tail]]]), routeFeeds: new Map([[0, [1]]]) }
    const framing = exhaustFramingPoints(plumbing)
    const bounds = (points: Vec3[], axis: number) => [Math.min(...points.map((point) => point[axis]!)), Math.max(...points.map((point) => point[axis]!))]
    const start = framing.slice(tail.length, tail.length + 8)
    expect(bounds(start, 0)).toEqual([1 - COLLECTOR_RADIUS * GAS_FILL, 1 + COLLECTOR_RADIUS * GAS_FILL])
    const end = framing.slice(-8)
    const radius = COLLECTOR_RADIUS * GAS_FILL + PLUME_SPREAD * PLUME_FRAMED
    expect(bounds(end, 0)).toEqual([1 - PLUME_FRAMED - radius, 1 - PLUME_FRAMED + radius])
    expect(bounds(end, 1)).toEqual([2 + 0.07 * PLUME_FRAMED ** 2 - radius, 2 + 0.07 * PLUME_FRAMED ** 2 + radius])
    expect(bounds(end, 2)).toEqual([1 - radius, 1 + radius])
  })

  it('handles empty plumbing and a collapsed outlet without creating invalid bounds', () => {
    const empty: ExhaustPlumbing = { headers: [], collectors: [], tailpipes: [], routes: new Map(), routeSegments: new Map(), routeFeeds: new Map() }
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
    // The blowdown peaks well before bottom dead centre of the exhaust stroke (40° after opening)…
    expect(at).toBeGreaterThan(20)
    expect(at).toBeLessThan(32)
    // …and moves over a third of the cycle's gas by then (the cylinder is still at several bar).
    expect(exhaustedShare(40)).toBeGreaterThan(0.33)
    expect(exhaustedShare(40)).toBeLessThan(0.45)
    // Mid exhaust stroke the piston keeps gas moving, more gently.
    expect(portFlow(130)).toBeGreaterThan(0.2)
    expect(portFlow(130)).toBeLessThan(0.4)
    // Fades to nothing as the valve closes, without a jump.
    expect(portFlow(EXHAUST_OPEN_DEG)).toBe(0)
    for (let e = 1; e <= EXHAUST_OPEN_DEG; e++) expect(Math.abs(portFlow(e) - portFlow(e - 1))).toBeLessThan(0.08)
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

describe('the header column', () => {
  const H = 1.33

  it('counts the share of a cycle’s gas out of the port, and inverts it', () => {
    expect(exhaustedShare(0)).toBe(0)
    expect(exhaustedShare(-5)).toBe(0)
    expect(exhaustedShare(EXHAUST_OPEN_DEG)).toBe(1)
    expect(exhaustedShare(700)).toBe(1)
    for (let e = 1; e <= EXHAUST_OPEN_DEG; e++) expect(exhaustedShare(e)).toBeGreaterThanOrEqual(exhaustedShare(e - 1))
    for (let e = 0.5; e < EXHAUST_OPEN_DEG; e += 0.5) if (portFlow(e) > 0.02) expect(Math.abs(emissionAtShare(exhaustedShare(e)) - e)).toBeLessThan(1)
    // A header holds about a tenth of a cycle's gas: the blowdown flushes it within a couple of dozen degrees.
    expect(emissionAtShare(H / CYCLE_GAS)).toBeLessThan(25)
  })

  it('tabulates the flow for the shader within one byte of the model', () => {
    const table = flowTable()
    expect(table).toHaveLength(FLOW_TEXELS * 4)
    for (let i = 0; i < FLOW_TEXELS; i++) {
      const u = i / (FLOW_TEXELS - 1)
      const e = u * EXHAUST_OPEN_DEG
      expect(Math.abs(table[i * 4]! / 255 - exhaustedShare(e))).toBeLessThanOrEqual(1 / 255)
      expect(Math.abs(table[i * 4 + 1]! / 255 - emissionAtShare(u) / EXHAUST_OPEN_DEG)).toBeLessThanOrEqual(1 / 255)
      expect(Math.abs(table[i * 4 + 2]! / 255 - portFlow(e))).toBeLessThanOrEqual(1 / 255)
      expect(Math.abs(table[i * 4 + 3]! / 255 - portTemperature(e))).toBeLessThanOrEqual(1 / 255)
    }
  })

  it('runs each cylinder’s clock from the playhead, counting cycles up to the label wrap', () => {
    for (const [playhead, lap, firing] of [[100, 3, 250], [700, 0, 0], [5, 9, 600]] as const) {
      const clock = slotClock(playhead, lap, firing)
      expect(clock.since).toBeCloseTo(sinceExhaustOpened(((playhead - firing + 360) % 720 + 720) % 720), 9)
      expect(clock.cycle).toBeGreaterThanOrEqual(0)
      expect(clock.cycle).toBeLessThan(LABEL_WRAP_CYCLES)
    }
    // One lap later is one cycle later.
    expect((slotClock(100, 4, 250).cycle - slotClock(100, 3, 250).cycle + LABEL_WRAP_CYCLES) % LABEL_WRAP_CYCLES).toBe(1)
  })

  it('keeps a header full, and still while its valve is shut, with only the gas ageing', () => {
    for (let since = 0; since < 720; since += 14.4) expect(parcelAt({ since, cycle: 2 }, 0.6, H).flow).toBe(1)
    const early = parcelAt({ since: 300, cycle: 3 }, 0.5, H)
    const late = parcelAt({ since: 600, cycle: 3 }, 0.5, H)
    expect(late.label).toBeCloseTo(early.label, 12)
    expect(late.age - early.age).toBeCloseTo(300, 6)
    // Soon after the valve opens the whole header holds gas from this cycle.
    for (let d = 0; d <= H; d += 0.1) expect(parcelAt({ since: 20, cycle: 1 }, d, H).age).toBeLessThan(21)
  })

  it('hands gas on from the header to the collector without a jump, older further downstream', () => {
    const clock = { since: 150, cycle: 4 }
    const inside = parcelAt(clock, H - 1e-6, H)
    const outside = parcelAt(clock, H + 1e-6, H)
    expect(Math.abs(inside.label - outside.label)).toBeLessThan(1e-3)
    expect(Math.abs(inside.age - outside.age)).toBeLessThan(1e-2)
    let previous = -1
    for (let d = 0; d < 8; d += 0.25) {
      const parcel = parcelAt(clock, d, H)
      expect(parcel.age).toBeGreaterThanOrEqual(-1e-9)
      expect(parcel.age).toBeGreaterThanOrEqual(previous - 1e-6)
      previous = parcel.age
    }
  })

  it('passes two cylinders’ bursts through their shared collector by firing gap and route length', () => {
    // Two cylinders 72° apart in firing whose headers join one collector 1.25 apart, as drawn.
    const cylinders = [{ index: 0, side: 'mid' as const, x: 0.625 }, { index: 1, side: 'mid' as const, x: -0.625 }]
    const layout = exhaustPlumbing(cylinders, flatPlace, { xFront: 1.1, xRear: -1.5, shared: false })
    const header = pathLength(layout.headers[0]!.points)
    // The collector's rear end: a point both cylinders' gas passes.
    const toRear = (index: number) => pathLength(layout.routes.get(index)!.slice(0, HEADER.length + 1))
    const firing = [0, 72]
    const peakAt = (index: number) => {
      let best = -1
      let at = 0
      for (let playhead = 0; playhead < 720; playhead += 0.25) {
        const flow = parcelAt(slotClock(playhead, 0, firing[index]!), toRear(index), header).flow
        if (flow > best) {
          best = flow
          at = playhead
        }
      }
      return at
    }
    const shorter = toRear(0) - toRear(1)
    expect(shorter).toBeCloseTo(1.25, 6)
    // Cylinder 1 fires 72° later but its gas has 1.25 units less to travel: a log manifold's spacing.
    const spacing = mod(peakAt(1) - peakAt(0) + 360, 720) - 360
    expect(spacing).toBeCloseTo(72 - shorter / FLOW_SPEED, 0)
  })

  it('cools gas towards the walls by its age, from the temperature it left the port with', () => {
    const fresh = { emitDeg: 20, age: 0 }
    expect(parcelTemperature(fresh, 1, 0.22, 0.001)).toBeCloseTo(portTemperature(20), 12)
    // Older gas is cooler, never below the wall temperature, and a hotter engine keeps it hotter.
    expect(parcelTemperature({ emitDeg: 20, age: 600 }, 1, 0.22, 0.001)).toBeLessThan(parcelTemperature(fresh, 1, 0.22, 0.001))
    expect(parcelTemperature({ emitDeg: 20, age: 1e6 }, 1, 0.22, 0.001)).toBeCloseTo(0.22, 9)
    expect(parcelTemperature({ emitDeg: 20, age: 300 }, 1, 0.22, 0.0005)).toBeGreaterThan(parcelTemperature({ emitDeg: 20, age: 300 }, 1, 0.22, 0.002))
    // Gas that left cooler than the walls is not warmed by them.
    expect(parcelTemperature({ emitDeg: 20, age: 500 }, 0.1, 0.22, 0.001)).toBeCloseTo(portTemperature(20) * 0.1, 12)
  })

  it('blurs the flow over a frame’s crank step without changing the cycle’s total', () => {
    for (const e of [10, 26, 90, 200]) expect(portFlowOver(e, 0, 4)).toBe(portFlow(e))
    let plain = 0
    let blurred = 0
    for (let e = 0; e < 720; e += 0.5) {
      plain += portFlow(e)
      blurred += portFlowOver(e, 40, 4)
    }
    expect(blurred).toBeCloseTo(plain, 6)
  })
})

describe('what drives the exhaust', () => {
  const spec = { idleRpm: 800, redlineRpm: 6000, ignition: 'spark' as const }
  const at = (rpm: number, throttle: number) => exhaustDrive({ running: true, rpm, throttle, limiting: false }, spec)

  it('is still and cold while the engine is stopped', () => {
    expect(exhaustDrive({ running: false, rpm: 0, throttle: 0, limiting: false }, spec)).toEqual({ load: 0, mass: 0, heat: 0, ageScale: 0, cut: 0 })
    expect(exhaustDrive(null, spec).load).toBe(0)
  })

  it('works harder with revs and with throttle, and runs a diesel cooler', () => {
    expect(at(4000, 0.5).load).toBeGreaterThan(at(2000, 0.5).load)
    expect(at(4000, 1).load).toBeGreaterThan(at(4000, 0.2).load)
    expect(at(4000, 1).mass).toBeGreaterThan(at(4000, 0.2).mass)
    expect(at(4000, 1).heat).toBeGreaterThan(at(1000, 1).heat)
    expect(exhaustDrive({ running: true, rpm: 4000, throttle: 1, limiting: false }, { ...spec, ignition: 'compression' }).heat).toBeLessThan(at(4000, 1).heat)
    // The pipes cool gas by the second, so at high revs it reaches the tailpipe hotter.
    expect(at(6000, 1).ageScale).toBeLessThan(at(1000, 1).ageScale)
  })

  it('keeps the headers dark when revving without load', () => {
    expect(wallHeatTarget(at(6000, 0.35).load, false)).toBeLessThan(0.1)
    expect(wallHeatTarget(at(6000, 1).load, false)).toBe(1)
  })
})

describe('exhaust drawing', () => {
  it('counts the cylinders sharing each stretch of pipe', () => {
    const viper = productionPlumbing(getEngine('v10-viper')!)
    for (const feeds of viper.routeFeeds.values()) expect(feeds).toEqual([1, 5, 5])
    const magnum = productionPlumbing(getEngine('v10-magnum')!)
    for (const feeds of magnum.routeFeeds.values()) expect(feeds).toEqual([1, 5, 5, 10])
    const inline = productionPlumbing(getEngine('inline-4')!)
    for (const feeds of inline.routeFeeds.values()) expect(feeds).toEqual([1, 4, 4])
  })

  it('gives the Subaru boxer’s bank B the longer pipes, merging under bank A', () => {
    const spec = getEngine('flat-4')!
    expect(longHeaderSide(spec)).toBe('B')
    expect(engines.filter((e) => e.id !== 'flat-4').every((e) => longHeaderSide(e) === undefined)).toBe(true)
    const layout = productionPlumbing(spec)
    // Cylinder for cylinder at the same place along the crank, bank B's gas has over a unit further to go.
    for (const b of layout.headers.filter((h) => h.side === 'B')) {
      const a = layout.headers.find((h) => h.side === 'A' && Math.abs(h.points[0]![0] - b.points[0]![0]) < 1e-9)!
      expect(pathLength(layout.routes.get(b.index)!)).toBeGreaterThan(pathLength(layout.routes.get(a.index)!) + 1)
    }
  })

  it('draws whole exhausts or header stubs, one route per cylinder, with the headers marked', () => {
    const layout = productionPlumbing(getEngine('v8-cross')!)
    const full = exhaustDrawing(layout, true)
    expect(full.routes).toHaveLength(8)
    expect(full.pipes.filter((p) => p.header)).toHaveLength(8)
    expect(full.pipes.filter((p) => !p.header).every((p) => p.radius > HEADER_RADIUS)).toBe(true)
    const stubs = exhaustDrawing(layout, false)
    expect(stubs.routes).toHaveLength(8)
    expect(stubs.pipes.every((p) => p.header && p.radius === HEADER_RADIUS)).toBe(true)
    for (const route of stubs.routes) {
      expect(route.segments).toHaveLength(1)
      expect(route.feeds).toEqual([1])
      expect(route.headerLength).toBeCloseTo(pathLength(route.points))
    }
  })

  it('dilutes the plume as it widens', () => {
    expect(plumeDilution(0)).toBe(1)
    for (let s = 0.2; s <= 2.4; s += 0.2) expect(plumeDilution(s)).toBeLessThan(plumeDilution(s - 0.2))
    expect(plumeDilution(2.4)).toBeLessThan(0.25)
  })
})
