import { BufferGeometry } from 'three'
import { describe, expect, it } from 'vitest'
import { HEAD_PAIR, SPEED_PAIRS } from './gearbox'
import { HELIX_ANGLE, MODULE, tipRadius } from './gearboxModel'
import { buildGearboxGeometries, disposeAll, gearGeometry } from './gearGeometry'

/** Angles (ψ from +y towards +z) of the tooth-tip vertices on the face at x ≈ xFace. */
function tipAngles(g: BufferGeometry, teeth: number, xFace: number): number[] {
  const pos = g.getAttribute('position')
  const tip = tipRadius(teeth, MODULE)
  const out: number[] = []
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const r = Math.hypot(pos.getY(i), pos.getZ(i))
    if (Math.abs(x - xFace) < 1e-5 && Math.abs(r - tip) < 1e-5) out.push(Math.atan2(pos.getZ(i), pos.getY(i)))
  }
  return out
}

/** Distinct values (to 1e-4, positions are float32) of a list of angles normalised to [0, 2π). */
const distinct = (angles: number[]) => [...new Set(angles.map((a) => (((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)).toFixed(4)))].map(Number)

describe('procedural gear geometry', () => {
  it('has one tooth per tooth count, two tip corners each', () => {
    for (const teeth of [HEAD_PAIR.driver, HEAD_PAIR.driven, SPEED_PAIRS['1'].driven, SPEED_PAIRS['5'].driver]) {
      const g = gearGeometry({ teeth, width: 0.2 })
      expect(distinct(tipAngles(g, teeth, 0.1))).toHaveLength(2 * teeth)
      g.dispose()
    }
  })

  it('centres tooth 0 on +y (ψ = 0), as the meshing maths assumes', () => {
    const teeth = 20
    const g = gearGeometry({ teeth, width: 0.2 })
    const tips = distinct(tipAngles(g, teeth, 0.1)).map((a) => (a > Math.PI ? a - 2 * Math.PI : a))
    const nearest = tips.filter((a) => Math.abs(a) < Math.PI / teeth)
    expect(nearest).toHaveLength(2)
    expect(nearest[0] + nearest[1]).toBeCloseTo(0, 3)
    g.dispose()
  })

  it('twists helical teeth about the face centre without moving the mid-face tooth positions', () => {
    const teeth = 30
    const width = 0.2
    const pitch = (2 * Math.PI) / teeth
    const helical = gearGeometry({ teeth, width, helix: HELIX_ANGLE, steps: 2 })
    // steps: 2 puts a ring of vertices on the mid plane (x = 0); there the tips sit exactly where an untwisted gear has them.
    const raw = Array.from({ length: teeth }, (_, k) => [(k - 0.13) * pitch, (k + 0.13) * pitch]).flat()
    const expected = distinct(raw).sort((a, b) => a - b)
    const mid = distinct(tipAngles(helical, teeth, 0)).sort((a, b) => a - b)
    expect(mid).toHaveLength(expected.length)
    mid.forEach((a, i) => expect(a).toBeCloseTo(expected[i], 3))
    // The two faces are rotated opposite ways by the helix: x · tanβ / r_pitch.
    const twist = ((width / 2) * Math.tan(HELIX_ANGLE)) / ((MODULE * teeth) / 2)
    const front = distinct(tipAngles(helical, teeth, width / 2)).sort((a, b) => a - b)
    const expectedFront = distinct(raw.map((a) => a + twist)).sort((a, b) => a - b)
    expect(front).toHaveLength(expectedFront.length)
    front.forEach((a, i) => expect(a).toBeCloseTo(expectedFront[i], 3))
    helical.dispose()
  })

  it('builds and disposes the whole gearbox at both quality tiers', () => {
    for (const tier of ['low', 'high'] as const) {
      const geo = buildGearboxGeometries(tier)
      expect(geo.gears.main['1'].getAttribute('position').count).toBeGreaterThan(0)
      expect(geo.casing.section.getAttribute('position').count).toBeGreaterThan(0)
      expect(() => disposeAll(geo)).not.toThrow()
    }
  })
})
