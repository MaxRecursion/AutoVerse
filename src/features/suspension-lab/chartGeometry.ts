/**
 * Geometry for the small "body vs wheel" response chart (pure): SVG paths of
 * the sampled response over one lap, the road profile under the tyre, and the
 * stretches where the tyre is off the road. The chart cursor is just
 * chartX(progress) — the same lap position that drives the 3D scene.
 */
import type { QuarterCarResponse } from './quarterCar'

export const CHART = {
  width: 320,
  height: 140,
  left: 34,
  right: 8,
  top: 10,
  bottom: 22,
} as const

export interface ChartGeometry {
  body: string
  wheel: string
  road: string
  /** x ranges (SVG units) where the tyre is off the road. */
  airborne: { x0: number; x1: number }[]
  /** y of the zero (ride height) line. */
  zeroY: number
  /** Axis ticks in millimetres with their y. */
  ticks: { mm: number; y: number }[]
  /** Time ticks in seconds with their x. */
  timeTicks: { s: number; x: number }[]
  /** Displacement range shown (mm). */
  minMm: number
  maxMm: number
}

const plotW = CHART.width - CHART.left - CHART.right
const plotH = CHART.height - CHART.top - CHART.bottom

/** x of a lap position (0..1). */
export const chartX = (progress: number) => CHART.left + Math.min(1, Math.max(0, progress)) * plotW

/** Round the displayed range out to whole 20 mm steps, always including ±20 mm. */
export function chartRange(r: QuarterCarResponse): { minMm: number; maxMm: number } {
  let lo = 0
  let hi = 0
  for (let i = 0; i < r.count; i++) {
    lo = Math.min(lo, r.body[i], r.wheel[i], r.roadZ[i])
    hi = Math.max(hi, r.body[i], r.wheel[i], r.roadZ[i])
  }
  const step = 20
  return { minMm: Math.min(-step, Math.floor((lo * 1000) / step) * step), maxMm: Math.max(step, Math.ceil((hi * 1000) / step) * step) }
}

export function buildChart(r: QuarterCarResponse): ChartGeometry {
  const { minMm, maxMm } = chartRange(r)
  const y = (m: number) => CHART.top + ((maxMm - m * 1000) / (maxMm - minMm)) * plotH
  const x = (i: number) => chartX(i / (r.count - 1))
  const path = (a: Float64Array) => {
    let d = ''
    for (let i = 0; i < r.count; i++) d += `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(a[i]).toFixed(1)}`
    return d
  }
  const airborne: { x0: number; x1: number }[] = []
  let start = -1
  for (let i = 0; i <= r.count; i++) {
    const off = i < r.count && r.contact[i] === 0
    if (off && start < 0) start = i
    if (!off && start >= 0) {
      airborne.push({ x0: x(Math.max(0, start - 0.5)), x1: x(Math.min(r.count - 1, i - 0.5)) })
      start = -1
    }
  }
  const ticks: { mm: number; y: number }[] = []
  const tickStep = maxMm - minMm > 120 ? 40 : 20
  for (let mm = Math.ceil(minMm / tickStep) * tickStep; mm <= maxMm; mm += tickStep) ticks.push({ mm, y: y(mm / 1000) })
  const timeTicks: { s: number; x: number }[] = []
  for (let s = 0; s <= r.duration + 1e-9; s += 0.5) timeTicks.push({ s, x: chartX(s / r.duration) })
  return { body: path(r.body), wheel: path(r.wheel), road: path(r.roadZ), airborne, zeroY: y(0), ticks, timeTicks, minMm, maxMm }
}
