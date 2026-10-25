/**
 * Builds three.js geometry and materials for the explorer's original
 * procedural modules (vehicleParts.ts describes them as plain shapes).
 */
import {
  BoxGeometry,
  BufferGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  DoubleSide,
  Euler,
  Matrix4,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Quaternion,
  TorusGeometry,
  TubeGeometry,
  Vector3,
  type Curve,
  type Material,
} from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { MaterialKey, Shape } from './vehicleParts'
import type { Vec3 } from './vehicleLayout'

export interface Detail {
  radial: number
  tubular: number
}

export const DETAIL: Record<'low' | 'high', Detail> = {
  low: { radial: 10, tubular: 24 },
  high: { radial: 20, tubular: 56 },
}

const UP = new Vector3(0, 1, 0)

/** Matrix that maps a Y-axis primitive centred at the origin onto the segment a→b. */
function alongSegment(a: Vec3, b: Vec3): { matrix: Matrix4; length: number } {
  const va = new Vector3(...a)
  const vb = new Vector3(...b)
  const dir = vb.clone().sub(va)
  const length = dir.length()
  const q = new Quaternion().setFromUnitVectors(UP, dir.normalize())
  const mid = va.add(vb).multiplyScalar(0.5)
  return { matrix: new Matrix4().compose(mid, q, new Vector3(1, 1, 1)), length }
}

/** A helix of `turns` turns around the a→b axis. */
class Helix extends CatmullRomCurve3 {
  constructor(a: Vec3, b: Vec3, r: number, turns: number, samples: number) {
    const { matrix, length } = alongSegment(a, b)
    const pts: Vector3[] = []
    for (let i = 0; i <= samples; i++) {
      const t = i / samples
      const ang = t * turns * Math.PI * 2
      pts.push(new Vector3(Math.cos(ang) * r, (t - 0.5) * length, Math.sin(ang) * r).applyMatrix4(matrix))
    }
    super(pts)
  }
}

function fanGeometry(r: number, d: Detail): BufferGeometry {
  const parts: BufferGeometry[] = []
  parts.push(new TorusGeometry(r, 0.012, 6, d.tubular)) // shroud ring
  parts.push(new CylinderGeometry(r * 0.22, r * 0.22, 0.05, d.radial).rotateX(Math.PI / 2)) // motor hub
  const blades = 5
  for (let i = 0; i < blades; i++) {
    const blade = new BoxGeometry(r * 0.72, r * 0.26, 0.01)
    blade.translate(r * 0.5, 0, 0)
    blade.rotateX(0.35)
    blade.rotateZ((i / blades) * Math.PI * 2)
    parts.push(blade)
  }
  // Stays from the shroud to the hub
  for (let i = 0; i < 3; i++) {
    const stay = new BoxGeometry(r, 0.012, 0.012)
    stay.translate(r / 2, 0, -0.03)
    stay.rotateZ((i / 3) * Math.PI * 2 + Math.PI / 6)
    parts.push(stay)
  }
  const merged = mergeGeometries(parts.map((g) => g.toNonIndexed()))
  parts.forEach((g) => g.dispose())
  return merged ?? new BufferGeometry()
}

/** Geometry for one shape, in the car frame. */
export function buildShape(s: Shape, d: Detail): BufferGeometry {
  switch (s.kind) {
    case 'box': {
      const g = s.radius ? new RoundedBoxGeometry(s.size[0], s.size[1], s.size[2], 2, s.radius) : new BoxGeometry(...s.size)
      if (s.rotation) g.applyMatrix4(new Matrix4().makeRotationFromEuler(new Euler(...s.rotation)))
      g.translate(...s.at)
      return g
    }
    case 'cyl': {
      const { matrix, length } = alongSegment(s.from, s.to)
      // CylinderGeometry's radiusTop is at +Y, i.e. the `to` end.
      const g = new CylinderGeometry(s.r2 ?? s.r, s.r, length, d.radial)
      g.applyMatrix4(matrix)
      return g
    }
    case 'tube': {
      const curve: Curve<Vector3> = new CatmullRomCurve3(s.points.map((p) => new Vector3(...p)), false, 'centripetal')
      return new TubeGeometry(curve, Math.max(8, Math.round(d.tubular * 0.6 * s.points.length)), s.r, Math.max(6, Math.round(d.radial / 2)), false)
    }
    case 'coil': {
      const samples = Math.round(s.turns * (d.tubular / 3))
      return new TubeGeometry(new Helix(s.from, s.to, s.r, s.turns, samples), samples, s.wire, Math.max(5, Math.round(d.radial / 3)), false)
    }
    case 'ring': {
      const g = new TorusGeometry(s.r, s.tube, Math.max(6, Math.round(d.radial / 2)), d.tubular)
      if (s.rotation) g.applyMatrix4(new Matrix4().makeRotationFromEuler(new Euler(...s.rotation)))
      g.translate(...s.at)
      return g
    }
    case 'fan': {
      const g = fanGeometry(s.r, d)
      g.translate(...s.at)
      return g
    }
  }
}

/** Restrained engineering palette: castings, steel, rubber; colour only where it explains (copper, springs). */
export function createProceduralMaterials(): Record<MaterialKey, Material> {
  const std = (color: string, metalness: number, roughness: number, extra: ConstructorParameters<typeof MeshStandardMaterial>[0] = {}) =>
    new MeshStandardMaterial({ color, metalness, roughness, ...extra })
  return {
    casting: std('#a3aab3', 0.6, 0.42),
    darkCasting: std('#5d646e', 0.55, 0.5),
    steel: std('#c9ced4', 0.85, 0.25),
    rubber: std('#22252a', 0, 0.85),
    hose: std('#2c3036', 0.05, 0.7),
    core: std('#7f8790', 0.55, 0.55, { side: DoubleSide }),
    battery: std('#2f343b', 0.1, 0.55),
    spring: std('#4f86a8', 0.6, 0.35),
    damper: std('#3d434b', 0.6, 0.38),
    exhaust: std('#8a8178', 0.75, 0.45),
    catalyst: std('#b9b2a8', 0.85, 0.3),
    tank: std('#3a3f46', 0.05, 0.65),
    pipe: std('#b8835a', 0.8, 0.35),
    copper: std('#c07a46', 0.85, 0.3),
    body: std('#6b7480', 0.5, 0.35),
    glass: new MeshPhysicalMaterial({ color: '#9fb6c8', metalness: 0, roughness: 0.05, transparent: true, opacity: 0.35 }),
    tyre: std('#1d1f23', 0, 0.9),
    rim: std('#9aa1aa', 0.8, 0.3),
    disc: std('#8d939a', 0.85, 0.35),
    caliper: std('#c9402f', 0.35, 0.45),
  }
}
