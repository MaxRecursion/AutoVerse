import { describe, expect, it } from 'vitest'
import { crankPinPosition } from '@/features/engine-lab/kinematics'
import { MM } from '@/features/engine-lab/engineModel'
import { mod } from './animation'
import { engines, getEngine } from './engines'
import { firingEvents } from './firing'
import {
  BANK_STAGGER,
  camDirection,
  crankPinWorld,
  cycleAngle,
  describeThrow,
  exhaustLayout,
  isV10,
  moduleCrankDeg,
  pathLength,
  PULSE_START,
  pointAlong,
  pulseAt,
  throwLabel,
  throwPinOffset,
  throwX,
  toWorld,
  v10Framing,
  v10Model,
  type Vec3,
} from './v10Layout'

const V10S = engines.filter(isV10)

describe('the nine V10 presets', () => {
  it('are exactly the nine V10 families', () => {
    expect(V10S.map((e) => e.id).sort()).toEqual(
      ['v10-audi-52', 'v10-carrera-gt', 'v10-gallardo-even', 'v10-lfa', 'v10-magnum', 'v10-s85', 'v10-tdi', 'v10-triton', 'v10-viper'].sort(),
    )
  })

  it.each(V10S.map((e) => [e.id, e] as const))('%s: two cylinders per throw, bank B one rod width behind bank A', (_id, spec) => {
    const { cylinders } = v10Model(spec)
    expect(cylinders).toHaveLength(10)
    expect(new Set(cylinders.map((c) => c.event.index)).size).toBe(10)
    for (let t = 0; t < 5; t++) {
      const pair = cylinders.filter((c) => c.throwIndex === t)
      expect(pair.map((c) => c.side).sort()).toEqual(['A', 'B'])
      const a = pair.find((c) => c.side === 'A')!
      const b = pair.find((c) => c.side === 'B')!
      expect(a.x).toBeCloseTo(throwX(t))
      expect(a.x - b.x).toBeCloseTo(BANK_STAGGER)
      expect(a.mirror).toBe(-1)
      expect(b.mirror).toBe(1)
    }
  })
})

describe('crank throws in 3D', () => {
  it.each(['v10-viper', 'v10-magnum', 'v10-s85', 'v10-audi-52', 'v10-lfa', 'v10-carrera-gt'])('%s carries both rods of every throw on one shared pin', (id) => {
    const spec = getEngine(id)!
    const { cylinders, sense } = v10Model(spec)
    for (let t = 0; t < 5; t++) expect(throwPinOffset(cylinders, t, spec.bankAngle, sense)).toBe(0)
    // ...at every crank position, not just at rest.
    for (const playhead of [37, 211, 640]) {
      const [a, b] = [0, 1].map((k) => crankPinWorld(cylinders.filter((c) => c.throwIndex === 2)[k]!, spec.bankAngle, sense, playhead))
      expect(a![1]).toBeCloseTo(b![1], 9)
      expect(a![2]).toBeCloseTo(b![2], 9)
    }
  })

  it.each(['v10-gallardo-even', 'v10-triton', 'v10-tdi'])('%s shows crankpins split by 18°', (id) => {
    const spec = getEngine(id)!
    const { cylinders, sense } = v10Model(spec)
    for (let t = 0; t < 5; t++) expect([18, 342]).toContain(throwPinOffset(cylinders, t, spec.bankAngle, sense))
  })

  it('puts every pin at lean − sense·(playhead − firing) in the scene, mirrored copy or not', () => {
    for (const id of ['v10-viper', 'v10-s85', 'v10-carrera-gt']) {
      const spec = getEngine(id)!
      const { cylinders, sense } = v10Model(spec)
      for (const c of cylinders) {
        for (const playhead of [0, 95, 400]) {
          const p = crankPinWorld(c, spec.bankAngle, sense, playhead)
          const angle = (Math.atan2(p[2], p[1]) * 180) / Math.PI
          const lean = (c.side === 'A' ? 1 : -1) * (spec.bankAngle / 2)
          expect(mod(angle - (lean - sense * (playhead - c.event.angle)) + 180, 360) - 180).toBeCloseTo(0, 6)
        }
      }
    }
    // The mirrored copy turns its crank and cams the other way inside its own frame.
    expect(moduleCrankDeg(1, -1, 100, 40)).toBe(-moduleCrankDeg(1, 1, 100, 40))
    expect(camDirection(1, -1)).toBe(-camDirection(1, 1))
  })

  it('agrees with the Engine Lab pin for an upright, unmirrored cylinder', () => {
    const spec = getEngine('v10-lfa')!
    const { cylinders } = v10Model(spec)
    const b = cylinders.find((c) => c.side === 'B')!
    // Bank B is not mirrored; with a 0° "bank" it is upright, and sense −1 turns it the Engine Lab's way.
    const p = crankPinWorld(b, 0, -1, 123)
    const lab = crankPinPosition(123 - b.event.angle)
    expect(p[1]).toBeCloseTo(lab.y * MM, 9)
    expect(p[2]).toBeCloseTo(lab.z * MM, 9)
  })

  it('times valves and spark from firing top dead centre at the Engine Lab’s 360°', () => {
    expect(cycleAngle(250, 250)).toBe(360)
    expect(cycleAngle(0, 650)).toBe(430)
  })
})

describe('exhausts', () => {
  const at = (id: string) => {
    const spec = getEngine(id)!
    const { cylinders } = v10Model(spec)
    return { spec, cylinders, layout: exhaustLayout(cylinders, spec.bankAngle, !spec.separateBanks) }
  }

  it('starts each header at its cylinder’s exhaust port, on the outside of its bank', () => {
    const { cylinders, layout } = at('v10-viper')
    for (const h of layout.headers) {
      const c = cylinders.find((x) => x.event.index === h.index)!
      expect(h.points[0]![0]).toBeCloseTo(c.x)
      // Bank A leans to +z and exhausts further out on +z; bank B mirrors that.
      expect(Math.sign(h.points[0]![2])).toBe(c.side === 'A' ? 1 : -1)
      expect(Math.abs(h.points[0]![2])).toBeGreaterThan(Math.abs(toWorld(c.side, 90, c.x, { z: 0, y: 2.55 })[2]))
    }
  })

  it('keeps separate bank exhausts apart and joins a shared exhaust in the middle', () => {
    const separate = at('v10-viper').layout
    expect(separate.tailpipes).toHaveLength(2)
    expect(separate.tailpipes.every((pipe) => pipe.every((p) => Math.abs(p[2]) > 0.5))).toBe(true)
    const shared = at('v10-magnum').layout
    const outlet = shared.tailpipes.at(-1)!.at(-1)!
    expect(outlet[2]).toBe(0)
    for (const route of shared.routes.values()) expect(route.at(-1)).toEqual(outlet)
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

  it('launches a pulse when the exhaust valve opens and spaces pulses by their firing gaps', () => {
    expect(pulseAt(PULSE_START, 10, 0.01)).toMatchObject({ distance: 0, visible: true, heat: 1 })
    expect(pulseAt(PULSE_START - 1, 10, 0.01).visible).toBe(false)
    // Once it has run past the end of its route it is gone.
    expect(pulseAt(PULSE_START + 600, 10, 0.05).visible).toBe(false)
    // Two cylinders 54° apart in firing: their pulses are 54° × speed apart along a shared pipe.
    const speed = 0.02
    const first = pulseAt(mod(PULSE_START + 200, 720), 30, speed).distance
    const second = pulseAt(mod(PULSE_START + 200 - 54, 720), 30, speed).distance
    expect(first - second).toBeCloseTo(54 * speed)
  })
})

describe('views and words', () => {
  it('frames one throw closer than the whole engine', () => {
    const d = (p: { position: number[]; target: number[] }) => Math.hypot(...p.position.map((v, i) => v - p.target[i]!))
    expect(d(v10Framing('pair', 90, 1.6))).toBeLessThan(d(v10Framing('engine', 90, 1.6)))
    expect(d(v10Framing('pair', 90, 0.8))).toBeGreaterThan(d(v10Framing('pair', 90, 1.6)))
  })

  it('names throws by maker numbering, or by bank when it is not published', () => {
    const viper = v10Model(getEngine('v10-viper')!)
    expect(throwLabel(viper.cylinders, 0)).toBe('1 · 2')
    const s85 = v10Model(getEngine('v10-s85')!)
    expect(throwLabel(s85.cylinders, 0)).toBe('1 · 6')
    const lfa = v10Model(getEngine('v10-lfa')!)
    expect(throwLabel(lfa.cylinders, 0)).toBe('A · B')
  })

  it('describes shared and split pins', () => {
    expect(describeThrow(0)).toMatch(/shared crankpin/)
    expect(describeThrow(342)).toMatch(/split 18°/)
    expect(describeThrow(null)).toBe('')
  })

  it('uses the production order, whatever the experiment does', () => {
    const spec = getEngine('v10-viper')!
    const experiment = firingEvents(Array(10).fill(72), spec.order, () => 'A')
    expect(v10Model(spec).cylinders.map((c) => c.event.angle)).not.toEqual(experiment.map((e) => e.angle))
  })
})
