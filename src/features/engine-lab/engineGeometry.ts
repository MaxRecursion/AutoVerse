/**
 * three.js geometry builders for the procedural engine. Every dimension comes
 * from engineModel.ts so the 3D model, the 2D section and the tests agree.
 *
 * Static parts are merged per material to keep draw calls low; moving parts
 * are built around their own pivot (crank axis, wrist pin, valve seat, cam
 * centre) so the scene only has to set one transform per part per frame.
 */
import {
  BoxGeometry,
  BufferGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Path,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import {
  BLOCK,
  BORE_R,
  CAM_CENTRE_S,
  COMPRESSION_HEIGHT,
  CRANK,
  CRANK_R,
  DECK_Y,
  FLYWHEEL,
  HEAD,
  PISTON,
  ROD_L,
  SPARK_PLUG,
  TIMING,
  VALVES,
  VALVE_S,
  ROOF_SLOPE,
  camCentre,
  camLobeProfile,
  headRearOutline,
  headSectionPieces,
  portPath,
  roofHeight,
  timingBeltPath,
  type Vec2,
} from './engineModel'
import type { ValveId } from './kinematics'

export interface GeometryDetail {
  /** Radial segments for round parts. */
  radial: number
  /** Curve segments for arcs in extruded shapes. */
  curve: number
}

export const DETAIL: Record<'low' | 'high', GeometryDetail> = {
  low: { radial: 20, curve: 8 },
  high: { radial: 40, curve: 16 },
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

/** Merge geometries (indexed or not) into one non-indexed geometry and dispose the inputs. */
export function merge(list: BufferGeometry[]): BufferGeometry {
  const prepared = list.map((g) => {
    const flat = g.index ? g.toNonIndexed() : g
    if (flat !== g) g.dispose()
    flat.clearGroups()
    if (!flat.getAttribute('uv')) flat.setAttribute('uv', new Float32BufferAttribute(new Float32Array((flat.getAttribute('position').count) * 2), 2))
    return flat
  })
  const merged = mergeGeometries(prepared, false)
  prepared.forEach((g) => g.dispose())
  if (!merged) throw new Error('engine geometry merge failed')
  return merged
}

/** Shape from a (z, y) polygon, in the coordinates extrudeAlongX expects. */
const shapeZY = (pts: Vec2[]) => new Shape(pts.map((p) => new Vector2(-p.z, p.y)))

/** Extrude a (z, y) profile along x from x0 to x1. */
function extrudeAlongX(shape: Shape | Shape[], x0: number, x1: number, curve: number): BufferGeometry {
  const g = new ExtrudeGeometry(shape, { depth: x1 - x0, bevelEnabled: false, curveSegments: curve })
  g.rotateY(Math.PI / 2) // (X, Y, Z) → (Z, Y, −X): shape X = −z, extrusion → +x
  g.translate(x0, 0, 0)
  return g
}

/** Extrude a top-view (x, −z) profile up the cylinder axis from y0 to y1. */
function extrudeAlongY(shape: Shape | Shape[], y0: number, y1: number, curve: number): BufferGeometry {
  const g = new ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false, curveSegments: curve })
  g.rotateX(-Math.PI / 2) // (X, Y, Z) → (X, Z, −Y): extrusion → +y
  g.translate(0, y0, 0)
  return g
}

/** Cylinder whose axis runs along x, from x0 to x1. */
function cylinderX(radius: number, x0: number, x1: number, radial: number, y = 0, z = 0): BufferGeometry {
  const g = new CylinderGeometry(radius, radius, x1 - x0, radial)
  g.rotateZ(Math.PI / 2)
  g.translate((x0 + x1) / 2, y, z)
  return g
}

/** Cylinder along y from y0 to y1 (optionally a partial sweep, e.g. the rear half). */
function cylinderY(rTop: number, rBottom: number, y0: number, y1: number, radial: number, open = false, thetaStart = 0, thetaLength = Math.PI * 2) {
  const g = new CylinderGeometry(rTop, rBottom, y1 - y0, radial, 1, open, thetaStart, thetaLength)
  g.translate(0, (y0 + y1) / 2, 0)
  return g
}

/** Rear half (x ≤ 0) of a ring between rIn and rOut, as a top-view shape. */
function halfRingShape(rIn: number, rOut: number): Shape {
  const s = new Shape()
  s.moveTo(0, rOut)
  s.absarc(0, 0, rOut, Math.PI / 2, (Math.PI * 3) / 2, false)
  s.lineTo(0, -rIn)
  s.absarc(0, 0, rIn, (Math.PI * 3) / 2, Math.PI / 2, true)
  s.closePath()
  return s
}

/** Rear half of the block outline with a semicircular cut of radius `hole` (the bore / jacket). */
function blockHalfShape(hole: number): Shape {
  const w = BLOCK.halfWidth
  const d = BLOCK.depth
  const s = new Shape()
  s.moveTo(0, -w)
  s.lineTo(-d, -w)
  s.lineTo(-d, w)
  s.lineTo(0, w)
  s.lineTo(0, hole)
  s.absarc(0, 0, hole, Math.PI / 2, (Math.PI * 3) / 2, false)
  s.closePath()
  return s
}

/** Toothed pulley / sprocket outline with an optional set of lightening holes. */
function toothedShape(rOuter: number, rRoot: number, teeth: number, holes: { r: number; at: number; count: number } | null, bore: number): Shape {
  const s = new Shape()
  const steps = teeth * 4
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2
    const r = i % 4 === 1 || i % 4 === 2 ? rOuter : rRoot
    if (i === 0) s.moveTo(r * Math.cos(a), r * Math.sin(a))
    else s.lineTo(r * Math.cos(a), r * Math.sin(a))
  }
  if (holes)
    for (let k = 0; k < holes.count; k++) {
      const a = (k / holes.count) * Math.PI * 2 + Math.PI / holes.count
      const h = new Path()
      h.absarc(holes.at * Math.cos(a), holes.at * Math.sin(a), holes.r, 0, Math.PI * 2, true)
      s.holes.push(h)
    }
  const b = new Path()
  b.absarc(0, 0, bore, 0, Math.PI * 2, true)
  s.holes.push(b)
  return s
}

/**
 * Rear half of a tube of `radius` following a (z, y) centre-line in the x = 0
 * plane — a port duct sectioned through its centre.
 */
export function halfTube(path: Vec2[], normals: Vec2[], radius: number, radial: number): BufferGeometry {
  const ring = Math.max(6, Math.round(radial / 2))
  const pos: number[] = []
  const idx: number[] = []
  path.forEach((c, i) => {
    const n = normals[i]
    for (let j = 0; j <= ring; j++) {
      const a = (j / ring) * Math.PI
      const k = radius * Math.cos(a)
      pos.push(-radius * Math.sin(a), c.y + n.y * k, c.z + n.z * k)
    }
  })
  for (let i = 0; i < path.length - 1; i++)
    for (let j = 0; j < ring; j++) {
      const a = i * (ring + 1) + j
      const b = a + ring + 1
      idx.push(a, b, a + 1, a + 1, b, b + 1)
    }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/* ------------------------------------------------------------------ */
/* Block, crankcase, sump                                               */
/* ------------------------------------------------------------------ */

export function buildBlock(d: GeometryDetail) {
  const block = merge([
    extrudeAlongY(blockHalfShape(BLOCK.jacketOuterR), BLOCK.jacketBottomY, DECK_Y, d.curve * 2),
    extrudeAlongY(blockHalfShape(BLOCK.linerOuterR), BLOCK.linerBottomY, BLOCK.jacketBottomY, d.curve * 2),
    // Crankcase rear wall with the main-bearing bore.
    (() => {
      const w = BLOCK.halfWidth
      const s = shapeZY([
        { z: -w, y: BLOCK.crankcaseBottomY },
        { z: w, y: BLOCK.crankcaseBottomY },
        { z: w, y: BLOCK.linerBottomY },
        { z: -w, y: BLOCK.linerBottomY },
      ])
      const hole = new Path()
      hole.absarc(0, 0, BLOCK.mainBearingR, 0, Math.PI * 2, true)
      s.holes.push(hole)
      return extrudeAlongX(s, -BLOCK.depth, -BLOCK.depth + BLOCK.rearWall, d.curve * 2)
    })(),
    // Crankcase side walls.
    ...[1, -1].map((side) => {
      const g = new BoxGeometry(BLOCK.depth, BLOCK.linerBottomY - BLOCK.crankcaseBottomY, BLOCK.sideWall)
      g.translate(-BLOCK.depth / 2, (BLOCK.linerBottomY + BLOCK.crankcaseBottomY) / 2, side * (BLOCK.halfWidth - BLOCK.sideWall / 2))
      return g
    }),
  ])
  const liner = extrudeAlongY(halfRingShape(BORE_R, BLOCK.linerOuterR), BLOCK.linerBottomY, DECK_Y, d.curve * 2)
  return { block, liner }
}

export function buildSump() {
  const w = BLOCK.halfWidth
  const depth = BLOCK.depth
  const h = BLOCK.crankcaseBottomY - BLOCK.sumpBottomY
  const parts: BufferGeometry[] = []
  const pan = new BoxGeometry(depth, 0.03, w * 2)
  pan.translate(-depth / 2, BLOCK.sumpBottomY + 0.015, 0)
  parts.push(pan)
  for (const side of [1, -1]) {
    const lip = new BoxGeometry(depth, h, 0.04)
    lip.translate(-depth / 2, BLOCK.sumpBottomY + h / 2, side * (w - 0.02))
    parts.push(lip)
  }
  const rear = new BoxGeometry(0.04, h, w * 2)
  rear.translate(-depth + 0.02, BLOCK.sumpBottomY + h / 2, 0)
  parts.push(rear)
  const oil = new BoxGeometry(depth - 0.06, 0.07, w * 2 - 0.1)
  oil.translate(-depth / 2, BLOCK.sumpBottomY + 0.065, 0)
  return { pan: merge(parts), oil }
}

/* ------------------------------------------------------------------ */
/* Cylinder head, chamber, ports                                        */
/* ------------------------------------------------------------------ */

export function buildHead(d: GeometryDetail) {
  const camBores = (s: Shape) => {
    for (const v of ['intake', 'exhaust'] as const) {
      const c = camCentre(v)
      const hole = new Path()
      hole.absarc(-c.z, c.y, 0.105, 0, Math.PI * 2, true)
      s.holes.push(hole)
    }
    return s
  }
  return merge([
    extrudeAlongX(camBores(shapeZY(headRearOutline(false))), -HEAD.depth, -BORE_R, d.curve),
    extrudeAlongX(camBores(shapeZY(headRearOutline(true))), -BORE_R, -HEAD.frontLayer, d.curve),
    extrudeAlongX(headSectionPieces().map(shapeZY), -HEAD.frontLayer, 0, d.curve),
  ])
}

/**
 * One planar half of the pent-roof (z ≥ 0 for side = 1), as the rear half of
 * the bore in top view, lifted onto the roof plane. With `throat`, the valve
 * throat is notched out where it meets the section plane.
 */
function roofHalf(side: 1 | -1, drop: number, throat: { z: number; r: number } | null, d: GeometryDetail): BufferGeometry {
  const s = new Shape()
  // Top-view coordinates: X = x, Y = z (flipped back below).
  s.moveTo(0, 0)
  if (throat) {
    const rz = throat.r * Math.cos(Math.atan(ROOF_SLOPE))
    s.lineTo(0, throat.z - rz)
    s.absellipse(0, throat.z, throat.r, rz, -Math.PI / 2, -Math.PI * 1.5, true, 0)
  }
  s.lineTo(0, BORE_R)
  s.absarc(0, 0, BORE_R, Math.PI / 2, Math.PI, false)
  s.closePath()
  const g = new ShapeGeometry(s, d.curve)
  const p = g.getAttribute('position')
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const z = side * p.getY(i)
    p.setXYZ(i, x, DECK_Y + roofHeight(z) - drop, z)
  }
  g.computeVertexNormals()
  return g
}

export function buildChamber(d: GeometryDetail) {
  const lining = merge([
    roofHalf(1, 0.004, { z: Math.abs(VALVES.intake.seat.z), r: VALVES.intake.portR }, d),
    roofHalf(-1, 0.004, { z: Math.abs(VALVES.exhaust.seat.z), r: VALVES.exhaust.portR }, d),
  ])
  return lining
}

export function buildPorts(d: GeometryDetail) {
  const make = (valve: ValveId, shrink: number) => {
    const p = portPath(valve)
    return halfTube(p.centre, p.normals, VALVES[valve].portR - shrink, d.radial)
  }
  return {
    intake: make('intake', 0),
    exhaust: make('exhaust', 0),
    intakeGas: make('intake', 0.014),
    exhaustGas: make('exhaust', 0.014),
  }
}

/* ------------------------------------------------------------------ */
/* Section faces (the "cut" surfaces at x = 0)                          */
/* ------------------------------------------------------------------ */

/** Flat polygons lying just in front of the section plane, facing +x. */
function sectionFace(polys: Vec2[][]): BufferGeometry {
  return merge(
    polys.map((pts) => {
      const g = new ShapeGeometry(shapeZY(pts))
      g.rotateY(Math.PI / 2) // shape (−z, y) → plane x = 0, normal +x
      g.translate(0.002, 0, 0)
      return g
    }),
  )
}

const rectZY = (z0: number, z1: number, y0: number, y1: number): Vec2[] => [
  { z: z0, y: y0 },
  { z: z1, y: y0 },
  { z: z1, y: y1 },
  { z: z0, y: y1 },
]

/**
 * Cut faces of the sectioned castings, split per component so each one
 * hides / isolates / explodes with its own part. Drawn in a distinct colour,
 * as in a technical cutaway illustration.
 */
export function buildSectionFaces(): { block: BufferGeometry; liner: BufferGeometry; head: BufferGeometry } {
  const w = BLOCK.halfWidth
  const block: Vec2[][] = []
  const liner: Vec2[][] = []
  for (const s of [1, -1]) {
    const side = (z0: number, z1: number, y0: number, y1: number) => rectZY(s * z0, s * z1, y0, y1)
    block.push(side(BLOCK.jacketOuterR, w, BLOCK.jacketBottomY, DECK_Y))
    block.push(side(BLOCK.linerOuterR, w, BLOCK.linerBottomY, BLOCK.jacketBottomY))
    block.push(side(w - BLOCK.sideWall, w, BLOCK.crankcaseBottomY, BLOCK.linerBottomY))
    liner.push(side(BORE_R, BLOCK.linerOuterR, BLOCK.linerBottomY, DECK_Y))
  }
  return { block: sectionFace(block), liner: sectionFace(liner), head: sectionFace(headSectionPieces()) }
}

/* ------------------------------------------------------------------ */
/* Conceptual gas volume                                                */
/* ------------------------------------------------------------------ */

export function buildGas(d: GeometryDetail) {
  const r = PISTON.radius - 0.004
  // Unit-height column (y 0..1), scaled to crown → deck each frame.
  const column = merge([
    cylinderY(r, r, 0, 1, d.radial, true, Math.PI, Math.PI),
    (() => {
      const g = new BoxGeometry(0.0001, 1, r * 2)
      g.translate(0.0005, 0.5, 0)
      return g
    })(),
  ])
  const capFace = new ShapeGeometry(
    shapeZY([
      { z: -r, y: DECK_Y },
      { z: r, y: DECK_Y },
      { z: r, y: DECK_Y + roofHeight(r) - 0.008 },
      { z: 0, y: DECK_Y + roofHeight(0) - 0.008 },
      { z: -r, y: DECK_Y + roofHeight(-r) - 0.008 },
    ]),
  )
  capFace.rotateY(Math.PI / 2)
  capFace.translate(0.0005, 0, 0)
  const cap = merge([roofHalf(1, 0.009, null, d), roofHalf(-1, 0.009, null, d), capFace])
  return { column, cap }
}

/* ------------------------------------------------------------------ */
/* Piston, rings, wrist pin, rod (local to the wrist-pin centre)        */
/* ------------------------------------------------------------------ */

export function buildPiston(d: GeometryDetail) {
  const r = PISTON.radius
  const crown = COMPRESSION_HEIGHT
  const landBottom = crown - 0.17
  const skirtBottom = -PISTON.skirtBelowPin
  const body = merge([
    cylinderY(r, r, landBottom, crown, d.radial),
    // Rear half of the skirt, open so the pin and small end show.
    cylinderY(r, r, skirtBottom, landBottom, d.radial, true, Math.PI, Math.PI),
    cylinderY(r - 0.03, r - 0.03, skirtBottom, landBottom, d.radial, true, Math.PI, Math.PI),
    // Wrist-pin bosses.
    cylinderX(0.12, -0.33, -0.17, d.radial),
    cylinderX(0.12, 0.17, 0.33, d.radial),
  ])
  const rings = merge(
    PISTON.ringDepths.map((depth, i) => {
      const g = new TorusGeometry(r + 0.002, i === 2 ? 0.011 : 0.008, 6, d.radial)
      g.rotateX(Math.PI / 2)
      g.translate(0, crown - depth, 0)
      return g
    }),
  )
  const pin = cylinderX(PISTON.pinRadius, -PISTON.pinLength / 2, PISTON.pinLength / 2, d.radial)
  return { body, rings, pin }
}

/** Connecting rod hanging from its small end (origin) down local −y to the big end at −ROD_L. */
export function buildRod(d: GeometryDetail) {
  const shank = extrudeAlongX(
    shapeZY([
      { z: -0.045, y: -0.08 },
      { z: 0.045, y: -0.08 },
      { z: 0.075, y: -ROD_L + 0.12 },
      { z: -0.075, y: -ROD_L + 0.12 },
    ]),
    -0.035,
    0.035,
    d.curve,
  )
  const smallEnd = cylinderX(0.11, -0.05, 0.05, d.radial)
  const bigEnd = cylinderX(0.165, -0.06, 0.06, d.radial, -ROD_L)
  const bolts = [1, -1].map((side) => {
    const g = new BoxGeometry(0.05, 0.12, 0.04)
    g.translate(0, -ROD_L - 0.02, side * 0.17)
    return g
  })
  return merge([shank, smallEnd, bigEnd, ...bolts])
}

/* ------------------------------------------------------------------ */
/* Crankshaft, flywheel, sprockets (local to the crank axis, θ = 0)     */
/* ------------------------------------------------------------------ */

function webShape(curve: number): Shape {
  const s = new Shape()
  const pinY = CRANK_R
  const cw = CRANK.counterweightR
  const a0 = (200 * Math.PI) / 180
  const a1 = (340 * Math.PI) / 180
  s.moveTo(0.17, pinY)
  s.absarc(0, pinY, 0.17, 0, Math.PI, false)
  s.lineTo(-0.2, 0)
  s.lineTo(cw * Math.cos(a0), cw * Math.sin(a0))
  s.absarc(0, 0, cw, a0, a1, false)
  s.lineTo(0.2, 0)
  s.closePath()
  void curve
  return s
}

export function buildCrank(d: GeometryDetail) {
  const web = webShape(d.curve)
  const steel = merge([
    cylinderX(CRANK.journalR, CRANK.webInnerX + CRANK.webThickness, CRANK.frontStubX, d.radial),
    cylinderX(CRANK.journalR, CRANK.rearStubX, -(CRANK.webInnerX + CRANK.webThickness), d.radial),
    extrudeAlongX(web, CRANK.webInnerX, CRANK.webInnerX + CRANK.webThickness, d.curve),
    extrudeAlongX(web, -(CRANK.webInnerX + CRANK.webThickness), -CRANK.webInnerX, d.curve),
    cylinderX(CRANK.pinR, -CRANK.webInnerX, CRANK.webInnerX, d.radial, CRANK_R),
    extrudeAlongX(toothedShape(TIMING.crankSprocketR, TIMING.crankSprocketR - 0.018, 20, null, 0.05), TIMING.x - 0.03, TIMING.x + 0.03, d.curve),
  ])
  const flywheel = merge([
    extrudeAlongX(toothedShape(FLYWHEEL.radius, FLYWHEEL.radius - 0.02, 72, { r: 0.09, at: 0.42, count: 6 }, 0.05), FLYWHEEL.x - FLYWHEEL.thickness / 2, FLYWHEEL.x + FLYWHEEL.thickness / 2, d.curve),
    cylinderX(0.2, FLYWHEEL.x - 0.08, FLYWHEEL.x + 0.06, d.radial),
  ])
  // Timing marks (amber) on the flywheel and crank sprocket rims, at the crank pin's angle.
  // Kept separate so each explodes with its own part.
  const flywheelMark = new BoxGeometry(0.02, 0.07, 0.03)
  flywheelMark.translate(FLYWHEEL.x + FLYWHEEL.thickness / 2 + 0.005, FLYWHEEL.radius - 0.06, 0)
  const sprocketMark = new BoxGeometry(0.02, 0.04, 0.025)
  sprocketMark.translate(TIMING.x + 0.035, TIMING.crankSprocketR - 0.035, 0)
  return { steel, flywheel, flywheelMark, sprocketMark }
}

/* ------------------------------------------------------------------ */
/* Valvetrain (local to the valve seat, +y up the stem)                 */
/* ------------------------------------------------------------------ */

/** Unit-length helical spring along +y (scaled to the current spring length). */
export function springGeometry(coilR: number, wireR: number, turns: number, d: GeometryDetail): BufferGeometry {
  const pts: Vector3[] = []
  const n = turns * 12
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const a = t * turns * Math.PI * 2
    pts.push(new Vector3(coilR * Math.sin(a), t, coilR * Math.cos(a)))
  }
  return new TubeGeometry(new CatmullRomCurve3(pts), n * 2, wireR, Math.max(5, Math.round(d.radial / 6)), false)
}

export function buildValve(valve: ValveId, d: GeometryDetail) {
  const v = VALVES[valve]
  const head = merge([
    cylinderY(v.headR, v.headR, -0.012, VALVE_S.headThickness - 0.012, d.radial),
    cylinderY(v.stemR * 1.6, v.headR * 0.92, VALVE_S.headThickness - 0.012, VALVE_S.neckEnd, d.radial),
    cylinderY(v.stemR, v.stemR, VALVE_S.neckEnd, VALVE_S.stemTop, Math.max(8, d.radial / 2)),
  ])
  return head
}

export function buildValveSpringParts(d: GeometryDetail) {
  const coil = springGeometry(0.092, 0.014, 6, d)
  const seat = cylinderY(0.115, 0.115, VALVE_S.springSeat - 0.012, VALVE_S.springSeat, d.radial)
  // Retainer sits on top of the spring, under the follower, and moves with the valve.
  const retainer = cylinderY(0.08, 0.108, VALVE_S.retainer - 0.022, VALVE_S.retainer, d.radial)
  return { coil, seat, retainer }
}

export function buildFollower(d: GeometryDetail) {
  const cup = cylinderY(0.13, 0.13, VALVE_S.retainer, VALVE_S.followerTop, d.radial)
  const rollerS = VALVE_S.followerTop + VALVE_S.rollerR
  const cheeks = [1, -1].map((side) => {
    const g = new BoxGeometry(0.02, VALVE_S.rollerR * 2 + 0.02, 0.07)
    g.translate(side * 0.065, rollerS - 0.005, 0)
    return g
  })
  const body = merge([cup, ...cheeks])
  const roller = cylinderX(VALVE_S.rollerR, -0.05, 0.05, Math.max(10, d.radial / 2), rollerS)
  return { body, roller }
}

/**
 * Camshaft local to its centre. The lobe nose points to local −y (towards the
 * follower) at zero rotation; the shaft runs along x to its belt pulley.
 */
export function buildCamshaft(valve: ValveId, d: GeometryDetail) {
  const lobePts = camLobeProfile(valve, d.radial * 3)
  const lobe = extrudeAlongX(shapeZY(lobePts), -0.065, 0.065, d.curve)
  const shaft = merge([
    lobe,
    cylinderX(0.065, -0.9, 0.3, Math.max(10, d.radial / 2)),
    cylinderX(0.1, -0.31, -0.19, d.radial),
    cylinderX(0.1, -0.58, -0.46, d.radial),
    cylinderX(0.085, 0.24, 0.3, d.radial),
  ])
  const pulley = extrudeAlongX(toothedShape(TIMING.camPulleyR, TIMING.camPulleyR - 0.018, 40, { r: 0.06, at: 0.17, count: 5 }, 0.06), TIMING.x - 0.03, TIMING.x + 0.03, d.curve)
  const mark = new BoxGeometry(0.02, 0.05, 0.03)
  mark.translate(TIMING.x + 0.035, -(TIMING.camPulleyR - 0.04), 0)
  return { shaft, pulley, mark }
}

/** Cam centre in valve-local coordinates (distance up the stem). */
export const CAM_LOCAL_Y = CAM_CENTRE_S

/* ------------------------------------------------------------------ */
/* Spark plug, timing belt, spark flash                                 */
/* ------------------------------------------------------------------ */

export function buildSparkPlug(d: GeometryDetail) {
  const p = SPARK_PLUG
  const radial = Math.max(10, d.radial / 2)
  const shell = merge([
    cylinderY(p.threadR, p.threadR, p.threadBottomY, p.threadTopY, radial),
    cylinderY(p.hexR, p.hexR, p.threadTopY, p.hexTopY, 6),
    // Earth (ground) electrode: a small hook under the centre electrode.
    (() => {
      const g = new BoxGeometry(0.018, 0.05, 0.018)
      g.translate(0, p.tipY - 0.004, 0.035)
      return g
    })(),
    (() => {
      const g = new BoxGeometry(0.018, 0.016, 0.05)
      g.translate(0, p.tipY - 0.028, 0.015)
      return g
    })(),
    cylinderY(0.011, 0.011, p.tipY - 0.012, p.threadBottomY, 8),
  ])
  const insulator = merge([cylinderY(p.insulatorR * 0.8, p.insulatorR, p.hexTopY, p.insulatorTopY, radial), cylinderY(0.03, 0.03, p.insulatorTopY, p.terminalTopY, radial)])
  return { shell, insulator }
}

export function buildTimingBelt(d: GeometryDetail) {
  const path = timingBeltPath(d.curve)
  const half = TIMING.beltThickness / 2
  // Offset the loop outwards and inwards (vertex normals of a convex loop).
  const offset = (k: number) =>
    path.map((p, i) => {
      const a = path[(i - 1 + path.length) % path.length]
      const b = path[(i + 1) % path.length]
      const tz = b.z - a.z
      const ty = b.y - a.y
      const len = Math.hypot(tz, ty) || 1
      // Counter-clockwise loop: outward normal is the tangent rotated −90°.
      return { z: p.z + (ty / len) * k, y: p.y - (tz / len) * k }
    })
  const outer = shapeZY(offset(half))
  const inner = offset(-half)
  outer.holes.push(new Path(inner.map((p) => new Vector2(-p.z, p.y))))
  return extrudeAlongX(outer, TIMING.x - TIMING.beltWidth / 2, TIMING.x + TIMING.beltWidth / 2, d.curve)
}

export const buildSparkFlash = () => new SphereGeometry(0.05, 12, 8)

/** One raised rib on the belt's outer face, centred on the belt's mid-line (instanced along the loop). */
export function buildBeltRib(): BufferGeometry {
  const g = new BoxGeometry(TIMING.beltWidth * 0.96, TIMING.beltThickness * 0.7, 0.028)
  g.translate(0, TIMING.beltThickness * 0.6, 0)
  return g
}

/** Every geometry the scene needs, built once per quality tier. */
export function buildEngineGeometries(tier: 'low' | 'high') {
  const d = DETAIL[tier]
  const geometries = {
    ...buildBlock(d),
    sump: buildSump(),
    head: buildHead(d),
    chamber: buildChamber(d),
    ports: buildPorts(d),
    gas: buildGas(d),
    piston: buildPiston(d),
    rod: buildRod(d),
    crank: buildCrank(d),
    valves: { intake: buildValve('intake', d), exhaust: buildValve('exhaust', d) },
    spring: buildValveSpringParts(d),
    follower: buildFollower(d),
    cams: { intake: buildCamshaft('intake', d), exhaust: buildCamshaft('exhaust', d) },
    plug: buildSparkPlug(d),
    belt: buildTimingBelt(d),
    beltRib: buildBeltRib(),
    flash: buildSparkFlash(),
    section: buildSectionFaces(),
  }
  return geometries
}

export type EngineGeometries = ReturnType<typeof buildEngineGeometries>

/** Dispose every BufferGeometry in a (nested) record. */
export function disposeAll(obj: unknown): void {
  if (obj instanceof BufferGeometry) obj.dispose()
  else if (obj && typeof obj === 'object') Object.values(obj).forEach(disposeAll)
}
