import { describe, expect, it } from 'vitest'
import { CLUTCH, GEARS, type GearId } from './gearbox'
import { powerPathKeys } from './powerPath'
import { SVG_SCALE, powerFlowLine, schematicLayout } from './schematic2d'

const rect = (gear: GearId, key: string, pedal = 0) => {
  const r = schematicLayout(gear, pedal).rects.find((x) => x.key === key)
  if (!r) throw new Error(`no rect ${key}`)
  return r
}

describe('gearbox schematic layout', () => {
  it('draws each meshing pair as bars that meet at the pitch point', () => {
    for (const [main, lay] of [
      ['pinion', 'lay-head'],
      ['main-1', 'lay-1'],
      ['main-2', 'lay-2'],
      ['main-3', 'lay-3'],
      ['main-5', 'lay-5'],
    ]) {
      const m = rect('N', main)
      const l = rect('N', lay)
      // SVG y grows downwards: the mainshaft bar's bottom edge is the layshaft bar's top edge.
      expect(m.y + m.h).toBeCloseTo(l.y, 6)
    }
  })

  it('sizes bars from tooth counts (bar height ∝ teeth)', () => {
    const big = rect('1', 'main-1')
    const small = rect('1', 'lay-1')
    expect(big.teeth).toBe(37)
    expect(small.teeth).toBe(17)
    expect(big.h / small.h).toBeCloseTo(37 / 17, 6)
  })

  it('marks exactly the power-path elements as active', () => {
    for (const gear of GEARS) {
      const layout = schematicLayout(gear, 0)
      const active = new Set(layout.rects.filter((r) => r.active).map((r) => r.key))
      expect(active).toEqual(new Set(powerPathKeys(gear, 1)))
    }
  })

  it('shows no path in neutral or with the clutch released', () => {
    expect(schematicLayout('N', 0).path).toEqual([])
    expect(schematicLayout('3', 1).path).toEqual([])
    expect(schematicLayout('3', 1).rects.some((r) => r.active)).toBe(false)
  })

  it('keeps the path but dims it while the clutch slips', () => {
    const slip = schematicLayout('1', CLUTCH.slipPedal)
    expect(slip.path.length).toBeGreaterThan(0)
    expect(slip.torqueFraction).toBeGreaterThan(0)
    expect(slip.torqueFraction).toBeLessThan(1)
  })

  it('routes the path through the layshaft for indirect gears and straight through for direct drive', () => {
    expect(powerFlowLine('4')).toHaveLength(2)
    const first = powerFlowLine('1')
    const lowest = Math.max(...first.map(([, y]) => y))
    expect(lowest).toBeGreaterThan(0) // dips below the mainshaft to the layshaft
    expect(first[0][1]).toBe(first[first.length - 1][1]) // starts and ends on the main axis
  })

  it('slides the idler into line with the mainshaft reverse gear only in reverse', () => {
    const idlerR = rect('R', 'idler')
    const idlerN = rect('N', 'idler')
    const mainRev = rect('R', 'main-reverse')
    const centre = (r: { x: number; w: number }) => r.x + r.w / 2
    expect(centre(idlerR)).toBeCloseTo(centre(mainRev), 6)
    expect(Math.abs(centre(idlerN) - centre(mainRev))).toBeGreaterThan(0.2 * SVG_SCALE)
  })

  it('draws each synchro collar slid towards the gear it locks', () => {
    const neutral = rect('N', 'sync-h12')
    expect(rect('1', 'sync-h12').x).toBeGreaterThan(neutral.x) // 1st is behind the 1–2 hub (towards the output)
    expect(rect('2', 'sync-h12').x).toBeLessThan(neutral.x)
    expect(rect('4', 'sync-h34').x).toBeLessThan(rect('N', 'sync-h34').x) // towards the input pinion
  })

  it('opens a visible gap between plate and disc when the pedal is down', () => {
    const plateUp = rect('1', 'plate', 0)
    const plateDown = rect('1', 'plate', 1)
    expect(plateDown.x - plateUp.x).toBeGreaterThan(5)
  })
})
