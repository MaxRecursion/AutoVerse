import { Box3, BufferGeometry, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import components from '@/content/components/braking.json'
import { getComponent } from '@/lib/content'
import sceneSource from './BrakeScene.tsx?raw'
import { BRAKE_SPEC } from './braking'
import { BRAKE_DETAIL, buildBrakeGeometries, disposeAll, triangleCount, type BrakeGeometries } from './brakeGeometry'
import {
  ABS_UNIT,
  AXIS_Y,
  BRAKE_PART_IDS,
  CALIPER,
  CALIPER_INLET,
  DISC,
  DISC_FACE,
  EXPLODE,
  MASTER,
  PAD_GAP,
  PAD_STACK,
  RIM,
  TYRE,
  UNITS_PER_M,
  brakeLinePoints,
  caliperToWorld,
  schematicToWorld,
} from './brakeParts'

/**
 * Scene-level checks that need no WebGL: every educational part is a real
 * <Part> in the scene and is described in the components file, and the
 * procedural geometry is laid out so the animation the scene applies (one
 * X rotation for the wheel group, one X offset per pad) is physically
 * coherent — pads close exactly onto the disc, spinning parts are centred on
 * the axle, and the brake line joins the parts it claims to join.
 */

const high = buildBrakeGeometries(BRAKE_DETAIL.high)
const low = buildBrakeGeometries(BRAKE_DETAIL.low)

const box = (g: BufferGeometry) => {
  g.computeBoundingBox()
  return g.boundingBox ?? new Box3()
}

function geometries(obj: unknown): BufferGeometry[] {
  if (obj instanceof BufferGeometry) return [obj]
  if (obj && typeof obj === 'object') return Object.values(obj).flatMap(geometries)
  return []
}

describe('brake scene parts', () => {
  it('wraps every educational part in exactly one <Part> with a matching component entry', () => {
    const ids = [...sceneSource.matchAll(/<Part\s+id="([^"]+)"/g)].map((m) => m[1])
    expect([...ids].sort()).toEqual([...BRAKE_PART_IDS].sort())
    expect(new Set(components.map((c) => c.id))).toEqual(new Set(BRAKE_PART_IDS))
    for (const id of BRAKE_PART_IDS) {
      expect(getComponent(id)?.systemId, id).toBe('braking')
      expect(EXPLODE[id], id).toHaveLength(3)
    }
  })

  it('reads the animation from the store inside useFrame, with one closed-form wheel angle for every spinning part', () => {
    expect(sceneSource).toMatch(/useFrame\(\(\) => \{\s+const lab = store\.getState\(\)/)
    expect(sceneSource).toMatch(/const spin = -st\.wheelAngle/)
    expect(sceneSource).toMatch(/for \(const g of \[wheelSpin, hubSpin, discSpin, toneSpin\]\) if \(g\.current\) g\.current\.rotation\.x = spin/)
    // No per-frame integration of deltas.
    expect(sceneSource).not.toMatch(/useFrame\(\(_?\w*, ?delta\)/)
    expect(sceneSource).not.toMatch(/rotation\.\w \+=/)
  })
})

describe('brake geometry', () => {
  it('builds finite geometry for both quality tiers, lighter on the low tier', () => {
    for (const set of [low, high]) {
      for (const g of geometries(set)) {
        const pos = g.getAttribute('position')
        expect(pos.count).toBeGreaterThan(0)
        for (let i = 0; i < pos.array.length; i++) expect(Number.isFinite(pos.array[i])).toBe(true)
      }
    }
    const lowTris = triangleCount(low)
    const highTris = triangleCount(high)
    expect(lowTris).toBeLessThan(highTris)
    expect(lowTris).toBeLessThan(60_000)
    expect(highTris).toBeLessThan(150_000)
  })

  it('centres every spinning part on the axle, so one X rotation turns them without wobble', () => {
    const spinning = (g: BrakeGeometries) => [g.wheel.tyre, g.wheel.tread, g.wheel.rim, g.wheel.barrel, g.hub.spin, g.disc.body, g.disc.slots, g.tone.ring]
    for (const g of spinning(high)) {
      const b = box(g)
      // Symmetric about the axle in Y and Z (the tyre's sidewall mark is a separate mesh).
      expect(b.max.y + b.min.y).toBeCloseTo(0, 1)
      expect(b.max.z + b.min.z).toBeCloseTo(0, 1)
    }
  })

  it('fits the disc inside the rim and the caliper bridge over the disc', () => {
    // The friction ring (where the pads run) lies between the two disc faces; the hat may reach outboard to the hub.
    const pos = high.disc.body.getAttribute('position')
    let ringMin = Infinity
    let ringMax = -Infinity
    let maxR = 0
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getY(i), pos.getZ(i))
      maxR = Math.max(maxR, r)
      if (r < CALIPER.padInnerRadius) continue
      ringMin = Math.min(ringMin, pos.getX(i))
      ringMax = Math.max(ringMax, pos.getX(i))
    }
    expect(ringMin).toBeCloseTo(DISC_FACE.inboard, 3)
    expect(ringMax).toBeCloseTo(DISC_FACE.outboard, 3)
    expect(maxR).toBeLessThanOrEqual(DISC.outerRadius + 1e-4)
    expect(DISC.outerRadius).toBeLessThan(CALIPER.bridgeInnerRadius)
    expect(CALIPER.bridgeOuterRadius).toBeLessThan(RIM.radius)
    expect(RIM.radius).toBeLessThan(TYRE.radius)
  })

  it('places the pads on the disc’s friction ring, centred on the effective radius the maths uses', () => {
    expect(CALIPER.padInnerRadius).toBeGreaterThanOrEqual(DISC.innerRadius)
    expect(CALIPER.padOuterRadius).toBeLessThanOrEqual(DISC.outerRadius)
    const centreM = (CALIPER.padInnerRadius + CALIPER.padOuterRadius) / 2 / UNITS_PER_M
    expect(Math.abs(centreM - BRAKE_SPEC.effectiveRadiusM) / BRAKE_SPEC.effectiveRadiusM).toBeLessThan(0.05)
    expect(TYRE.radius / UNITS_PER_M).toBeCloseTo(BRAKE_SPEC.tyreRadiusM, 6)
  })

  it('leaves a running clearance at rest that the clamp offset closes exactly onto both disc faces', () => {
    const inner = box(high.caliper.innerFriction)
    const outer = box(high.caliper.outerFriction)
    const piston = box(high.caliper.piston)
    // At rest: PAD_GAP either side of the disc.
    expect(DISC_FACE.inboard - inner.max.x).toBeCloseTo(PAD_GAP, 4)
    expect(outer.min.x - DISC_FACE.outboard).toBeCloseTo(PAD_GAP, 4)
    // Fully clamped (padContact = 1) the scene shifts the inner pad by +PAD_GAP and the floating body + outer pad by −PAD_GAP.
    expect(inner.max.x + PAD_GAP).toBeCloseTo(DISC_FACE.inboard, 6)
    expect(outer.min.x - PAD_GAP).toBeCloseTo(DISC_FACE.outboard, 6)
    // The piston bears on the inner pad's backing plate.
    expect(piston.max.x).toBeCloseTo(PAD_STACK.pistonFace, 4)
    expect(box(high.caliper.innerBacking).min.x).toBeCloseTo(PAD_STACK.pistonFace, 4)
  })

  it('runs the brake line from the master cylinder through the ABS modulator to the caliper inlet', () => {
    const { a, b } = brakeLinePoints()
    const close = (p: number[], q: number[]) => p.forEach((v, i) => expect(v).toBeCloseTo(q[i], 6))
    close(a[0], schematicToWorld([MASTER.outletX, AXIS_Y, 0]))
    close(a[a.length - 1], schematicToWorld([ABS_UNIT.x - ABS_UNIT.width / 2, AXIS_Y, 0]))
    close(b[b.length - 1], caliperToWorld(CALIPER_INLET))
    // The tube geometry follows those points.
    const tubeA = box(high.lines.lineA)
    for (const p of a) expect(tubeA.distanceToPoint(new Vector3(...p))).toBeLessThan(1e-3)
  })

  it('disposes every geometry it built', () => {
    const set = buildBrakeGeometries(BRAKE_DETAIL.low)
    let disposed = 0
    for (const g of geometries(set)) g.addEventListener('dispose', () => disposed++)
    disposeAll(set)
    expect(disposed).toBe(geometries(set).length)
  })
})
