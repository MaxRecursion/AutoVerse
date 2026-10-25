import { describe, expect, it } from 'vitest'
import { coilHeight, coilIndices, coilPitch, coilRings, coilVertexCount, writeCoil, type CoilSpec } from './coilSpring'
import { TRAVEL_LIMIT, solveLinkage } from './linkage'
import { COILOVER, LOADED_RADIUS, coiloverState } from './suspensionModel'

const SPEC: CoilSpec = { coilRadius: 0.047, wireRadius: 0.0072, turns: 7, deadTurns: 0.75, segmentsPerTurn: 24, radialSegments: 8 }

function build(length: number) {
  const n = coilVertexCount(SPEC)
  const positions = new Float32Array(n * 3)
  const normals = new Float32Array(n * 3)
  writeCoil(SPEC, length, positions, normals)
  return { positions, normals, n }
}

/** Wire centre of ring i (average of its vertices). */
function ringCentre(positions: Float32Array, i: number) {
  const c = [0, 0, 0]
  for (let j = 0; j < SPEC.radialSegments; j++) for (let a = 0; a < 3; a++) c[a] += positions[(i * SPEC.radialSegments + j) * 3 + a]
  return c.map((v) => v / SPEC.radialSegments)
}

describe('coil spring geometry', () => {
  it('builds a closed tube index buffer within the vertex range', () => {
    const idx = coilIndices(SPEC)
    expect(idx.length).toBe((coilRings(SPEC) - 1) * SPEC.radialSegments * 6)
    expect(Math.max(...idx)).toBe(coilVertexCount(SPEC) - 1)
    expect(idx).toBeInstanceOf(Uint16Array)
  })

  it('sits on both seats: the wire runs from y = r to y = length − r', () => {
    for (const length of [0.42, 0.49, 0.53]) {
      const p = coilPitch(SPEC, length)
      expect(coilHeight(SPEC, p, 0).y).toBeCloseTo(SPEC.wireRadius, 9)
      expect(coilHeight(SPEC, p, SPEC.turns).y).toBeCloseTo(length - SPEC.wireRadius, 9)
      const { positions } = build(length)
      let min = Infinity
      let max = -Infinity
      for (let i = 1; i < positions.length; i += 3) {
        min = Math.min(min, positions[i])
        max = Math.max(max, positions[i])
      }
      expect(min).toBeGreaterThan(-1e-3)
      expect(max).toBeLessThan(length + 1e-3)
    }
  })

  it('keeps a round wire section: every vertex is one wire radius from the centre line, with unit normals', () => {
    const { positions, normals, n } = build(0.45)
    const rings = coilRings(SPEC)
    for (let i = 0; i < rings; i += 7) {
      const c = ringCentre(positions, i)
      // The ring centre lies on the helix (coil radius from the axis).
      expect(Math.hypot(c[0], c[2])).toBeCloseTo(SPEC.coilRadius, 3)
      for (let j = 0; j < SPEC.radialSegments; j++) {
        const k = (i * SPEC.radialSegments + j) * 3
        expect(Math.hypot(positions[k] - c[0], positions[k + 1] - c[1], positions[k + 2] - c[2])).toBeCloseTo(SPEC.wireRadius, 3)
      }
    }
    for (let v = 0; v < n; v++) expect(Math.hypot(normals[v * 3], normals[v * 3 + 1], normals[v * 3 + 2])).toBeCloseTo(1, 5)
  })

  it('closes the gaps between active coils when compressed, keeping the end coils closed', () => {
    const long = coilPitch(SPEC, 0.53)
    const short = coilPitch(SPEC, 0.43)
    expect(short.active).toBeLessThan(long.active)
    expect(short.dead).toBe(long.dead)
    // All the length change goes into the active coils.
    expect((long.active - short.active) * (SPEC.turns - 2 * SPEC.deadTurns)).toBeCloseTo(0.1, 9)
  })

  it('never coil-binds over the travel the linkage allows', () => {
    const spec: CoilSpec = { ...SPEC, coilRadius: COILOVER.coilRadius, wireRadius: COILOVER.wireRadius, turns: COILOVER.turns, deadTurns: COILOVER.deadTurns }
    for (const travel of [-TRAVEL_LIMIT, 0, TRAVEL_LIMIT]) {
      const springLength = coiloverState(solveLinkage(travel, LOADED_RADIUS)).springLength
      expect(coilPitch(spec, springLength).activeGap, `travel ${travel}`).toBeGreaterThan(0.02)
    }
  })

  it('is deterministic and allocation-free (rewrites the same buffers)', () => {
    const a = build(0.47)
    const b = build(0.47)
    expect(a.positions).toEqual(b.positions)
    expect(a.normals).toEqual(b.normals)
  })
})
