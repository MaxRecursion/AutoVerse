/**
 * three.js geometry builders for the procedural disc-brake corner. Every
 * dimension comes from brakeParts.ts so the scene, the 2D diagram and the
 * tests agree.
 *
 * Moving parts are built around their own pivot / rest position so the scene
 * sets exactly one transform per part per frame. Static pieces of one part
 * are merged per material to keep draw calls low.
 */
import {
  BoxGeometry,
  BufferGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  ExtrudeGeometry,
  LatheGeometry,
  PlaneGeometry,
  RingGeometry,
  Shape,
  ShapeGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import {
  ABS_UNIT,
  AXIS_Y,
  CALIPER,
  CALIPER_FRAME_ROT_X,
  DISC,
  DISC_FACE,
  HUB,
  MASTER,
  PAD_STACK,
  PEDAL,
  PISTON_LENGTH,
  RIM,
  ROAD,
  SENSOR,
  SENSOR_ANGLE_DEG,
  SERVO,
  TONE_RING,
  TYRE,
  brakeLinePoints,
  sensorPoint,
  sensorWirePoints,
  type Vec3,
} from './brakeParts'

export interface BrakeDetail {
  /** Segments around round parts. */
  radial: number
  /** Segments along curves (pad arcs, tubes). */
  curve: number
}

export const BRAKE_DETAIL: Record<'low' | 'high', BrakeDetail> = {
  low: { radial: 36, curve: 10 },
  high: { radial: 72, curve: 20 },
}

const DEG = Math.PI / 180
type Profile = readonly (readonly [number, number])[]

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

/** Merge geometries, dropping indices first when they are mixed. */
function merge(list: BufferGeometry[]): BufferGeometry {
  const mixed = list.some((g) => g.index) && list.some((g) => !g.index)
  const parts = mixed ? list.map((g) => (g.index ? g.toNonIndexed() : g)) : list
  const out = mergeGeometries(parts, false)
  if (!out) throw new Error('brakeGeometry: could not merge geometries')
  list.forEach((g) => g.dispose())
  if (mixed) parts.forEach((g) => g.dispose())
  return out
}

/** Revolve a closed (radius, axial) profile — counter-clockwise for outward normals — about the X axis. */
function latheX(profile: Profile, segments: number, phiStart = 0, phiLength = Math.PI * 2): BufferGeometry {
  const g = new LatheGeometry(
    profile.map(([r, x]) => new Vector2(r, x)),
    segments,
    phiStart,
    phiLength,
  )
  return g.rotateZ(-Math.PI / 2)
}

/** Cylinder whose axis is X, from x0 to x1. */
function cylinderX(radius: number, x0: number, x1: number, segments: number, openEnded = false): BufferGeometry {
  return new CylinderGeometry(radius, radius, x1 - x0, segments, 1, openEnded)
    .rotateZ(-Math.PI / 2)
    .translate((x0 + x1) / 2, 0, 0)
}

/** Box placed at radius r (centre) and angle φ about the X axis, its local Y radial and Z tangential. */
function radialBox(size: Vec3, x: number, r: number, phi: number, twist = 0): BufferGeometry {
  return new BoxGeometry(...size)
    .rotateX(twist)
    .translate(0, r, 0)
    .rotateX(phi)
    .translate(x, 0, 0)
}

/**
 * Half of a lathe shell (the half facing −Z is kept, the +Z half cut away)
 * plus flat section faces in the cut plane Z = 0, so the bore and piston show.
 */
function halfShellX(profile: Profile, segments: number): { shell: BufferGeometry; section: BufferGeometry } {
  const shell = latheX(profile, Math.ceil(segments / 2), Math.PI / 2, Math.PI)
  const face = (sign: 1 | -1) => {
    const shape = new Shape(profile.map(([r, x]) => new Vector2(x, sign * r)))
    return new ShapeGeometry(shape).translate(0, 0, 0.001)
  }
  return { shell, section: merge([face(1), face(-1)]) }
}

/** Annular-sector prism: an arc pad shape centred on +Y, extruded along X from x0 to x1. */
function sectorPrismX(rIn: number, rOut: number, halfAngleDeg: number, x0: number, x1: number, curve: number): BufferGeometry {
  const a0 = Math.PI / 2 - halfAngleDeg * DEG
  const a1 = Math.PI / 2 + halfAngleDeg * DEG
  const shape = new Shape()
  shape.moveTo(rOut * Math.cos(a0), rOut * Math.sin(a0))
  shape.absarc(0, 0, rOut, a0, a1, false)
  shape.lineTo(rIn * Math.cos(a1), rIn * Math.sin(a1))
  shape.absarc(0, 0, rIn, a1, a0, true)
  shape.closePath()
  return new ExtrudeGeometry(shape, { depth: x1 - x0, bevelEnabled: false, curveSegments: curve })
    .rotateY(Math.PI / 2)
    .translate(x0, 0, 0)
}

const tube = (points: Vec3[], radius: number, detail: BrakeDetail, tubular = 48) =>
  new TubeGeometry(new CatmullRomCurve3(points.map((p) => new Vector3(...p))), tubular, radius, Math.max(8, detail.radial / 6), false)

/* ------------------------------------------------------------------ */
/* Builders                                                             */
/* ------------------------------------------------------------------ */

function buildWheel(d: BrakeDetail) {
  const hw = TYRE.width / 2
  // Tyre cross-section (radius, axial), counter-clockwise.
  const section: Profile = [
    [TYRE.beadRadius, -hw + 0.02],
    [1.2, -hw],
    [1.38, -hw + 0.01],
    [1.48, -hw + 0.05],
    [1.53, -hw + 0.1],
    [TYRE.radius, -hw + 0.17],
    [TYRE.radius, hw - 0.17],
    [1.53, hw - 0.1],
    [1.48, hw - 0.05],
    [1.38, hw - 0.01],
    [1.2, hw],
    [TYRE.beadRadius, hw - 0.02],
    [TYRE.beadRadius, -hw + 0.02],
  ]
  const tyre = latheX(section, d.radial).translate(TYRE.x, 0, 0)

  // Tread blocks: two staggered rows, so the rolling (or the lock) is easy to see.
  const lugs: BufferGeometry[] = []
  const n = d.radial >= 72 ? 32 : 24
  for (let i = 0; i < n; i++) {
    for (const [row, x] of [
      [0, -0.17],
      [1, 0.17],
    ] as const) {
      const phi = ((i + row * 0.5) / n) * Math.PI * 2
      lugs.push(radialBox([0.28, 0.04, 0.17], TYRE.x + x, TYRE.radius + 0.004, phi))
    }
  }

  const rimFace: Profile = [
    [0.1, RIM.faceX - RIM.faceThickness / 2],
    [0.34, RIM.faceX - RIM.faceThickness / 2],
    [0.34, RIM.faceX + RIM.faceThickness / 2],
    [0.1, RIM.faceX + RIM.faceThickness / 2],
    [0.1, RIM.faceX - RIM.faceThickness / 2],
  ]
  const spokes = Array.from({ length: 5 }, (_, i) =>
    radialBox([RIM.faceThickness, 0.66, 0.15], RIM.faceX + 0.02, 0.64, (i / 5) * Math.PI * 2),
  )
  const lip = (x: number) => new TorusGeometry(RIM.radius + 0.02, 0.035, 8, d.radial).rotateY(Math.PI / 2).translate(x, 0, 0)
  const rim = merge([latheX(rimFace, d.radial), ...spokes, lip(RIM.inboardX), lip(RIM.outboardX)])
  const barrel = cylinderX(RIM.radius, RIM.inboardX, RIM.outboardX, d.radial, true)

  // A single paint mark on the inboard sidewall: one feature with no symmetry shows rotation unambiguously.
  const marker = radialBox([0.012, 0.16, 0.07], TYRE.x - hw - 0.002, 1.28, 0)
  return { tyre, tread: merge(lugs), rim, barrel, marker }
}

function buildHub(d: BrakeDetail) {
  const flange: Profile = [
    [0.12, HUB.flangeX - HUB.flangeHalf],
    [HUB.flangeRadius, HUB.flangeX - HUB.flangeHalf],
    [HUB.flangeRadius, HUB.flangeX + HUB.flangeHalf],
    [0.12, HUB.flangeX + HUB.flangeHalf],
    [0.12, HUB.flangeX - HUB.flangeHalf],
  ]
  const studs = Array.from({ length: 5 }, (_, i) => {
    const phi = (i / 5) * Math.PI * 2 + Math.PI / 5
    return cylinderX(0.026, HUB.flangeX - HUB.flangeHalf, RIM.faceX + 0.16, 12).translate(0, HUB.studRadius * Math.cos(phi), HUB.studRadius * Math.sin(phi))
  })
  const nuts = Array.from({ length: 5 }, (_, i) => {
    const phi = (i / 5) * Math.PI * 2 + Math.PI / 5
    return cylinderX(0.045, RIM.faceX + RIM.faceThickness / 2, RIM.faceX + 0.12, 6).translate(0, HUB.studRadius * Math.cos(phi), HUB.studRadius * Math.sin(phi))
  })
  // Rotating hub: flange, studs, wheel nuts, centre boss and the stub shaft through the bearing.
  const spin = merge([latheX(flange, d.radial), ...studs, ...nuts, cylinderX(0.14, HUB.flangeX, RIM.faceX + 0.1, d.radial / 2), cylinderX(0.13, HUB.knuckleInboardX + 0.1, HUB.flangeX, d.radial / 2)])
  // Stationary bearing carrier (part of the steering knuckle) and the arm that carries the caliper bracket.
  const knuckle = merge([
    cylinderX(0.2, -0.5, -0.24, d.radial / 2),
    // Arm up to the caliper bracket, built in the caliper frame then turned into place.
    new BoxGeometry(0.12, 0.34, 0.22).translate(-0.3, 0.27, 0).rotateX(CALIPER_FRAME_ROT_X),
  ])
  return { spin, knuckle }
}

function buildDisc(d: BrakeDetail) {
  const { innerRadius: ri, outerRadius: ro, plate } = DISC
  const ring = (x0: number, x1: number): Profile => [
    [ri, x0],
    [ro, x0],
    [ro, x1],
    [ri, x1],
    [ri, x0],
  ]
  const plates = [latheX(ring(DISC_FACE.inboard, DISC_FACE.inboard + plate), d.radial), latheX(ring(DISC_FACE.outboard - plate, DISC_FACE.outboard), d.radial)]
  const vaneCount = d.radial >= 72 ? 36 : 24
  const vanes = Array.from({ length: vaneCount }, (_, i) =>
    radialBox([2 * DISC.halfThickness - 2 * plate + 0.004, ro - ri - 0.04, 0.024], DISC.x, (ri + ro) / 2, (i / vaneCount) * Math.PI * 2),
  )
  // Hat: a short tube from the friction ring's inner edge out to the mounting face that sits on the hub flange.
  const hatFaceX = HUB.flangeX + HUB.flangeHalf
  const hat: Profile = [
    [ri - 0.05, DISC_FACE.inboard + 0.02],
    [ri, DISC_FACE.inboard + 0.02],
    [ri, hatFaceX + 0.04],
    [0.15, hatFaceX + 0.04],
    [0.15, hatFaceX],
    [ri - 0.05, hatFaceX],
    [ri - 0.05, DISC_FACE.inboard + 0.02],
  ]
  const body = merge([...plates, ...vanes, latheX(hat, d.radial)])

  // Curved-slot pattern on both faces (dark), so the disc's rotation is visible.
  const slots: BufferGeometry[] = []
  for (let i = 0; i < 6; i++) {
    const phi = (i / 6) * Math.PI * 2
    for (const x of [DISC_FACE.inboard - 0.003, DISC_FACE.outboard + 0.003]) slots.push(radialBox([0.008, 0.028, 0.2], x, 0.6, phi, 0.5))
  }
  // Conceptual heat glow: thin rings just proud of both friction faces.
  const glowRing = (x: number) => new RingGeometry(ri + 0.01, ro, d.radial, 1).rotateY(Math.PI / 2).translate(x, 0, 0)
  return { body, slots: merge(slots), glow: merge([glowRing(DISC_FACE.inboard - 0.006), glowRing(DISC_FACE.outboard + 0.006)]) }
}

function buildToneRing(d: BrakeDetail) {
  const { innerRadius: ri, outerRadius: ro, halfWidth: hw, x, teeth } = TONE_RING
  const band: Profile = [
    [0.13, x - hw],
    [ri, x - hw],
    [ri, x + hw],
    [0.13, x + hw],
    [0.13, x - hw],
  ]
  const toothList = Array.from({ length: teeth }, (_, i) => radialBox([2 * hw, ro - ri, 0.03], x, (ri + ro) / 2, (i / teeth) * Math.PI * 2))
  const ring = merge([latheX(band, d.radial), ...toothList])

  const beta = (SENSOR_ANGLE_DEG - 90) * DEG
  const sensorBody = merge([
    new CylinderGeometry(SENSOR.radius, SENSOR.radius, SENSOR.length, 16).translate(0, SENSOR.tipRadius + SENSOR.length / 2, 0),
    new BoxGeometry(0.1, 0.035, 0.16).translate(0, SENSOR.tipRadius + SENSOR.length - 0.06, 0),
  ])
    .rotateX(beta)
    .translate(SENSOR.x, 0, 0)
  const wire = tube(sensorWirePoints(), 0.014, d, 64)
  return { ring, sensorBody, wire, sensorTip: sensorPoint(SENSOR.tipRadius) }
}

function buildCaliper(d: BrakeDetail) {
  const c = CALIPER
  const backX = c.housingBackX
  const frontX = PAD_STACK.pistonFace - 0.012
  const boreR = c.pistonRadius + 0.006
  const boreBackX = backX + 0.025
  // Cylinder housing (radius, axial) around the caliper's own axis — moved out to the pad radius below.
  const housingProfile: Profile = [
    [0.001, backX],
    [c.housingRadius, backX],
    [c.housingRadius, frontX],
    [boreR, frontX],
    [boreR, boreBackX],
    [0.001, boreBackX],
    [0.001, backX],
  ]
  const housing = halfShellX(housingProfile, d.radial)
  const toPad = (g: BufferGeometry) => g.translate(0, c.centreRadius, 0)

  const span = PAD_STACK.fingerFace + c.fingerThickness - (backX + 0.04)
  const bridge = new BoxGeometry(span, c.bridgeOuterRadius - c.bridgeInnerRadius, 2 * c.bridgeHalfWidth).translate(
    backX + 0.04 + span / 2,
    (c.bridgeInnerRadius + c.bridgeOuterRadius) / 2,
    0,
  )
  const fingers = new BoxGeometry(c.fingerThickness, c.bridgeOuterRadius - 0.5, 2 * c.bridgeHalfWidth).translate(
    PAD_STACK.fingerFace + c.fingerThickness / 2,
    (0.5 + c.bridgeOuterRadius) / 2,
    0,
  )
  // Slide-pin bosses either side of the housing (the body floats on these pins).
  const pinBoss = (z: number) => cylinderX(0.05, backX + 0.03, frontX - 0.06, 16).translate(0, c.centreRadius + 0.04, z)
  const ears = (z: number) => new BoxGeometry(0.1, 0.12, 0.14).translate(backX + 0.12, c.centreRadius + 0.04, z * 0.82)
  const body = merge([bridge, fingers, pinBoss(0.3), pinBoss(-0.3), ears(0.3), ears(-0.3)])

  // Static carrier bracket: pad abutments either side of the pads, bolted to the knuckle.
  const abutX0 = backX + 0.02
  const abutX1 = PAD_STACK.outerBacking + 0.03
  const abutment = (z: number) => new BoxGeometry(abutX1 - abutX0, 0.26, 0.05).translate((abutX0 + abutX1) / 2, c.centreRadius, z)
  const pin = (z: number) => cylinderX(0.022, backX - 0.02, PAD_STACK.innerBacking, 12).translate(0, c.centreRadius + 0.04, z)
  const tieBar = new BoxGeometry(0.08, 0.16, 0.66).translate(abutX0 + 0.04, 0.4, 0)
  const carrier = merge([abutment(0.29), abutment(-0.29), tieBar, pin(0.3), pin(-0.3)])

  const piston = toPad(cylinderX(c.pistonRadius, PAD_STACK.pistonFace - PISTON_LENGTH, PAD_STACK.pistonFace, d.radial / 2))
  // Fluid behind the piston: a unit-length slug from x = 0 to 1, scaled per frame.
  const fluid = toPad(cylinderX(boreR - 0.004, 0, 1, d.radial / 2))

  const pad = (x0: number, x1: number, grow: number) => sectorPrismX(c.padInnerRadius - grow, c.padOuterRadius + grow, c.padHalfAngleDeg + grow * 30, x0, x1, d.curve)
  const innerFriction = pad(PAD_STACK.innerBacking, PAD_STACK.innerFriction, 0)
  const innerBacking = pad(PAD_STACK.pistonFace, PAD_STACK.innerBacking, 0.02)
  const outerFriction = pad(PAD_STACK.outerFriction, PAD_STACK.outerBacking, 0)
  const outerBacking = pad(PAD_STACK.outerBacking, PAD_STACK.fingerFace, 0.02)

  return {
    housing: toPad(housing.shell),
    housingSection: toPad(housing.section),
    body,
    carrier,
    piston,
    fluid,
    fluidBackX: boreBackX,
    innerFriction,
    innerBacking,
    outerFriction,
    outerBacking,
  }
}

function buildSchematic(d: BrakeDetail) {
  const y = AXIS_Y
  // Pedal arm: built around its pivot (the group sits at PEDAL.pivot and rotates about Z).
  const pedalArm = merge([
    new BoxGeometry(0.05, PEDAL.length + 0.06, 0.06).translate(0, -PEDAL.length / 2, 0),
    new BoxGeometry(0.045, 0.17, 0.26).translate(-0.04, -PEDAL.length, 0),
    new CylinderGeometry(0.05, 0.05, 0.12, 16).rotateX(Math.PI / 2),
    new CylinderGeometry(0.022, 0.022, 0.1, 12).rotateX(Math.PI / 2).translate(0, -PEDAL.pushrodPin, 0),
  ])
  const pedalBracket = new BoxGeometry(0.16, 0.12, 0.05).translate(0, 0.04, -0.07)

  const pushrod = cylinderX(0.018, 0, SERVO.x0 + 0.06, 12).translate(0, y, 0)
  const servo = merge([
    cylinderX(SERVO.radius, SERVO.x0 + 0.03, SERVO.x1 - 0.03, d.radial),
    new TorusGeometry(SERVO.radius - 0.03, 0.03, 8, d.radial).rotateY(Math.PI / 2).translate(SERVO.x0 + 0.03, 0, 0),
    new TorusGeometry(SERVO.radius - 0.03, 0.03, 8, d.radial).rotateY(Math.PI / 2).translate(SERVO.x1 - 0.03, 0, 0),
  ]).translate(0, y, 0)

  const bore = MASTER.pistonRadius + 0.004
  // Bore open towards the servo, closed at the outlet end, with a mounting flange (counter-clockwise).
  const mcProfile: Profile = [
    [bore, MASTER.x0],
    [MASTER.radius + 0.05, MASTER.x0],
    [MASTER.radius + 0.05, MASTER.x0 + 0.02],
    [MASTER.radius, MASTER.x0 + 0.02],
    [MASTER.radius, MASTER.x1 + 0.03],
    [0.001, MASTER.x1 + 0.03],
    [0.001, MASTER.x1],
    [bore, MASTER.x1],
    [bore, MASTER.x0],
  ]
  const mcShell = halfShellX(mcProfile, d.radial)
  const mcPiston = cylinderX(MASTER.pistonRadius, MASTER.x0 + 0.04, MASTER.x0 + 0.04 + MASTER.pistonLength, d.radial / 2).translate(0, y, 0)
  const mcFluid = cylinderX(MASTER.pistonRadius - 0.002, 0, 1, d.radial / 2).translate(0, y, 0)
  const reservoir = merge([
    new BoxGeometry(0.42, 0.16, 0.18).translate((MASTER.x0 + MASTER.x1) / 2 + 0.03, y + MASTER.radius + 0.12, -0.02),
    new CylinderGeometry(0.05, 0.05, 0.05, 16).translate((MASTER.x0 + MASTER.x1) / 2 + 0.03, y + MASTER.radius + 0.225, -0.02),
    new CylinderGeometry(0.025, 0.025, 0.06, 10).translate(MASTER.x0 + 0.2, y + MASTER.radius + 0.02, -0.02),
    new CylinderGeometry(0.025, 0.025, 0.06, 10).translate(MASTER.x1 - 0.12, y + MASTER.radius + 0.02, -0.02),
  ])

  const a = ABS_UNIT
  const absBlock = merge([
    new BoxGeometry(a.width, a.height, a.depth).translate(a.x, y, 0),
    cylinderX(0.08, a.x - 0.12, a.x + 0.12, 20).translate(0, y + a.height / 2 + 0.07, -0.04),
    new BoxGeometry(0.12, 0.08, 0.06).translate(a.x + 0.08, y - a.height / 2 - 0.02, -a.depth / 2 + 0.05),
  ])
  const lamp = (dx: number) => new CylinderGeometry(0.035, 0.035, 0.02, 16).rotateX(Math.PI / 2).translate(a.x + dx, y + 0.06, a.depth / 2 + 0.008)
  return {
    pedalArm,
    pedalBracket,
    pushrod,
    servo,
    mcShell: mcShell.shell.translate(0, y, 0),
    mcSection: mcShell.section.translate(0, y, 0),
    mcPiston,
    mcFluid,
    reservoir,
    absBlock,
    inletLamp: lamp(-0.09),
    outletLamp: lamp(0.09),
  }
}

function buildLines(d: BrakeDetail) {
  const { a, b } = brakeLinePoints()
  return {
    lineA: tube(a, 0.022, d, 8),
    lineB: tube(b, 0.022, d, 64),
    glowA: tube(a, 0.036, d, 8),
    glowB: tube(b, 0.036, d, 64),
  }
}

function buildRoad() {
  return {
    road: new PlaneGeometry(ROAD.width, ROAD.length).rotateX(-Math.PI / 2),
    dash: new BoxGeometry(0.1, 0.006, ROAD.dashLength),
    // Unit-length skid mark from z = 0 to z = 1, scaled per frame.
    skid: new PlaneGeometry(0.62, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5),
  }
}

export function buildBrakeGeometries(detail: BrakeDetail) {
  return {
    wheel: buildWheel(detail),
    hub: buildHub(detail),
    disc: buildDisc(detail),
    tone: buildToneRing(detail),
    caliper: buildCaliper(detail),
    schematic: buildSchematic(detail),
    lines: buildLines(detail),
    road: buildRoad(),
  }
}

export type BrakeGeometries = ReturnType<typeof buildBrakeGeometries>

/** Dispose every BufferGeometry in a (nested) geometry record. */
export function disposeAll(obj: unknown): void {
  if (obj instanceof BufferGeometry) obj.dispose()
  else if (obj && typeof obj === 'object') Object.values(obj).forEach(disposeAll)
}

/** Total triangle count (for the mobile budget test). */
export function triangleCount(obj: unknown): number {
  if (obj instanceof BufferGeometry) return (obj.index ? obj.index.count : obj.getAttribute('position').count) / 3
  if (obj && typeof obj === 'object') return Object.values(obj).reduce<number>((n, v) => n + triangleCount(v), 0)
  return 0
}
