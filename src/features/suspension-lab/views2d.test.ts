import { describe, expect, it } from 'vitest'
import { CHART, buildChart, chartRange, chartX } from './chartGeometry'
import { FRONT, SCHEMATIC, frontSvg, frontView, schematic } from './diagram2d'
import { SPRING_RATE_RANGE, responseFor } from './quarterCar'
import { suspensionFrameAt } from './suspensionModel'
import { describeFrame, formatCamber, formatLoad, formatMm, formatTravel, responseVerdict, suspensionMotionLabel } from './suspensionText'

const ROADS = ['bump', 'pothole', 'washboard'] as const
const DAMPERS = ['soft', 'balanced', 'stiff'] as const
const LAP = Array.from({ length: 41 }, (_, i) => i / 40)
const settingsGrid = ROADS.flatMap((road) => DAMPERS.flatMap((damping) => [SPRING_RATE_RANGE.min, SPRING_RATE_RANGE.max].map((springRate) => ({ road, damping, springRate }))))

describe('response chart geometry', () => {
  it('spans the plot with one point per sample and a cursor on the same lap position', () => {
    const r = responseFor({ road: 'bump', damping: 'balanced', springRate: 25 })
    const chart = buildChart(r)
    expect(chart.body.match(/[ML]/g)).toHaveLength(r.count)
    expect(chart.body.startsWith(`M${CHART.left.toFixed(1)} `)).toBe(true)
    expect(chartX(0)).toBe(CHART.left)
    expect(chartX(1)).toBe(CHART.width - CHART.right)
    expect(chartX(-1)).toBe(CHART.left)
    expect(chart.timeTicks.map((t) => t.s)).toEqual([0, 0.5, 1, 1.5, 2])
  })

  it('keeps every series inside a range that includes ±20 mm, with a zero line', () => {
    for (const s of settingsGrid) {
      const r = responseFor(s)
      const { minMm, maxMm } = chartRange(r)
      expect(minMm).toBeLessThanOrEqual(-20)
      expect(maxMm).toBeGreaterThanOrEqual(20)
      for (let i = 0; i < r.count; i++)
        for (const v of [r.body[i], r.wheel[i], r.roadZ[i]]) {
          expect(v * 1000).toBeGreaterThanOrEqual(minMm - 1e-9)
          expect(v * 1000).toBeLessThanOrEqual(maxMm + 1e-9)
        }
      const chart = buildChart(r)
      expect(chart.ticks.some((t) => t.mm === 0 && t.y === chart.zeroY)).toBe(true)
    }
  })

  it('shades the stretches where the tyre is off the road, and only those', () => {
    const gentle = buildChart(responseFor({ road: 'bump', damping: 'balanced', springRate: 25 }))
    expect(gentle.airborne).toHaveLength(0)
    const r = responseFor({ road: 'pothole', damping: 'balanced', springRate: 25 })
    const chart = buildChart(r)
    expect(chart.airborne.length).toBeGreaterThan(0)
    const plotW = CHART.width - CHART.left - CHART.right
    const shaded = chart.airborne.reduce((sum, a) => sum + (a.x1 - a.x0), 0) / plotW
    expect(shaded * r.duration).toBeCloseTo(r.stats.airborneSeconds, 2)
  })
})

describe('2D diagram geometry', () => {
  it('draws the arms ending on the ball joints and the wheel at the linkage’s wheel centre', () => {
    for (const p of LAP) {
      const f = suspensionFrameAt(p, { road: 'pothole', damping: 'soft', springRate: 25 })
      const fv = frontView(f)
      expect(fv.lowerArm[1]).toEqual(fv.ballJoints[0])
      expect(fv.upperArm[1]).toEqual(fv.ballJoints[1])
      expect(fv.knuckle[0]).toEqual(fv.ballJoints[0])
      expect(fv.knuckle.at(-1)![0]).toBeCloseTo(fv.ballJoints[1][0], 9)
      expect(fv.knuckle.at(-1)![1]).toBeCloseTo(fv.ballJoints[1][1], 9)
      expect(fv.wheelCentre[1]).toBeCloseTo(frontSvg(0, f.wheelCentreY)[1], 9)
      expect(fv.roadY).toBeCloseTo(frontSvg(0, f.pose.roadZ)[1], 9)
      expect(fv.load.width > 0).toBe(f.pose.contact)
    }
  })

  it('keeps the front view on its canvas and the schematic damper piston inside its cylinder', () => {
    for (const s of settingsGrid)
      for (const p of LAP) {
        const f = suspensionFrameAt(p, s)
        const fv = frontView(f)
        for (const [x, y] of [...fv.tyre, ...fv.ballJoints, fv.lowerArm[0], fv.upperArm[0]]) {
          expect(x).toBeGreaterThanOrEqual(0)
          expect(x).toBeLessThanOrEqual(FRONT.width)
          expect(y).toBeGreaterThanOrEqual(0)
          expect(y).toBeLessThanOrEqual(FRONT.height)
        }
        const sc = schematic(f)
        const cyl = sc.damperCylinder
        const pistonY = sc.piston[0][1]
        expect(pistonY, `${s.road}/${s.damping}/${s.springRate} @ ${p}`).toBeGreaterThan(cyl.y)
        expect(pistonY, `${s.road}/${s.damping}/${s.springRate} @ ${p}`).toBeLessThan(cyl.y + cyl.h)
        expect(sc.contact.touching).toBe(f.pose.contact)
        expect(sc.body.y + sc.body.h).toBeLessThan(sc.wheel.y)
        expect(sc.body.y).toBeGreaterThan(0)
        expect(sc.contact.y).toBeLessThanOrEqual(SCHEMATIC.height)
      }
  })
})

describe('suspension wording', () => {
  it('formats signed millimetres, travel, load and camber', () => {
    expect(formatMm(0.0124)).toBe('+12 mm')
    expect(formatMm(-0.003)).toBe('−3 mm')
    expect(formatMm(0.0002)).toBe('0 mm')
    expect(formatTravel(0.024)).toBe('24 mm bump')
    expect(formatTravel(-0.009)).toBe('9 mm rebound')
    expect(formatTravel(0)).toBe('at ride height')
    expect(formatLoad(1.254, true)).toBe('1.25 × static')
    expect(formatLoad(0, false)).toBe('off the road')
    expect(formatCamber(-1.24)).toBe('−1.2°')
    expect(formatCamber(0.01)).toBe('0.0°')
    expect(suspensionMotionLabel(0.2)).toBe('Compressing')
    expect(suspensionMotionLabel(-0.2)).toBe('Extending')
    expect(suspensionMotionLabel(0.001)).toBe('Nearly still')
  })

  it('describes a frame and a whole lap in words', () => {
    const f = suspensionFrameAt(0.1, { road: 'bump', damping: 'stiff', springRate: 25 })
    expect(describeFrame(f)).toMatch(/^Approach\. Body 0 mm, wheel 0 mm, suspension at ride height, tyre load 1\.00 × static, camber change 0\.0°\.$/)
    expect(responseVerdict(responseFor({ road: 'bump', damping: 'balanced', springRate: 25 }))).toMatch(/the tyre stayed on the road/)
    expect(responseVerdict(responseFor({ road: 'bump', damping: 'balanced', springRate: 15 }))).toMatch(/reached its rubber stop/)
    expect(responseVerdict(responseFor({ road: 'pothole', damping: 'balanced', springRate: 25 }))).toMatch(/the tyre left the road for 40 ms in total/)
  })
})
