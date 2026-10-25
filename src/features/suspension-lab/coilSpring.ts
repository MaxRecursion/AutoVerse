/**
 * Procedural coil spring — pure maths, no three.js.
 *
 * The spring is a tube swept along a helix whose axis is +y, from y = 0 (the
 * lower spring seat) to y = length (the upper seat). Like a real road spring
 * it has closed ("dead") end coils that sit almost touching on each seat, and
 * the remaining active coils share whatever length is left — so when the
 * suspension compresses, the gaps between the active coils really close up
 * while the wire keeps its round section (a plain y-scale would squash it).
 *
 * The scene allocates the vertex buffers once (coilVertexCount / coilIndices)
 * and rewrites positions + normals in place with writeCoil whenever the
 * spring length changes.
 */

export interface CoilSpec {
  /** Mean coil radius (axis to wire centre), m. */
  coilRadius: number
  /** Wire radius, m. */
  wireRadius: number
  /** Total turns, including the closed end turns. */
  turns: number
  /** Closed turns at each end. */
  deadTurns: number
  /** Rings of vertices per turn along the wire. */
  segmentsPerTurn: number
  /** Vertices around the wire section. */
  radialSegments: number
}

/** Gap factor between closed end coils (1 = wire touching wire). */
const DEAD_GAP = 1.04

/** Rings of vertices along the wire. */
export const coilRings = (spec: CoilSpec) => Math.max(2, Math.round(spec.turns * spec.segmentsPerTurn) + 1)

export const coilVertexCount = (spec: CoilSpec) => coilRings(spec) * spec.radialSegments

/** Triangle indices for the tube (constant for a spec — only the vertices move). */
export function coilIndices(spec: CoilSpec): Uint16Array | Uint32Array {
  const rings = coilRings(spec)
  const radial = spec.radialSegments
  const count = (rings - 1) * radial * 6
  const out = coilVertexCount(spec) > 65535 ? new Uint32Array(count) : new Uint16Array(count)
  let k = 0
  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j
      const b = i * radial + ((j + 1) % radial)
      const c = (i + 1) * radial + j
      const d = (i + 1) * radial + ((j + 1) % radial)
      out[k++] = a
      out[k++] = c
      out[k++] = b
      out[k++] = b
      out[k++] = c
      out[k++] = d
    }
  }
  return out
}

export interface CoilPitch {
  /** Rise per turn of a closed end coil, m. */
  dead: number
  /** Rise per turn of an active coil, m. */
  active: number
  /** Clear gap between neighbouring active coils, m (≤ 0 would be coil bind). */
  activeGap: number
}

/** Pitches for a spring of this length: the closed ends stay closed, the active coils share the rest. */
export function coilPitch(spec: CoilSpec, length: number): CoilPitch {
  const wire = 2 * spec.wireRadius
  const dead = wire * DEAD_GAP
  const activeTurns = Math.max(1e-6, spec.turns - 2 * spec.deadTurns)
  const free = length - wire - 2 * spec.deadTurns * dead
  const active = Math.max(dead, free / activeTurns)
  return { dead, active, activeGap: active - wire }
}

/** Height of the wire centre (m) after `n` turns from the lower end, and the local rise per turn. */
export function coilHeight(spec: CoilSpec, pitch: CoilPitch, n: number): { y: number; rise: number } {
  const t = Math.min(spec.turns, Math.max(0, n))
  const d = spec.deadTurns
  const activeEnd = spec.turns - d
  const y0 = spec.wireRadius
  if (t <= d) return { y: y0 + t * pitch.dead, rise: pitch.dead }
  if (t <= activeEnd) return { y: y0 + d * pitch.dead + (t - d) * pitch.active, rise: pitch.active }
  return { y: y0 + d * pitch.dead + (activeEnd - d) * pitch.active + (t - activeEnd) * pitch.dead, rise: pitch.dead }
}

/**
 * Write the tube's vertex positions and normals for a spring of `length`
 * into the given buffers (each coilVertexCount × 3 long). Allocation-free.
 */
export function writeCoil(spec: CoilSpec, length: number, positions: Float32Array, normals: Float32Array): void {
  const rings = coilRings(spec)
  const radial = spec.radialSegments
  const pitch = coilPitch(spec, length)
  const R = spec.coilRadius
  const r = spec.wireRadius
  const TAU = Math.PI * 2
  let k = 0
  for (let i = 0; i < rings; i++) {
    const n = (i / (rings - 1)) * spec.turns
    const theta = TAU * n
    const cos = Math.cos(theta)
    const sin = Math.sin(theta)
    const { y, rise } = coilHeight(spec, pitch, n)
    // Centre-line point and frame: N points radially out (perpendicular to the
    // tangent by construction), T along the wire, B = T × N.
    const cx = R * cos
    const cz = R * sin
    let tx = -TAU * R * sin
    let ty = rise
    let tz = TAU * R * cos
    const tl = Math.hypot(tx, ty, tz)
    tx /= tl
    ty /= tl
    tz /= tl
    const nx = cos
    const nz = sin
    // B = T × N with N = (nx, 0, nz)
    const bx = ty * nz
    const by = tz * nx - tx * nz
    const bz = -ty * nx
    for (let j = 0; j < radial; j++) {
      const phi = (j / radial) * TAU
      const cp = Math.cos(phi)
      const sp = Math.sin(phi)
      const ox = cp * nx + sp * bx
      const oy = sp * by
      const oz = cp * nz + sp * bz
      positions[k] = cx + r * ox
      positions[k + 1] = y + r * oy
      positions[k + 2] = cz + r * oz
      normals[k] = ox
      normals[k + 1] = oy
      normals[k + 2] = oz
      k += 3
    }
  }
}
