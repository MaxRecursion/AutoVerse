import { CatmullRomCurve3, Vector3, type BufferGeometry } from 'three'
import { describe, expect, it } from 'vitest'
import { HEADER_RADIUS, type Vec3 } from './exhaust'
import { buildGasGeometry, noiseStep, noiseVolume, plumeNoiseStep, wrapNoise, type GasRoute } from './exhaustGas'

/** Recover each sampled cross-section's centre, ignoring its duplicated UV-seam vertex. */
function rings(geometry: BufferGeometry) {
  const position = geometry.getAttribute('position')
  const distance = geometry.getAttribute('aDist')
  const slot = geometry.getAttribute('aSlot')
  const grouped = new Map<string, { distance: number; points: Vector3[] }>()
  for (let i = 0; i < position.count; i++) {
    const key = `${slot.getX(i)}:${distance.getX(i)}`
    const group = grouped.get(key) ?? { distance: distance.getX(i), points: [] }
    group.points.push(new Vector3().fromBufferAttribute(position, i))
    grouped.set(key, group)
  }
  return [...grouped.values()].map((group) => {
    const points = group.points.slice()
    if (points[0]!.distanceToSquared(points.at(-1)!) < 1e-10) points.pop()
    const centre = points.reduce((sum, point) => sum.add(point), new Vector3()).divideScalar(points.length)
    return { distance: group.distance, centre, radius: Math.max(...points.map((point) => point.distanceTo(centre))) }
  })
}

function minimumWindingDot(geometry: BufferGeometry) {
  const position = geometry.getAttribute('position')
  const normal = geometry.getAttribute('normal')
  const indices = geometry.getIndex()!
  const a = new Vector3()
  const b = new Vector3()
  const c = new Vector3()
  const n = new Vector3()
  const outward = new Vector3()
  let minimum = Infinity
  let count = 0
  for (let i = 0; i < indices.count; i += 3) {
    const ids = [indices.getX(i), indices.getX(i + 1), indices.getX(i + 2)]
    a.fromBufferAttribute(position, ids[0]!)
    b.fromBufferAttribute(position, ids[1]!).sub(a)
    c.fromBufferAttribute(position, ids[2]!).sub(a)
    n.crossVectors(b, c)
    if (n.lengthSq() < 1e-16) continue
    outward.set(0, 0, 0)
    for (const id of ids) outward.add(new Vector3().fromBufferAttribute(normal, id))
    minimum = Math.min(minimum, n.normalize().dot(outward.normalize()))
    count++
  }
  return { minimum, count }
}

describe('exhaust gas geometry', () => {
  it.each(['low', 'high'] as const)('%s detail winds straight and curved gas surfaces towards their outward normals', (tier) => {
    for (const points of [
      [[0, 0, 0], [3, 0, 0]],
      [[0, 0, 0], [1, 0.3, 0], [2, 0.5, 1], [3, 1, 1.5]],
    ] as Vec3[][]) {
      const geometry = buildGasGeometry([{ slot: 0, points, headerLength: 10, plume: false }], tier)
      try {
        const result = minimumWindingDot(geometry)
        expect(result.count).toBeGreaterThan(20)
        expect(result.minimum).toBeGreaterThan(0)
      } finally {
        geometry.dispose()
      }
    }
  })

  it('keeps all per-vertex attributes finite and indices valid across cylinder slots and an outlet plume', () => {
    const routes: GasRoute[] = [
      { slot: 0, points: [[0, 2, 0], [-1, 2, 0], [-2, 1, 0]], headerLength: 1, plume: true },
      { slot: 9, points: [[0, 2, 2], [-1, 2, 2], [-3, 1, 2]], headerLength: 1, plume: true },
    ]
    const geometry = buildGasGeometry(routes, 'low')
    try {
      const count = geometry.getAttribute('position').count
      expect(count).toBeGreaterThan(0)
      for (const name of ['position', 'normal', 'aDist', 'aAround', 'aSlot', 'aTime', 'aPlume', 'aFade']) {
        const attribute = geometry.getAttribute(name)
        expect(attribute.count, name).toBe(count)
        expect(Array.from(attribute.array).every(Number.isFinite), name).toBe(true)
      }
      expect(Array.from(geometry.getIndex()!.array).every((index) => Number.isInteger(index) && index >= 0 && index < count)).toBe(true)
      expect(new Set(Array.from(geometry.getAttribute('aSlot').array))).toEqual(new Set([0, 9]))
      expect(Math.max(...Array.from(geometry.getAttribute('aPlume').array))).toBe(1)
    } finally {
      geometry.dispose()
    }
  })

  it('follows the same piecewise pipe curves without bowing a header into the collector', () => {
    const header: Vec3[] = [[2.5, 3, 0], [2.5, 2.9, 0.3], [2.5, 2.5, 0.8], [2.5, 2, 1]]
    const collector: Vec3[] = [header.at(-1)!, [-2.5, 2, 1]]
    const tail: Vec3[] = [collector.at(-1)!, [-3, 1.5, 1], [-4, 0.5, 0.8]]
    const segments = [header, collector, tail]
    const curves = segments.map((points) => new CatmullRomCurve3(points.map((point) => new Vector3(...point)), false, 'catmullrom', 0.2))
    const route: GasRoute = { slot: 0, points: [...header, ...collector.slice(1), ...tail.slice(1)], segments, headerLength: curves[0]!.getLength(), plume: false }
    const geometry = buildGasGeometry([route], 'high')
    try {
      const centres = rings(geometry)
      const pipeSamples = curves.flatMap((curve) => curve.getSpacedPoints(1200))
      const headerCentres = centres.filter((ring) => ring.distance < route.headerLength - 1e-4)
      expect(headerCentres.length).toBeGreaterThan(8)
      expect(headerCentres.every((ring) => Math.abs(ring.centre.x - 2.5) < 1e-5)).toBe(true)
      const greatestDeviation = Math.max(...centres.map((ring) => Math.min(...pipeSamples.map((point) => point.distanceTo(ring.centre)))))
      expect(greatestDeviation).toBeLessThan(0.006)
    } finally {
      geometry.dispose()
    }
  })

  it('keeps a single-cylinder header stub inside its header bore through its full length', () => {
    const geometry = buildGasGeometry([{ slot: 0, points: [[0, 2, 0], [0, 1.5, -1], [-0.7, 1.5, -1]], headerLength: 1, plume: false }], 'high')
    try {
      const crossSections = rings(geometry)
      expect(crossSections.at(-1)!.distance).toBeGreaterThan(1.5)
      expect(Math.max(...crossSections.map((ring) => ring.radius))).toBeLessThan(HEADER_RADIUS)
    } finally {
      geometry.dispose()
    }
  })
})

describe('exhaust turbulence', () => {
  it('builds deterministic, varied noise without browser or GPU state', () => {
    const a = noiseVolume(16, 12, 8, 123)
    const b = noiseVolume(16, 12, 8, 123)
    const other = noiseVolume(16, 12, 8, 456)
    expect(a).toEqual(b)
    expect(a).not.toEqual(other)
    expect(a.length).toBe(16 * 12 * 8)
    expect(new Set(a).size).toBeGreaterThan(32)
    expect(Math.min(...a)).toBe(0)
    expect(Math.max(...a)).toBe(255)
  })

  it('wraps flow offsets periodically and advances the open plume more slowly', () => {
    expect(wrapNoise(-1)).toBe(63)
    expect(wrapNoise(64)).toBe(0)
    expect(wrapNoise(128)).toBe(0)
    expect(wrapNoise(noiseStep(50) + 64)).toBeCloseTo(wrapNoise(noiseStep(50)), 10)
    expect(noiseStep(30 + 40)).toBeCloseTo(noiseStep(30) + noiseStep(40), 10)
    expect(plumeNoiseStep(100)).toBeGreaterThan(0)
    expect(plumeNoiseStep(100)).toBeLessThan(noiseStep(100))
  })
})
