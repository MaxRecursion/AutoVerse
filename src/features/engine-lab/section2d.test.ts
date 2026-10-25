import { describe, expect, it } from 'vitest'
import { CAM_CENTRE_S, CRANK_R, DECK_Y, MM, VALVES, VALVE_S, alongValve, camCentre, visualLift } from './engineModel'
import { crankPinPosition, pistonPinHeight } from './kinematics'
import {
  CRANK_WEB_POINTS,
  SECTION_VIEWBOX,
  buildStaticSection,
  camLobeOutline,
  crankSvgRotation,
  gasRegion,
  pistonDrawing,
  rodDrawing,
  toSvg,
  valveOutline,
  valvetrainDrawing,
} from './section2d'

const ANGLES = Array.from({ length: 145 }, (_, i) => i * 5)
const dist = (a: { z: number; y: number }, b: { z: number; y: number }) => Math.hypot(a.z - b.z, a.y - b.y)

/** Distance from a point to a closed polygon's edges. */
function distanceToPolygon(p: { z: number; y: number }, poly: { z: number; y: number }[]) {
  let best = Infinity
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const abz = b.z - a.z
    const aby = b.y - a.y
    const t = Math.max(0, Math.min(1, ((p.z - a.z) * abz + (p.y - a.y) * aby) / (abz * abz + aby * aby || 1)))
    best = Math.min(best, Math.hypot(p.z - (a.z + abz * t), p.y - (a.y + aby * t)))
  }
  return best
}

describe('2D section mapping', () => {
  it('views from the cut-away side: intake (+z) on the left, up is up', () => {
    const [xIntake] = toSvg(VALVES.intake.seat)
    const [xExhaust] = toSvg(VALVES.exhaust.seat)
    expect(xIntake).toBeLessThan(0)
    expect(xExhaust).toBeGreaterThan(0)
    expect(toSvg({ z: 0, y: DECK_Y })[1]).toBeLessThan(toSvg({ z: 0, y: 0 })[1])
  })

  it('frames every static piece inside the viewBox', () => {
    const s = buildStaticSection()
    const all = [...s.block, ...s.liner, ...s.head, s.headBehind, s.sump.pan, ...Object.values(s.ports), s.belt].flat()
    const vb = SECTION_VIEWBOX
    for (const p of all) {
      const [x, y] = toSvg(p)
      expect(x).toBeGreaterThanOrEqual(vb.x)
      expect(x).toBeLessThanOrEqual(vb.x + vb.width)
      expect(y).toBeGreaterThanOrEqual(vb.y)
      expect(y).toBeLessThanOrEqual(vb.y + vb.height)
    }
  })
})

describe('2D moving parts', () => {
  it('draws the rod between exactly the wrist pin and the crank pin', () => {
    for (const deg of ANGLES) {
      const pin = pistonPinHeight(deg)
      const crank = crankPinPosition(deg)
      const rod = rodDrawing(pin, crank)
      expect(rod.small.c.y).toBeCloseTo(pin * MM, 9)
      expect(rod.small.c.z).toBe(0)
      expect(rod.big.c.y).toBeCloseTo(crank.y * MM, 9)
      expect(rod.big.c.z).toBeCloseTo(crank.z * MM, 9)
    }
  })

  it('puts the piston crown under the gas region and below the deck', () => {
    for (const deg of ANGLES) {
      const p = pistonDrawing(pistonPinHeight(deg) * MM)
      expect(p.crownY).toBeLessThan(DECK_Y)
      expect(gasRegion(p.crownY)[0].y).toBe(p.crownY)
    }
  })

  it('rotates the crank web so its pin follows the crank angle', () => {
    // SVG rotate(a) maps (x, y) → (x cos a − y sin a, x sin a + y cos a); the pin starts straight up.
    for (const deg of [0, 45, 90, 200, 333]) {
      const a = (crankSvgRotation(deg) * Math.PI) / 180
      const R = CRANK_R * 100
      const x = R * Math.sin(a)
      const y = -R * Math.cos(a)
      const pin = crankPinPosition(deg)
      const [ex, ey] = toSvg({ z: pin.z * MM, y: pin.y * MM })
      expect(x).toBeCloseTo(ex, 6)
      expect(y).toBeCloseTo(ey, 6)
    }
    expect(CRANK_WEB_POINTS.split(' ').length).toBeGreaterThan(30)
  })

  it('slides each valve down its own axis by the drawn lift', () => {
    for (const valve of ['intake', 'exhaust'] as const) {
      const shut = valveOutline(valve, 0)
      const lift = visualLift(valve, valve === 'intake' ? 100 : 620)
      expect(lift).toBeGreaterThan(0)
      const open = valveOutline(valve, lift)
      const axis = VALVES[valve].axis
      open.forEach((p, i) => {
        expect(p.z).toBeCloseTo(shut[i].z - axis.z * lift, 9)
        expect(p.y).toBeCloseTo(shut[i].y - axis.y * lift, 9)
      })
    }
  })

  it('keeps the spring between its seat and the moving retainer', () => {
    const v = VALVES.intake
    for (const deg of ANGLES) {
      const lift = visualLift('intake', deg)
      const d = valvetrainDrawing('intake', lift)
      expect(dist(d.spring[0], alongValve(v, VALVE_S.springSeat))).toBeLessThan(1e-9)
      expect(dist(d.spring[d.spring.length - 1], alongValve(v, VALVE_S.retainer - 0.022 - lift))).toBeLessThan(1e-9)
    }
  })

  it('keeps the roller touching the rotating cam lobe at every crank angle', () => {
    for (const valve of ['intake', 'exhaust'] as const) {
      for (const deg of ANGLES) {
        const d = valvetrainDrawing(valve, visualLift(valve, deg))
        const lobe = camLobeOutline(valve, deg)
        expect(Math.abs(distanceToPolygon(d.roller.c, lobe) - d.roller.r)).toBeLessThan(0.004)
      }
      // The lobe turns about the cam centre (half crank speed): the centre itself is fixed.
      expect(dist(camCentre(valve), alongValve(VALVES[valve], CAM_CENTRE_S))).toBeLessThan(1e-9)
    }
  })
})
