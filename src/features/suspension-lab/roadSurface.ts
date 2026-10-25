/**
 * The scrolling test road under the wheel — pure buffer maths, no three.js.
 *
 * The road is a strip along z (the direction of travel; +z is ahead of the
 * tyre, towards the viewer). The tyre's contact point is at z = 0, so the
 * road surface at z is the profile at lap distance (distance + z). Every
 * frame the scene rewrites the strip's heights for the current distance, so
 * the road "moves" under a wheel that stays put — and the bump in the 3D view
 * is exactly the profile the quarter-car model drives over.
 */
import { roadHeightAt, type RoadProfile } from './quarterCar'

export const ROAD = {
  /** Behind / ahead of the tyre contact (m). */
  zMin: -2.2,
  zMax: 2.2,
  /** Across the road (m): from inboard of the body section to outboard of the tyre. */
  xMin: -0.6,
  xMax: 1.1,
  /** Depth of the side skirt that shows the profile in section (m). */
  skirt: 0.1,
  /** Rows along z. */
  rows: 176,
  /** Fade the ends of the strip into the background over this length (m). */
  fade: 0.7,
  /** Lane dashes: length, gap and lateral position (m). */
  dash: { length: 0.5, gap: 0.5, x: -0.28, width: 0.06, rows: 6 },
  edgeLine: { x: 0.98, width: 0.05 },
} as const

export const ROAD_VERTEX_COUNT = (ROAD.rows + 1) * 4
/** Dashes visible at once (one more than fits, to cover the wrap). */
export const DASH_COUNT = Math.ceil((ROAD.zMax - ROAD.zMin) / (ROAD.dash.length + ROAD.dash.gap)) + 1
export const DASH_VERTEX_COUNT = DASH_COUNT * (ROAD.dash.rows + 1) * 2
export const EDGE_VERTEX_COUNT = (ROAD.rows + 1) * 2

const rowZ = (i: number) => ROAD.zMin + ((ROAD.zMax - ROAD.zMin) * i) / ROAD.rows

/** Road strip indices: top surface (2 verts per row) and outboard skirt (2 verts per row). */
export function roadIndices(): Uint16Array {
  const out: number[] = []
  for (let i = 0; i < ROAD.rows; i++) {
    const a = i * 4
    const b = (i + 1) * 4
    // Top: verts 0 (inboard) and 1 (outboard), wound to face up (+y).
    out.push(a, b, a + 1, a + 1, b, b + 1)
    // Skirt: verts 2 (top edge) and 3 (bottom), wound to face outboard (+x).
    out.push(a + 2, b + 2, a + 3, a + 3, b + 2, b + 3)
  }
  return new Uint16Array(out)
}

/** Indices for `strips` quad strips, each (rows + 1) × 2 vertices (left, right per row), wound to face up. */
export function stripIndices(strips: number, rows: number): Uint16Array {
  const out: number[] = []
  for (let s = 0; s < strips; s++) {
    const base = s * (rows + 1) * 2
    for (let i = 0; i < rows; i++) {
      const a = base + i * 2
      const b = a + 2
      out.push(a, b, a + 1, a + 1, b, b + 1)
    }
  }
  return new Uint16Array(out)
}

/** 0 at the strip ends → 1 inside: how much of the asphalt colour shows (the rest fades to the background). */
export const endFade = (z: number) => Math.min(1, Math.max(0, Math.min(z - ROAD.zMin, ROAD.zMax - z) / ROAD.fade))

export interface RoadBuffers {
  position: Float32Array
  normal: Float32Array
  color: Float32Array
}

/**
 * Write the road strip for the tyre at lap `distance` (m).
 * `base` is the asphalt colour (linear RGB), `far` the colour it fades to.
 */
export function writeRoad(road: RoadProfile, distance: number, out: RoadBuffers, base: readonly number[], far: readonly number[]): void {
  const dz = (ROAD.zMax - ROAD.zMin) / ROAD.rows
  for (let i = 0; i <= ROAD.rows; i++) {
    const z = rowZ(i)
    const h = roadHeightAt(road, distance + z)
    const slope = (roadHeightAt(road, distance + z + dz / 2) - roadHeightAt(road, distance + z - dz / 2)) / dz
    const nl = Math.hypot(slope, 1)
    const k = i * 12
    // top inboard, top outboard, skirt top, skirt bottom
    const ys = [h, h, h, h - ROAD.skirt]
    const xs = [ROAD.xMin, ROAD.xMax, ROAD.xMax, ROAD.xMax]
    for (let v = 0; v < 4; v++) {
      out.position[k + v * 3] = xs[v]
      out.position[k + v * 3 + 1] = ys[v]
      out.position[k + v * 3 + 2] = z
      if (v < 2) {
        out.normal[k + v * 3] = 0
        out.normal[k + v * 3 + 1] = 1 / nl
        out.normal[k + v * 3 + 2] = -slope / nl
      } else {
        out.normal[k + v * 3] = 1
        out.normal[k + v * 3 + 1] = 0
        out.normal[k + v * 3 + 2] = 0
      }
      const f = endFade(z) * (v === 3 ? 0.55 : v === 2 ? 0.8 : 1)
      for (let c = 0; c < 3; c++) out.color[k + v * 3 + c] = far[c] + (base[c] - far[c]) * f
    }
  }
}

/** Positive modulo. */
const mod = (a: number, n: number) => ((a % n) + n) % n

/**
 * Write the lane dashes (fixed to the road, so they scroll past) and the
 * solid edge line; both follow the road profile, lifted 2 mm to avoid
 * z-fighting. Dashes outside the strip collapse to zero width.
 */
export function writeMarkings(road: RoadProfile, distance: number, dashes: Float32Array, edge: Float32Array): void {
  const { length, gap, x, width, rows } = ROAD.dash
  const period = length + gap
  const lift = 0.002
  // First dash start (road-fixed) at or behind the strip start.
  const first = ROAD.zMin - mod(distance + ROAD.zMin, period)
  let k = 0
  for (let s = 0; s < DASH_COUNT; s++) {
    const z0 = first + s * period
    for (let i = 0; i <= rows; i++) {
      const z = Math.min(ROAD.zMax, Math.max(ROAD.zMin, z0 + (length * i) / rows))
      const h = roadHeightAt(road, distance + z) + lift
      const hidden = z0 + length < ROAD.zMin || z0 > ROAD.zMax
      const half = hidden ? 0 : (width / 2) * endFade(z)
      dashes[k++] = x - half
      dashes[k++] = h
      dashes[k++] = z
      dashes[k++] = x + half
      dashes[k++] = h
      dashes[k++] = z
    }
  }
  k = 0
  for (let i = 0; i <= ROAD.rows; i++) {
    const z = rowZ(i)
    const h = roadHeightAt(road, distance + z) + lift
    const half = (ROAD.edgeLine.width / 2) * endFade(z)
    edge[k++] = ROAD.edgeLine.x - half
    edge[k++] = h
    edge[k++] = z
    edge[k++] = ROAD.edgeLine.x + half
    edge[k++] = h
    edge[k++] = z
  }
}
