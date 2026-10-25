/**
 * Pure layout for the stop chart: vehicle speed vs wheel speed (left axis)
 * and caliper pressure (right axis) over one braking event.
 */
import { ABS_SLIP_BAND, BAR, sampleStop, type StopPlan } from './braking'

export const CHART = { width: 320, height: 150, left: 34, right: 40, top: 10, bottom: 22 } as const

export const PLOT = {
  x0: CHART.left,
  x1: CHART.width - CHART.right,
  y0: CHART.top,
  y1: CHART.height - CHART.bottom,
} as const

/** Round an axis maximum up to a tidy step. */
export function niceMax(value: number, step: number): number {
  return Math.max(step, Math.ceil((value - 1e-9) / step) * step)
}

export interface ChartModel {
  duration: number
  speedMaxKmh: number
  pressureMaxBar: number
  vehicle: string
  wheel: string
  caliper: string
  /** Master-cylinder pressure — only differs from the caliper's while ABS modulates. */
  master: string | null
  /** Illustrative 10–20 % slip band (area between those wheel speeds), when the tyre reaches its grip limit. */
  band: string | null
  /** x of a time, in chart units. */
  xAt: (t: number) => number
}

const fmt = (v: number) => (Math.round(v * 10) / 10).toString()

function path(points: readonly (readonly [number, number])[]): string {
  return points.map(([x, y], i) => `${i ? 'L' : 'M'}${fmt(x)} ${fmt(y)}`).join('')
}

export function chartModel(plan: StopPlan): ChartModel {
  const samples = sampleStop(plan)
  const duration = plan.duration
  const speedMaxKmh = niceMax(plan.params.speedKmh, 20)
  const pressureMaxBar = niceMax(plan.chain.pressurePa / BAR, 20)
  const xAt = (t: number) => PLOT.x0 + (Math.min(Math.max(t, 0), duration) / duration) * (PLOT.x1 - PLOT.x0)
  const ySpeed = (v: number) => PLOT.y1 - ((v * 3.6) / speedMaxKmh) * (PLOT.y1 - PLOT.y0)
  const yPressure = (pa: number) => PLOT.y1 - (pa / BAR / pressureMaxBar) * (PLOT.y1 - PLOT.y0)

  let band: string | null = null
  if (plan.mode !== 'within-grip') {
    const inBand = samples.filter((s) => s.t >= plan.tLimit && s.t <= plan.tStop)
    if (inBand.length > 1) {
      const upper = inBand.map((s) => [xAt(s.t), ySpeed(s.vehicleSpeed * (1 - ABS_SLIP_BAND.low))] as const)
      const lower = inBand.map((s) => [xAt(s.t), ySpeed(s.vehicleSpeed * (1 - ABS_SLIP_BAND.high))] as const).reverse()
      band = `${path([...upper, ...lower])}Z`
    }
  }

  return {
    duration,
    speedMaxKmh,
    pressureMaxBar,
    vehicle: path(samples.map((s) => [xAt(s.t), ySpeed(s.vehicleSpeed)])),
    wheel: path(samples.map((s) => [xAt(s.t), ySpeed(s.wheelSpeed)])),
    caliper: path(samples.map((s) => [xAt(s.t), yPressure(s.caliperPressurePa)])),
    master: plan.mode === 'abs' ? path(samples.map((s) => [xAt(s.t), yPressure(s.masterPressurePa)])) : null,
    band,
    xAt,
  }
}
