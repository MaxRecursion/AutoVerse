/**
 * three.js geometry builders for the procedural double-wishbone corner. Every
 * hard point comes from linkage.ts / suspensionModel.ts, so the 3D model, the
 * 2D diagram and the tests agree.
 *
 * Each moving part is built around its own pivot, so the scene sets one
 * transform per part per frame:
 * - wishbones: origin on their inner pivot axis (rotate about z);
 * - knuckle, hub, wheel: static body-frame coordinates, placed in a frame
 *   that maps the static lower ball joint onto the solved one;
 * - coil-over parts: along the coil-over axis (+y) from the lower eye;
 * - drop link / tie rod: along +y from one end, at their true length.
 */
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  DynamicDrawUsage,
  Float32BufferAttribute,
  LatheGeometry,
  Matrix4,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { QualityTier } from '@/hooks/useQualityTier'
import { coilIndices, coilVertexCount, writeCoil, type CoilSpec } from './coilSpring'
import { DROP_LINK, DROP_LINK_LENGTH, HARDPOINTS, TIE_ROD_INNER, TIE_ROD_LENGTH, TYRE, solveLinkage, type Vec2 } from './linkage'
import { COILOVER, LOADED_RADIUS, WHEEL_SPOKES } from './suspensionModel'

type V3 = [number, number, number]

export interface GeometryDetail {
  radial: number
  lathe: number
  coilSegmentsPerTurn: number
  coilRadial: number
}

export const DETAIL: Record<QualityTier, GeometryDetail> = {
  low: { radial: 14, lathe: 36, coilSegmentsPerTurn: 18, coilRadial: 7 },
  high: { radial: 24, lathe: 64, coilSegmentsPerTurn: 30, coilRadial: 10 },
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

/** Merge geometries into one non-indexed geometry (normals + uvs kept) and dispose the inputs. */
export function merge(list: BufferGeometry[]): BufferGeometry {
  const prepared = list.map((g) => {
    const flat = g.index ? g.toNonIndexed() : g
    if (flat !== g) g.dispose()
    flat.clearGroups()
    if (!flat.getAttribute('uv')) flat.setAttribute('uv', new Float32BufferAttribute(new Float32Array(flat.getAttribute('position').count * 2), 2))
    return flat
  })
  const merged = mergeGeometries(prepared, false)
  prepared.forEach((g) => g.dispose())
  if (!merged) throw new Error('suspension geometry merge failed')
  return merged
}

const Y = new Vector3(0, 1, 0)

/** Cylinder of radius r from a to b. */
export function rod(a: V3, b: V3, r: number, radial: number, r2 = r): BufferGeometry {
  const va = new Vector3(...a)
  const vb = new Vector3(...b)
  const dir = vb.clone().sub(va)
  const length = dir.length()
  const g = new CylinderGeometry(r2, r, length, radial)
  g.translate(0, length / 2, 0)
  g.applyMatrix4(new Matrix4().makeRotationFromQuaternion(new Quaternion().setFromUnitVectors(Y, dir.normalize())).setPosition(va))
  return g
}

/** Cylinder along z centred on (x, y, z0..z1). */
function cylinderZ(r: number, x: number, y: number, z0: number, z1: number, radial: number): BufferGeometry {
  return rod([x, y, z0], [x, y, z1], r, radial)
}

/** Cylinder along x centred on (y, z). */
function cylinderX(r: number, x0: number, x1: number, y: number, z: number, radial: number): BufferGeometry {
  return rod([x0, y, z], [x1, y, z], r, radial)
}

function box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): BufferGeometry {
  const g = new BoxGeometry(x1 - x0, y1 - y0, z1 - z0)
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
  return g
}

function sphere(r: number, at: V3, d: GeometryDetail): BufferGeometry {
  const g = new SphereGeometry(r, d.radial, Math.max(8, Math.round(d.radial * 0.6)))
  g.translate(...at)
  return g
}

/** Lathe around +x (profile points are (radius, x)). */
function latheX(profile: [number, number][], segments: number): BufferGeometry {
  const g = new LatheGeometry(
    profile.map(([r, x]) => new Vector2(r, x)),
    segments,
  )
  g.rotateZ(-Math.PI / 2) // lathe axis +y → +x
  return g
}

/** Lathe around +y (profile points are (radius, y)). */
function latheY(profile: [number, number][], segments: number): BufferGeometry {
  return new LatheGeometry(
    profile.map(([r, y]) => new Vector2(r, y)),
    segments,
  )
}

const rel = (p: Vec2, o: Vec2, z = 0): V3 => [p.x - o.x, p.y - o.y, z]

/* ------------------------------------------------------------------ */
/* Static layout                                                        */
/* ------------------------------------------------------------------ */

const STATIC = solveLinkage(0, LOADED_RADIUS)
const LIP = HARDPOINTS.lowerInner
const UIP = HARDPOINTS.upperInner
const LBJ0 = HARDPOINTS.lowerBallJoint
const UBJ0 = HARDPOINTS.upperBallJoint
/** Static wheel centre (body frame). */
export const WHEEL_CENTRE0: Vec2 = { x: HARDPOINTS.wheelCentreX, y: LOADED_RADIUS }

/** Inboard end of the drawn body section (m). */
export const SECTION_X = -0.4

/* ------------------------------------------------------------------ */
/* Parts                                                                */
/* ------------------------------------------------------------------ */

/** Lower wishbone in its pivot frame (origin on the inner pivot axis). */
function buildLowerArm(d: GeometryDetail): BufferGeometry {
  const z = HARDPOINTS.lowerInnerZ
  const bj = rel(LBJ0, LIP)
  const f = HARDPOINTS.coiloverLowerFraction
  const eye: V3 = [bj[0] * f, bj[1] * f, 0]
  const legZ = z * (1 - f)
  const drop = DROP_LINK.lower0
  return merge([
    cylinderZ(0.028, 0, 0, z - 0.035, z + 0.035, d.radial),
    cylinderZ(0.028, 0, 0, -z - 0.035, -z + 0.035, d.radial),
    rod([0, 0, z], bj, 0.016, d.radial, 0.014),
    rod([0, 0, -z], bj, 0.016, d.radial, 0.014),
    // Cross brace and the clevis that carries the coil-over's lower eye.
    rod([eye[0], eye[1], -legZ], [eye[0], eye[1], legZ], 0.013, d.radial),
    box(eye[0] - 0.03, eye[0] + 0.03, eye[1] - 0.035, eye[1] + 0.02, 0.026, 0.034),
    box(eye[0] - 0.03, eye[0] + 0.03, eye[1] - 0.035, eye[1] + 0.02, -0.034, -0.026),
    // Ball-joint housing.
    cylinderZ(0.032, bj[0], bj[1] - 0.004, -0.022, 0.022, d.radial),
    // Drop-link tab on the rear leg.
    box(drop[0] - LIP.x - 0.018, drop[0] - LIP.x + 0.018, drop[1] - LIP.y - 0.012, drop[1] - LIP.y + 0.012, drop[2] - 0.012, drop[2] + 0.012),
  ])
}

/** Upper wishbone in its pivot frame. */
function buildUpperArm(d: GeometryDetail): BufferGeometry {
  const z = HARDPOINTS.upperInnerZ
  const bj = rel(UBJ0, UIP)
  return merge([
    cylinderZ(0.024, 0, 0, z - 0.03, z + 0.03, d.radial),
    cylinderZ(0.024, 0, 0, -z - 0.03, -z + 0.03, d.radial),
    rod([0, 0, z], bj, 0.013, d.radial, 0.011),
    rod([0, 0, -z], bj, 0.013, d.radial, 0.011),
    rod([bj[0] * 0.55, bj[1] * 0.55, -z * 0.45], [bj[0] * 0.55, bj[1] * 0.55, z * 0.45], 0.009, d.radial),
    cylinderZ(0.028, bj[0], bj[1] + 0.004, -0.02, 0.02, d.radial),
  ])
}

/** One ball joint (centred on its pivot): the ball, its socket ring and the tapered stud. */
function buildBallJoint(d: GeometryDetail, studUp: boolean): BufferGeometry {
  const ring = new TorusGeometry(0.024, 0.006, 8, d.radial)
  ring.rotateX(Math.PI / 2)
  const stud = rod([0, 0, 0], [0, studUp ? 0.05 : -0.05, 0], 0.011, d.radial, 0.007)
  return merge([sphere(0.02, [0, 0, 0], d), ring, stud])
}

/** Knuckle (upright) in static body coordinates. */
function buildKnuckle(d: GeometryDetail): BufferGeometry {
  const wc = WHEEL_CENTRE0
  const boss: V3 = [wc.x - 0.07, wc.y, 0]
  const tro = HARDPOINTS.tieRodOuter
  return merge([
    rod([LBJ0.x, LBJ0.y + 0.02, 0], boss, 0.024, d.radial, 0.03),
    rod(boss, [UBJ0.x, UBJ0.y - 0.02, 0], 0.03, d.radial, 0.02),
    // Bearing housing around the stub axle.
    cylinderX(0.058, wc.x - 0.105, wc.x - 0.025, wc.y, 0, d.radial),
    // Steering arm back to the outer tie-rod joint.
    rod([boss[0] - 0.01, tro.y - 0.01, -0.02], [tro.x, tro.y, HARDPOINTS.tieRodZ], 0.016, d.radial, 0.012),
    sphere(0.018, [tro.x, tro.y, HARDPOINTS.tieRodZ], d),
    // Ball-joint seats.
    cylinderZ(0.026, LBJ0.x, LBJ0.y + 0.02, -0.022, 0.022, d.radial),
    cylinderZ(0.022, UBJ0.x, UBJ0.y - 0.018, -0.02, 0.02, d.radial),
  ])
}

/** Hub flange, studs and dust cap — centred on the wheel centre, spins with the wheel. */
function buildHub(d: GeometryDetail): BufferGeometry {
  const face = HARDPOINTS.hubFaceX - HARDPOINTS.wheelCentreX
  const parts = [
    cylinderX(0.034, -0.03, face - 0.012, 0, 0, d.radial),
    cylinderX(0.07, face - 0.012, face, 0, 0, d.radial),
    cylinderX(0.024, face, face + 0.03, 0, 0, d.radial),
  ]
  for (let i = 0; i < WHEEL_SPOKES; i++) {
    const a = (i / WHEEL_SPOKES) * Math.PI * 2 + Math.PI / WHEEL_SPOKES
    parts.push(cylinderX(0.006, face, face + 0.032, Math.cos(a) * 0.05, Math.sin(a) * 0.05, 8))
  }
  return merge(parts)
}

/** Tyre (lathe about the axle, x), centred on the wheel centre. */
function buildTyre(d: GeometryDetail): BufferGeometry {
  const w = TYRE.width / 2
  const R = TYRE.freeRadius
  const rim = TYRE.rimRadius + 0.006
  const profile: [number, number][] = [
    [rim, -w + 0.012],
    [rim + 0.03, -w - 0.002],
    [R - 0.035, -w + 0.002],
    [R - 0.008, -w + 0.016],
    [R, -w + 0.04],
    [R, w - 0.04],
    [R - 0.008, w - 0.016],
    [R - 0.035, w - 0.002],
    [rim + 0.03, w + 0.002],
    [rim, w - 0.012],
  ]
  const g = latheX(profile, d.lathe)
  g.computeVertexNormals()
  return g
}

/** Rim barrel + spokes, centred on the wheel centre. */
function buildRim(d: GeometryDetail): BufferGeometry {
  const w = TYRE.width / 2
  const r = TYRE.rimRadius
  const face = HARDPOINTS.hubFaceX - HARDPOINTS.wheelCentreX
  const barrel = latheX(
    [
      [r + 0.012, -w - 0.004],
      [r, -w + 0.006],
      [r - 0.01, -w + 0.03],
      [r - 0.012, w - 0.03],
      [r, w - 0.006],
      [r + 0.012, w + 0.004],
      [r - 0.004, w + 0.008],
      [r - 0.016, w - 0.01],
      [r - 0.022, -w + 0.03],
      [r - 0.004, -w - 0.006],
    ],
    d.lathe,
  )
  const centre = cylinderX(0.085, face - 0.004, face + 0.014, 0, 0, d.radial)
  const parts = [barrel, centre]
  for (let i = 0; i < WHEEL_SPOKES; i++) {
    const a = (i / WHEEL_SPOKES) * Math.PI * 2
    const inner: V3 = [face + 0.01, Math.cos(a) * 0.075, Math.sin(a) * 0.075]
    const outer: V3 = [w - 0.02, Math.cos(a) * (r - 0.015), Math.sin(a) * (r - 0.015)]
    parts.push(rod(inner, outer, 0.017, 10, 0.012))
  }
  // Valve stem: a visible mark that makes the spin easy to follow.
  parts.push(rod([w - 0.03, r - 0.01, 0], [w - 0.012, r - 0.045, 0], 0.005, 8))
  return merge(parts)
}

/** Damper body (outer tube), lower eye and lower spring seat — along the coil-over axis from the eye. */
function buildDamperBody(d: GeometryDetail): BufferGeometry {
  const eye = cylinderZ(COILOVER.eyeRadius, 0, 0, -0.024, 0.024, d.radial)
  return merge([
    eye,
    latheY(
      [
        [0.001, 0.012],
        [COILOVER.tubeRadius * 0.7, 0.012],
        [COILOVER.tubeRadius, 0.03],
        [COILOVER.tubeRadius, COILOVER.tubeLength - 0.01],
        [COILOVER.tubeRadius * 0.75, COILOVER.tubeLength],
        [COILOVER.rodRadius + 0.003, COILOVER.tubeLength],
      ],
      d.radial,
    ),
    latheY(
      [
        [COILOVER.tubeRadius, COILOVER.lowerSeat - 0.012],
        [COILOVER.seatRadius, COILOVER.lowerSeat - 0.004],
        [COILOVER.seatRadius, COILOVER.lowerSeat + 0.004],
        [COILOVER.tubeRadius, COILOVER.lowerSeat + 0.004],
      ],
      d.radial,
    ),
  ])
}

/** Piston rod and upper spring seat, hanging DOWN from the top mount (origin at the top). */
function buildDamperRod(d: GeometryDetail): BufferGeometry {
  const gap = COILOVER.upperSeatGap
  return merge([
    rod([0, -COILOVER.rodLength, 0], [0, 0, 0], COILOVER.rodRadius, d.radial),
    latheY(
      [
        [COILOVER.rodRadius, -gap - 0.004],
        [COILOVER.seatRadius, -gap - 0.004],
        [COILOVER.seatRadius, -gap + 0.004],
        [COILOVER.seatRadius * 0.55, -gap + 0.012],
        [COILOVER.rodRadius, -gap + 0.014],
      ],
      d.radial,
    ),
  ])
}

/** Free bump stop: a ribbed rubber cone hanging down from y = 0 to y = −free length. */
function buildBumpStop(d: GeometryDetail): BufferGeometry {
  const L = COILOVER.bumpStopLength
  const R = COILOVER.bumpStopRadius
  const profile: [number, number][] = [[COILOVER.rodRadius + 0.001, -L]]
  const ribs = 4
  for (let i = 0; i <= ribs * 2; i++) {
    const y = -L + (i / (ribs * 2)) * L
    const taper = 0.7 + 0.3 * (i / (ribs * 2))
    profile.push([(i % 2 === 0 ? R * 0.82 : R) * taper, y])
  }
  profile.push([COILOVER.rodRadius + 0.001, 0])
  const g = latheY(profile, d.radial)
  g.computeVertexNormals()
  return g
}

/** Anti-roll bar (the bar along x, its rubber bush) — the arm is separate. */
function buildAntiRollBar(d: GeometryDetail): { bar: BufferGeometry; arm: BufferGeometry } {
  const { y, z } = HARDPOINTS.antiRollAxis
  const bar = merge([
    cylinderX(0.012, SECTION_X, DROP_LINK.x, y, z, d.radial),
    cylinderX(0.022, -0.04, 0.04, y, z, d.radial),
    sphere(0.014, [DROP_LINK.x, y, z], d),
  ])
  const arm = merge([rod([0, 0, 0], [0, 0, HARDPOINTS.antiRollArm], 0.012, d.radial, 0.01), sphere(0.013, [0, 0, HARDPOINTS.antiRollArm], d)])
  return { bar, arm }
}

/** Drop link along +y from its lower ball joint, at its true length. */
function buildDropLink(d: GeometryDetail): BufferGeometry {
  const L = DROP_LINK_LENGTH
  return merge([rod([0, 0.012, 0], [0, L - 0.012, 0], 0.007, d.radial), sphere(0.013, [0, 0, 0], d), sphere(0.013, [0, L, 0], d)])
}

/** Tie rod along +y from its inner ball joint, at its nominal length. */
function buildTieRod(d: GeometryDetail): BufferGeometry {
  const L = TIE_ROD_LENGTH
  return merge([sphere(0.016, [0, 0, 0], d), rod([0, 0, 0], [0, L * 0.7, 0], 0.011, d.radial), rod([0, L * 0.7, 0], [0, L - 0.02, 0], 0.014, d.radial, 0.016)])
}

/** Steering-rack end and its rubber gaiter (static, body frame). */
function buildRackEnd(d: GeometryDetail): { gaiter: BufferGeometry; housing: BufferGeometry } {
  const y = TIE_ROD_INNER.y
  const z = HARDPOINTS.tieRodZ
  const x0 = 0.12
  const x1 = TIE_ROD_INNER.x - 0.02
  const folds = 7
  const profile: [number, number][] = [[0.012, x0]]
  for (let i = 0; i <= folds * 2; i++) profile.push([i % 2 === 0 ? 0.03 : 0.022, x0 + ((x1 - x0) * i) / (folds * 2)])
  profile.push([0.012, x1])
  const gaiter = latheX(profile, d.radial)
  gaiter.computeVertexNormals()
  gaiter.translate(0, y, z)
  return { gaiter, housing: cylinderX(0.032, SECTION_X, x0 + 0.01, y, z, d.radial) }
}

/** Body side of the corner: subframe, spring tower, upper-arm bracket, turret and top mount. */
function buildChassis(d: GeometryDetail): { metal: BufferGeometry; rubber: BufferGeometry; cut: BufferGeometry } {
  const zl = HARDPOINTS.lowerInnerZ
  const zu = HARDPOINTS.upperInnerZ
  const top = HARDPOINTS.topMount
  const turretY = top.y + 0.04
  const metal = merge([
    // Subframe cross-members ending in clevis brackets around the lower-arm bushes.
    box(SECTION_X, LIP.x - 0.03, LIP.y - 0.035, LIP.y + 0.035, zl - 0.03, zl + 0.03),
    box(SECTION_X, LIP.x - 0.03, LIP.y - 0.035, LIP.y + 0.035, -zl - 0.03, -zl + 0.03),
    ...[zl, -zl].flatMap((z) => [
      box(LIP.x - 0.05, LIP.x + 0.035, LIP.y - 0.04, LIP.y + 0.04, z + 0.036, z + 0.044),
      box(LIP.x - 0.05, LIP.x + 0.035, LIP.y - 0.04, LIP.y + 0.04, z - 0.044, z - 0.036),
    ]),
    // Spring tower up to the turret.
    box(LIP.x - 0.01, LIP.x + 0.06, LIP.y + 0.035, turretY, -0.06, 0.06),
    box(SECTION_X, LIP.x - 0.01, turretY - 0.07, turretY, -0.06, 0.06),
    // Upper-arm bracket with clevises around the bushes.
    box(LIP.x + 0.04, UIP.x - 0.01, UIP.y - 0.035, UIP.y + 0.035, -zu - 0.05, zu + 0.05),
    ...[zu, -zu].flatMap((z) => [
      box(UIP.x - 0.03, UIP.x + 0.03, UIP.y - 0.035, UIP.y + 0.035, z + 0.031, z + 0.039),
      box(UIP.x - 0.03, UIP.x + 0.03, UIP.y - 0.035, UIP.y + 0.035, z - 0.039, z - 0.031),
    ]),
    // Turret top plate over the coil-over.
    box(LIP.x - 0.01, top.x + 0.12, turretY, turretY + 0.025, -0.11, 0.11),
    // Anti-roll-bar clamp and steering-rack brackets down to the rear cross-member.
    box(-0.035, 0.035, LIP.y + 0.035, HARDPOINTS.antiRollAxis.y + 0.026, HARDPOINTS.antiRollAxis.z - 0.025, -zl + 0.03),
    box(0.06, 0.1, LIP.y + 0.035, TIE_ROD_INNER.y, HARDPOINTS.tieRodZ - 0.02, HARDPOINTS.tieRodZ + 0.02),
  ])
  // Rubber top mount, tilted with the coil-over at rest.
  const mount = latheY(
    [
      [0.001, 0],
      [0.045, 0],
      [0.052, 0.012],
      [0.052, turretY - top.y - 0.008],
      [0.03, turretY - top.y],
      [0.001, turretY - top.y],
    ],
    d.radial,
  )
  mount.rotateZ(STATIC.coiloverAngle)
  mount.translate(top.x, top.y, 0)
  // Section faces where the body is cut away (inboard ends).
  const cut = merge([
    box(SECTION_X - 0.002, SECTION_X + 0.002, LIP.y - 0.035, LIP.y + 0.035, zl - 0.03, zl + 0.03),
    box(SECTION_X - 0.002, SECTION_X + 0.002, LIP.y - 0.035, LIP.y + 0.035, -zl - 0.03, -zl + 0.03),
    box(SECTION_X - 0.002, SECTION_X + 0.002, turretY - 0.07, turretY, -0.06, 0.06),
  ])
  return { metal, rubber: mount, cut }
}

/* ------------------------------------------------------------------ */
/* Coil spring (dynamic)                                                */
/* ------------------------------------------------------------------ */

export function coilSpecFor(d: GeometryDetail): CoilSpec {
  return {
    coilRadius: COILOVER.coilRadius,
    wireRadius: COILOVER.wireRadius,
    turns: COILOVER.turns,
    deadTurns: COILOVER.deadTurns,
    segmentsPerTurn: d.coilSegmentsPerTurn,
    radialSegments: d.coilRadial,
  }
}

export interface CoilGeometry {
  geometry: BufferGeometry
  /** Rewrite the vertices for a new spring length (no allocation). */
  setLength: (length: number) => void
}

/** A coil spring whose vertex buffers are allocated once and rewritten in place as it compresses. */
export function createCoilGeometry(d: GeometryDetail, initialLength: number): CoilGeometry {
  const spec = coilSpecFor(d)
  const n = coilVertexCount(spec)
  const position = new BufferAttribute(new Float32Array(n * 3), 3).setUsage(DynamicDrawUsage)
  const normal = new BufferAttribute(new Float32Array(n * 3), 3).setUsage(DynamicDrawUsage)
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', position)
  geometry.setAttribute('normal', normal)
  geometry.setIndex(new BufferAttribute(coilIndices(spec), 1))
  let current = Number.NaN
  const setLength = (length: number) => {
    if (Math.abs(length - current) < 1e-6) return
    current = length
    writeCoil(spec, length, position.array as Float32Array, normal.array as Float32Array)
    position.needsUpdate = true
    normal.needsUpdate = true
    geometry.computeBoundingSphere()
  }
  setLength(initialLength)
  return { geometry, setLength }
}

/* ------------------------------------------------------------------ */
/* Everything                                                           */
/* ------------------------------------------------------------------ */

export function buildSuspensionGeometries(tier: QualityTier) {
  const d = DETAIL[tier]
  const chassis = buildChassis(d)
  const arb = buildAntiRollBar(d)
  const rack = buildRackEnd(d)
  return {
    lowerArm: buildLowerArm(d),
    upperArm: buildUpperArm(d),
    lowerBallJoint: buildBallJoint(d, true),
    upperBallJoint: buildBallJoint(d, false),
    knuckle: buildKnuckle(d),
    hub: buildHub(d),
    tyre: buildTyre(d),
    rim: buildRim(d),
    damperBody: buildDamperBody(d),
    damperRod: buildDamperRod(d),
    bumpStop: buildBumpStop(d),
    antiRollBar: arb.bar,
    antiRollArm: arb.arm,
    dropLink: buildDropLink(d),
    tieRod: buildTieRod(d),
    rackGaiter: rack.gaiter,
    rackHousing: rack.housing,
    chassis: chassis.metal,
    topMount: chassis.rubber,
    sectionCut: chassis.cut,
    /** Unit-length patch along z (scaled to the contact length each frame). */
    contactPatch: new BoxGeometry(TYRE.width * 0.92, 0.002, 1),
  }
}

export type SuspensionGeometries = ReturnType<typeof buildSuspensionGeometries>

export function disposeAll(geo: Record<string, BufferGeometry>) {
  Object.values(geo).forEach((g) => g.dispose())
}
