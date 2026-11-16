import { CatmullRomCurve3, DoubleSide, FrontSide, Vector3, type BufferGeometry } from 'three'
import { describe, expect, it } from 'vitest'
import { CYCLE_GAS, FLOW_SPEED, HEADER_RADIUS, LABEL_WRAP_CYCLES, PLUME_LENGTH, exhaustDrive, parcelAt, parcelTemperature, portTemperature, travelDeg, type Vec3 } from './exhaust'
import { NOISE_PERIOD, buildGasGeometry, createGasMaterial, createPlumeMaterial, noiseStep, noiseVolume, plumeNoiseStep, wrapNoise, type GasRoute } from './exhaustGas'

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

const curveLength = (points: Vec3[]) => new CatmullRomCurve3(points.map((p) => new Vector3(...p)), false, 'catmullrom', 0.2).getLength()

describe('exhaust gas geometry', () => {
  it.each(['low', 'high'] as const)('%s detail winds straight and curved gas surfaces towards their outward normals', (tier) => {
    for (const points of [
      [[0, 0, 0], [3, 0, 0]],
      [[0, 0, 0], [1, 0.3, 0], [2, 0.5, 1], [3, 1, 1.5]],
    ] as Vec3[][]) {
      const geometry = buildGasGeometry([{ slot: 0, points, headerLength: 10, plume: false }], tier).pipes
      try {
        const result = minimumWindingDot(geometry)
        expect(result.count).toBeGreaterThan(20)
        expect(result.minimum).toBeGreaterThan(0)
      } finally {
        geometry.dispose()
      }
    }
  })

  it('keeps all per-vertex attributes finite and indices valid across cylinder slots and their outlet plumes', () => {
    const routes: GasRoute[] = [
      { slot: 0, points: [[0, 2, 0], [-1, 2, 0], [-2, 1, 0]], headerLength: 1, plume: true },
      { slot: 9, points: [[0, 2, 2], [-1, 2, 2], [-3, 1, 2]], headerLength: 1, plume: true },
    ]
    const { pipes, plumes } = buildGasGeometry(routes, 'low')
    try {
      expect(plumes).not.toBeNull()
      for (const geometry of [pipes, plumes!]) {
        const count = geometry.getAttribute('position').count
        expect(count).toBeGreaterThan(0)
        for (const name of ['position', 'normal', 'aTangent', 'aRadius', 'aDist', 'aAround', 'aSlot', 'aTime', 'aPlume', 'aFade', 'aMask', 'aHeader', 'aFeeds']) {
          const attribute = geometry.getAttribute(name)
          expect(attribute.count, name).toBe(count)
          expect(Array.from(attribute.array).every(Number.isFinite), name).toBe(true)
        }
        expect(Array.from(geometry.getIndex()!.array).every((index) => Number.isInteger(index) && index >= 0 && index < count)).toBe(true)
        expect(new Set(Array.from(geometry.getAttribute('aSlot').array))).toEqual(new Set([0, 9]))
      }
      // Pipe gas stays in the pipes, drawn inside their walls; the plumes are a separate mesh drawn after them.
      expect(Math.max(...Array.from(pipes.getAttribute('aPlume').array))).toBe(0)
      expect(Math.max(...Array.from(pipes.getAttribute('aMask').array))).toBe(0)
      expect(Math.max(...Array.from(plumes!.getAttribute('aPlume').array))).toBe(1)
    } finally {
      pipes.dispose()
      plumes?.dispose()
    }
  })

  it.each(['low', 'high'] as const)('%s detail mixes a shared outlet once while retaining each cylinder’s travel delay', (tier) => {
    const common: Vec3[][] = [[[1, 1, 1], [-2, 1, 1]], [[-2, 1, 1], [-3, 0, 0], [-4, 0, 0]]]
    const headers: Vec3[][] = [[[2, 2, 1], [1, 1, 1]], [[-1, 2, -1], [1, 1, 1]]]
    const routes: GasRoute[] = headers.map((header, index) => {
      const segments = [header, ...common]
      return { slot: index === 0 ? 0 : 9, points: segments.flatMap((segment, part) => part ? segment.slice(1) : segment), segments, headerLength: 1, plume: true }
    })
    const shared = buildGasGeometry(routes, tier)
    const single = buildGasGeometry(routes.slice(0, 1), tier)
    try {
      const mask = Array.from(shared.plumes!.getAttribute('aMask').array)
      expect(mask.length).toBe(single.plumes!.getAttribute('aMask').count)
      expect(new Set(mask)).toEqual(new Set([(1 << 0) | (1 << 9)]))
      const plumeTimes = Array.from(shared.plumes!.getAttribute('aTime').array)
      expect(Math.min(...plumeTimes)).toBe(0)
      expect(Math.max(...plumeTimes)).toBeCloseTo(travelDeg(PLUME_LENGTH, 0), 3)
      const { outletTime, headerLength } = shared
      expect(outletTime).toHaveLength(10)
      expect(headerLength).toHaveLength(10)
      // Both headers empty into the same pipes, so from their ends the gas has the same way to go.
      expect(outletTime[0]).toBeCloseTo(outletTime[9]!, 7)
      // Measured from the end of each cylinder's header: the column there moves with the valve, not at the flow speed.
      for (const route of routes) {
        const lengths = route.segments!.map(curveLength)
        expect(outletTime[route.slot]).toBeCloseTo((lengths.reduce((sum, length) => sum + length, 0) - lengths[0]!) / FLOW_SPEED, 7)
        expect(headerLength[route.slot]).toBeCloseTo(lengths[0]!, 7)
      }
      expect(outletTime.slice(1, 9)).toEqual(Array(8).fill(0))
      expect(headerLength.slice(1, 9)).toEqual(Array(8).fill(0))
    } finally {
      shared.pipes.dispose()
      shared.plumes?.dispose()
      single.pipes.dispose()
      single.plumes?.dispose()
    }
  })

  it('retains header residence at an outlet, so old gas neither appears early nor reheats into a fresh burst', () => {
    const header: Vec3[] = [[0, 0, 0], [1.33, 0, 0]]
    const tail: Vec3[] = [header[1]!, [2.93, 0, 0]]
    const built = buildGasGeometry([{ slot: 0, points: [...header, tail[1]!], segments: [header, tail], headerLength: 1.33, plume: true }], 'low')
    try {
      const h = built.headerLength[0]!
      const travel = built.outletTime[0]!
      const parcel = parcelAt({ since: 105, cycle: 4 }, h + travel * FLOW_SPEED, h)
      expect(travel).toBeCloseTo(100, 7)
      // The first push after the valve opens still carries cooled gas from the previous cycle.
      expect(parcel.flow).toBeGreaterThan(0.1)
      expect(parcel.emitDeg).toBeCloseTo(164.924398, 5)
      expect(parcel.age).toBeCloseTo(660.075602, 5)
      // At 200 crank degrees after starting, downstream travel alone would have shown this gas.
      expect(travel + 36).toBeLessThan(200)
      expect(parcel.age).toBeGreaterThan(200)
      const drive = exhaustDrive({ running: true, rpm: 800, throttle: 0, limiting: false }, { idleRpm: 800, redlineRpm: 6000, ignition: 'spark' })
      const temperature = parcelTemperature(parcel, drive.heat, 0.22, drive.ageScale)
      expect(temperature).toBeCloseTo(0.237701867, 7)
      // The same parcel crosses into the plume; its temperature must not reset to the exit phase.
      const reheated = portTemperature(105 - travel) * drive.heat * Math.exp(-travel * drive.ageScale)
      expect(reheated).toBeGreaterThan(temperature * 2)
    } finally {
      built.pipes.dispose()
      built.plumes?.dispose()
    }
  })

  it('keeps disconnected bank outlets separate rather than mixing their cylinder masks', () => {
    const { pipes, plumes } = buildGasGeometry([
      { slot: 0, points: [[0, 2, 1], [-4, 0, 1]], headerLength: 1, plume: true },
      { slot: 9, points: [[0, 2, -1], [-4, 0, -1]], headerLength: 1, plume: true },
    ], 'low')
    try {
      expect(new Set(Array.from(plumes!.getAttribute('aMask').array))).toEqual(new Set([1, 1 << 9]))
    } finally {
      pipes.dispose()
      plumes?.dispose()
    }
  })

  it('follows the same piecewise pipe curves without bowing a header into the collector', () => {
    const header: Vec3[] = [[2.5, 3, 0], [2.5, 2.9, 0.3], [2.5, 2.5, 0.8], [2.5, 2, 1]]
    const collector: Vec3[] = [header.at(-1)!, [-2.5, 2, 1]]
    const tail: Vec3[] = [collector.at(-1)!, [-3, 1.5, 1], [-4, 0.5, 0.8]]
    const segments = [header, collector, tail]
    const curves = segments.map((points) => new CatmullRomCurve3(points.map((point) => new Vector3(...point)), false, 'catmullrom', 0.2))
    const route: GasRoute = { slot: 0, points: [...header, ...collector.slice(1), ...tail.slice(1)], segments, headerLength: curves[0]!.getLength(), plume: false }
    const geometry = buildGasGeometry([route], 'high').pipes
    try {
      const centres = rings(geometry)
      const pipeSamples = curves.flatMap((curve) => curve.getSpacedPoints(1200))
      const headerCentres = centres.filter((ring) => ring.distance < route.headerLength - 1e-4)
      expect(headerCentres.length).toBeGreaterThan(8)
      expect(headerCentres.every((ring) => Math.abs(ring.centre.x - 2.5) < 1e-5)).toBe(true)
      const greatestDeviation = Math.max(...centres.map((ring) => Math.min(...pipeSamples.map((point) => point.distanceTo(ring.centre)))))
      expect(greatestDeviation).toBeLessThan(0.006)
      // The shader recovers each centre one radius in from the surface, along the normal.
      const position = geometry.getAttribute('position')
      const normal = geometry.getAttribute('normal')
      const radius = geometry.getAttribute('aRadius')
      const headerLength = geometry.getAttribute('aHeader')
      const centre = new Vector3()
      for (let i = 0; i < position.count; i += 5) {
        centre.fromBufferAttribute(position, i).addScaledVector(new Vector3().fromBufferAttribute(normal, i), -radius.getX(i))
        expect(Math.min(...pipeSamples.map((point) => point.distanceTo(centre)))).toBeLessThan(0.006)
        expect(headerLength.getX(i)).toBeCloseTo(curves[0]!.getLength(), 5)
      }
    } finally {
      geometry.dispose()
    }
  })

  it('tells the shader how many cylinders share each stretch of pipe', () => {
    const header: Vec3[] = [[2, 3, 0], [2, 2.6, 0.5], [2, 2, 0.8]]
    const collector: Vec3[] = [header.at(-1)!, [-2, 2, 0.8]]
    const tail: Vec3[] = [collector.at(-1)!, [-3, 1.5, 0.8]]
    const { pipes, plumes } = buildGasGeometry([{ slot: 2, points: [...header, ...collector.slice(1), ...tail.slice(1)], segments: [header, collector, tail], feeds: [1, 4, 4], headerLength: 1, plume: true }], 'low')
    try {
      expect(new Set(Array.from(pipes.getAttribute('aFeeds').array))).toEqual(new Set([1, 4]))
      expect(new Set(Array.from(plumes!.getAttribute('aFeeds').array))).toEqual(new Set([1]))
    } finally {
      pipes.dispose()
      plumes?.dispose()
    }
  })

  it('keeps a single-cylinder header stub inside its header bore through its full length, with no plume', () => {
    const built = buildGasGeometry([{ slot: 0, points: [[0, 2, 0], [0, 1.5, -1], [-0.7, 1.5, -1]], headerLength: 1, plume: false }], 'high')
    expect(built.plumes).toBeNull()
    const geometry = built.pipes
    try {
      const crossSections = rings(geometry)
      expect(crossSections.at(-1)!.distance).toBeGreaterThan(1.5)
      expect(Math.max(...crossSections.map((ring) => ring.radius))).toBeLessThan(HEADER_RADIUS)
    } finally {
      geometry.dispose()
    }
  })

  it('wraps the gas labels exactly on the noise volume’s tile', () => {
    const tiles = (LABEL_WRAP_CYCLES * CYCLE_GAS) / NOISE_PERIOD
    expect(Math.abs(tiles - Math.round(tiles))).toBeLessThan(1e-9)
  })
})

describe('exhaust gas shader', () => {
  const fragment = createGasMaterial('low').fragmentShader

  it('carries each cylinder’s header residence into its plume', () => {
    // The plume labels gas by when it left the end of the cylinder's own (curved) header…
    expect(fragment).toMatch(/shareAt\(exitPhase\) - uHeaderLength\[slot\] \/ CYCLE_GAS/)
    // …then ages and cools it exactly as in the pipes (exhaust.ts parcelTemperature).
    expect(fragment).toMatch(/totalHeat \+= contribution \* parcelTemperature\(parcel\)/)
    expect(fragment).toMatch(/smoothstep\(parcel\.y, parcel\.y \+ 36\.0, uRun\)/)
  })

  it('moves eddies past the header with the gas, not with the share of the cycle out', () => {
    expect(fragment).toMatch(/\(\(clock\.z - wraps\) \* 720\.0 \+ exitPhase\) \* FLOW_SPEED/)
  })

  it('fills a plume seen end-on: plumes on both faces in one pass, half a chord each; pipe gas on its front faces', () => {
    const gas = createGasMaterial('high')
    const plume = createPlumeMaterial(gas)
    expect(gas.side).toBe(FrontSide)
    expect(plume.side).toBe(DoubleSide)
    expect(plume.forceSinglePass).toBe(true)
    // One shader and one set of uniforms: every per-frame update reaches the plumes too.
    expect(plume.uniforms).toBe(gas.uniforms)
    expect(plume.fragmentShader).toBe(gas.fragmentShader)
    expect(plume.defines).toEqual(gas.defines)
    expect(plume.blending).toBe(gas.blending)
    expect(plume.depthWrite).toBe(false)
    expect(fragment).toMatch(/\* \(plume \? 0\.5 : 1\.0\);/)
    // Two halves of a chord, blended over one another, block exactly as much light as the whole.
    for (const x of [0.05, 0.8, 4]) {
      const half = 1 - Math.exp(-x / 2)
      expect(1 - (1 - half) ** 2).toBeCloseTo(1 - Math.exp(-x), 12)
    }
    plume.dispose()
    gas.dispose()
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
