/**
 * Pure geometry of the AutoVerse teaching engine — an original single-cylinder,
 * twin-cam (DOHC), two-valve cutaway — in scene units (1 unit = 100 mm).
 *
 * No three.js here: the 3D scene, the 2D SVG section and the unit tests all
 * read the same numbers, so the drawings agree with each other and with the
 * kinematics module. Coordinates are in the cylinder plane: `y` up the bore
 * from the crankshaft axis, `z` across it (intake side +z, exhaust side −z).
 * The 3D section plane is x = 0, with the cut-away half on +x.
 */
import {
  CRANK_RADIUS_MM,
  DECK_HEIGHT_MM,
  ENGINE_GEOMETRY,
  VALVE_TIMING,
  burnFraction,
  combustionIntensity,
  mod,
  normalisedVolume,
  valveLift,
  valveLiftFor,
  valvePeakAngle,
  type ValveId,
} from './kinematics'

export interface Vec2 {
  z: number
  y: number
}

const DEG = Math.PI / 180

/** Scene units per millimetre. */
export const MM = 0.01
/**
 * Valve lift is drawn 1.5× real size so it reads at lab zoom levels. The cam
 * lobes are generated with the same scale, so lobe contact stays exact.
 */
export const VALVE_LIFT_VISUAL_SCALE = 1.5

export const CRANK_R = CRANK_RADIUS_MM * MM
export const ROD_L = ENGINE_GEOMETRY.rodLengthMm * MM
export const BORE_R = (ENGINE_GEOMETRY.boreMm / 2) * MM
export const DECK_Y = DECK_HEIGHT_MM * MM
export const COMPRESSION_HEIGHT = ENGINE_GEOMETRY.compressionHeightMm * MM

export const PISTON = {
  radius: BORE_R - 0.006,
  /** Wrist-pin axis down to the bottom of the skirt. */
  skirtBelowPin: 0.27,
  /** Ring grooves, measured down from the crown. */
  ringDepths: [0.05, 0.09, 0.135] as const,
  pinRadius: 0.085,
  pinLength: 0.62,
}

/** Piston crown height (scene units) for a crank angle-derived pin height in mm. */
export const crownYFromPinMm = (pinHeightMm: number) => pinHeightMm * MM + COMPRESSION_HEIGHT

/* ------------------------------------------------------------------ */
/* Block and crankcase                                                  */
/* ------------------------------------------------------------------ */

export const BLOCK = {
  /** Half-width across the engine (z). */
  halfWidth: 0.74,
  /** Depth of the remaining (rear) half behind the section plane (x). */
  depth: 0.66,
  linerOuterR: 0.5,
  jacketOuterR: 0.58,
  /** Bottom of the cylinder liner / top of the crankcase. */
  linerBottomY: 0.88,
  /** Bottom of the coolant jacket. */
  jacketBottomY: DECK_Y - 0.75,
  crankcaseBottomY: -0.78,
  sumpBottomY: -0.96,
  sideWall: 0.06,
  rearWall: 0.1,
  mainBearingR: 0.125,
} as const

export const CRANK = {
  journalR: 0.11,
  pinR: 0.1,
  pinHalfLength: 0.075,
  webThickness: 0.07,
  /** Gap between the crank pin end and each web. */
  webInnerX: 0.09,
  counterweightR: 0.55,
  frontStubX: 0.45,
  rearStubX: -1.08,
} as const

export const FLYWHEEL = { x: -1.0, radius: 0.68, thickness: 0.08 } as const

/* ------------------------------------------------------------------ */
/* Cylinder head, valves and valvetrain                                 */
/* ------------------------------------------------------------------ */

export const VALVE_TILT_DEG = 16
const TILT = VALVE_TILT_DEG * DEG
/** Pent-roof chamber: each roof plane is perpendicular to its valve axis. */
export const ROOF_SLOPE = Math.tan(TILT)
/** Height of the chamber roof above the deck at a given z (zero outside the bore). */
export const roofHeight = (z: number) => Math.max(0, BORE_R - Math.abs(z)) * ROOF_SLOPE
export const ROOF_APEX = roofHeight(0)

export const HEAD = {
  halfWidth: 0.86,
  /** Rear slab (x ∈ [−depth, −frontLayer]) and sectioned front layer (x ∈ [−frontLayer, 0]). */
  depth: 0.62,
  frontLayer: 0.15,
  /** Height above the deck of the top of the head casting (behind the cams). */
  height: 1.46,
  /** Top of the sectioned front layer around the valve guides. */
  sectionTop: 0.8,
  /** Half-width of the spark-plug well in the section: thread bore, then the wider socket well. */
  plugWell: 0.075,
  plugSocket: 0.108,
  plugSocketY: 0.4,
} as const

/** Distances along a valve axis, measured from the valve face (s = 0). */
export const VALVE_S = {
  headThickness: 0.035,
  neckEnd: 0.11,
  springSeat: 0.45,
  /** Spring retainer / follower bottom at rest. */
  retainer: 0.8,
  followerTop: 0.95,
  stemTop: 0.93,
  rollerR: 0.04,
  camBaseR: 0.14,
} as const
/** Roller centre at rest, and cam centre, along the valve axis. */
export const ROLLER_REST_S = VALVE_S.followerTop + VALVE_S.rollerR
export const CAM_CENTRE_S = ROLLER_REST_S + VALVE_S.rollerR + VALVE_S.camBaseR

export interface ValveSpec {
  id: ValveId
  /** +1 intake side, −1 exhaust side. */
  side: 1 | -1
  /** Centre of the valve face on its seat (y from the crank axis). */
  seat: Vec2
  /** Unit vector up the stem. */
  axis: Vec2
  /** Unit vector along the roof, pointing away from the bore centre. */
  outward: Vec2
  /** Rotation about x (radians) that turns local +y onto `axis`. */
  rotationX: number
  headR: number
  stemR: number
  /** Port radius; the throat is slightly smaller than the valve head. */
  portR: number
  maxLift: number
}

function makeValve(id: ValveId, side: 1 | -1, seatZ: number, headR: number, portR: number): ValveSpec {
  const z = side * seatZ
  return {
    id,
    side,
    seat: { z, y: DECK_Y + roofHeight(z) },
    axis: { z: side * Math.sin(TILT), y: Math.cos(TILT) },
    outward: { z: side * Math.cos(TILT), y: -Math.sin(TILT) },
    rotationX: side * TILT,
    headR,
    stemR: 0.028,
    portR,
    maxLift: VALVE_TIMING[id].maxLiftMm * MM * VALVE_LIFT_VISUAL_SCALE,
  }
}

export const VALVES: Record<ValveId, ValveSpec> = {
  intake: makeValve('intake', 1, 0.215, 0.152, 0.13),
  exhaust: makeValve('exhaust', -1, 0.215, 0.135, 0.115),
}

/** Point `s` along a valve axis from its seat, plus an `offset` along the roof direction. */
export function alongValve(v: ValveSpec, s: number, offset = 0): Vec2 {
  return { z: v.seat.z + v.axis.z * s + v.outward.z * offset, y: v.seat.y + v.axis.y * s + v.outward.y * offset }
}

/** Drawn (visually scaled) valve lift in scene units. */
export const visualLift = (valve: ValveId, crankDeg: number) => valveLift(valve, crankDeg) * MM * VALVE_LIFT_VISUAL_SCALE

export const camCentre = (valve: ValveId) => alongValve(VALVES[valve], CAM_CENTRE_S)

/** Camshaft rotation (radians about x) phased so the lobe nose faces the follower at peak lift. */
export const camRotation = (valve: ValveId, crankDeg: number) => ((crankDeg - valvePeakAngle(VALVE_TIMING[valve])) / 2) * DEG

/**
 * Pitch radius of a lobe (distance cam centre → roller centre) at `phiDeg` cam
 * degrees from the nose. Symmetric about the nose.
 */
export function lobePitchRadius(valve: ValveId, phiDeg: number): number {
  const ev = VALVE_TIMING[valve]
  const lift = valveLiftFor(ev, valvePeakAngle(ev) + 2 * phiDeg) * MM * VALVE_LIFT_VISUAL_SCALE
  return VALVE_S.camBaseR + VALVE_S.rollerR + lift
}

/**
 * Cam lobe outline in the lobe's own plane (z, y relative to the cam centre),
 * nose pointing to −y (towards the follower) at zero rotation. It is the
 * inner offset of the roller-centre pitch curve by the roller radius, so a
 * roller follower riding on it moves by exactly the valve-lift profile.
 */
export function camLobeProfile(valve: ValveId, samples = 120): Vec2[] {
  const pitch = (phi: number): Vec2 => {
    const rp = lobePitchRadius(valve, phi)
    return { z: rp * Math.sin(phi * DEG), y: -rp * Math.cos(phi * DEG) }
  }
  const pts: Vec2[] = []
  const h = 0.25
  for (let i = 0; i < samples; i++) {
    const phi = -180 + (360 * i) / samples
    const p = pitch(phi)
    const a = pitch(phi - h)
    const b = pitch(phi + h)
    const tz = b.z - a.z
    const ty = b.y - a.y
    const len = Math.hypot(tz, ty) || 1
    let nz = ty / len
    let ny = -tz / len
    if (nz * p.z + ny * p.y < 0) {
      nz = -nz
      ny = -ny
    }
    pts.push({ z: p.z - VALVE_S.rollerR * nz, y: p.y - VALVE_S.rollerR * ny })
  }
  return pts
}

/* ------------------------------------------------------------------ */
/* Ports                                                                */
/* ------------------------------------------------------------------ */

export interface PortPath {
  centre: Vec2[]
  /** Unit normals pointing to the outer/lower wall side. */
  normals: Vec2[]
  /** Upper wall, nearer the chamber centre — the valve stem passes through it. */
  inner: Vec2[]
  /** Lower wall, on the side away from the bore centre (the inside of the bend). */
  outer: Vec2[]
}

const PORT_EXIT_Y = 0.36
const PORT_BEND = 0.2
/** The centre-line is drawn slightly past the side face, then every polyline is clipped to it. */
const PORT_OVERRUN = 0.12

/**
 * The lower wall is the inside of the bend; where the bend is tighter than the
 * port radius its offset curve would loop back. Keep only points that move
 * outwards so the wall stays a simple polyline.
 */
function monotonicOutwards(pts: Vec2[]): Vec2[] {
  const out: Vec2[] = []
  for (const p of pts) {
    const last = out[out.length - 1]
    if (!last || Math.abs(p.z) > Math.abs(last.z) + 1e-4) out.push(p)
  }
  return out
}

/** Truncate a polyline where it first crosses |z| = zMax (interpolating the last point). */
function clipToFace(pts: Vec2[], zMax: number): Vec2[] {
  const out: Vec2[] = []
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    if (Math.abs(p.z) <= zMax) {
      out.push(p)
      continue
    }
    const a = pts[i - 1]
    if (a) {
      const t = (zMax - Math.abs(a.z)) / (Math.abs(p.z) - Math.abs(a.z))
      out.push({ z: a.z + (p.z - a.z) * t, y: a.y + (p.y - a.y) * t })
    }
    break
  }
  return out
}

/**
 * Port centre-line: leaves the valve throat along the valve axis, then bends
 * outwards to exit the side of the head. Quadratic Bézier, sampled.
 */
export function portPath(valve: ValveId, samples = 20): PortPath {
  const v = VALVES[valve]
  const p0 = v.seat
  const p1 = alongValve(v, PORT_BEND)
  const p2: Vec2 = { z: v.side * (HEAD.halfWidth + PORT_OVERRUN), y: DECK_Y + PORT_EXIT_Y }
  const centre: Vec2[] = []
  const normals: Vec2[] = []
  for (let i = 0; i <= samples; i++) {
    const t = i / samples
    const u = 1 - t
    centre.push({ z: u * u * p0.z + 2 * u * t * p1.z + t * t * p2.z, y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y })
    const dz = 2 * u * (p1.z - p0.z) + 2 * t * (p2.z - p1.z)
    const dy = 2 * u * (p1.y - p0.y) + 2 * t * (p2.y - p1.y)
    const len = Math.hypot(dz, dy) || 1
    // Rotate the tangent towards the outside of the bend (away from the bore centre).
    normals.push({ z: (v.side * dy) / len, y: (-v.side * dz) / len })
  }
  const offset = (k: number) => centre.map((c, i) => ({ z: c.z + normals[i].z * k, y: c.y + normals[i].y * k }))
  const clippedCentre = clipToFace(centre, HEAD.halfWidth)
  return {
    centre: clippedCentre,
    normals: normals.slice(0, clippedCentre.length),
    inner: clipToFace(offset(-v.portR), HEAD.halfWidth),
    outer: clipToFace(monotonicOutwards(offset(v.portR)), HEAD.halfWidth),
  }
}

/* ------------------------------------------------------------------ */
/* Head section polygons                                                */
/* ------------------------------------------------------------------ */

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Mirror helper so the exhaust side is built from the same recipe. */
const sideZ = (side: 1 | -1, z: number) => side * z

/**
 * Head cross-section pieces of the front (sectioned) layer, as closed
 * polygons in (z, y). Cavities — chamber, ports, spring pockets and the plug
 * well — are the gaps between pieces, so the moving parts are visible.
 */
export function headSectionPieces(): Vec2[][] {
  const pieces: Vec2[][] = []
  for (const valve of ['intake', 'exhaust'] as const) {
    const v = VALVES[valve]
    const s = v.side
    const port = portPath(valve)
    const top = DECK_Y + HEAD.sectionTop
    const wellZ = sideZ(s, HEAD.plugWell)

    // Lower wedge: deck, side face below the port, outer port wall, roof edge.
    const outerRev = [...port.outer].reverse()
    pieces.push([
      { z: sideZ(s, BORE_R), y: DECK_Y },
      { z: sideZ(s, HEAD.halfWidth), y: DECK_Y },
      ...outerRev,
    ])

    // Upper piece around the valve guide: plug well, spring pocket, side face, inner port wall.
    const pocketHalf = 0.145
    const pocketInnerBottom = alongValve(v, VALVE_S.springSeat, -pocketHalf)
    const pocketOuterBottom = alongValve(v, VALVE_S.springSeat, pocketHalf)
    const pocketInnerTop = alongValve(v, (top - pocketInnerBottom.y) / v.axis.y + VALVE_S.springSeat, -pocketHalf)
    const pocketOuterTop = alongValve(v, (top - pocketOuterBottom.y) / v.axis.y + VALVE_S.springSeat, pocketHalf)
    const inner = port.inner
    const socketZ = sideZ(s, HEAD.plugSocket)
    pieces.push([
      { z: wellZ, y: DECK_Y + roofHeight(HEAD.plugWell) },
      { z: wellZ, y: DECK_Y + HEAD.plugSocketY },
      { z: socketZ, y: DECK_Y + HEAD.plugSocketY },
      { z: socketZ, y: top },
      { z: pocketInnerTop.z, y: top },
      pocketInnerBottom,
      pocketOuterBottom,
      { z: pocketOuterTop.z, y: top },
      { z: sideZ(s, HEAD.halfWidth), y: top },
      ...[...inner].reverse(),
    ])
  }
  return pieces
}

/** Outline of the rear head casting (with the chamber recess), in (z, y). */
export function headRearOutline(withChamber: boolean): Vec2[] {
  const w = HEAD.halfWidth
  const top = DECK_Y + HEAD.height
  const pts: Vec2[] = [{ z: -w, y: DECK_Y }]
  if (withChamber) pts.push({ z: -BORE_R, y: DECK_Y }, { z: 0, y: DECK_Y + ROOF_APEX }, { z: BORE_R, y: DECK_Y })
  pts.push({ z: w, y: DECK_Y }, { z: w, y: top - 0.42 }, { z: w - 0.2, y: top }, { z: -w + 0.2, y: top }, { z: -w, y: top - 0.42 })
  return pts
}

/* ------------------------------------------------------------------ */
/* Spark plug                                                           */
/* ------------------------------------------------------------------ */

/** Spark plug stack along the cylinder axis (y above the deck → radius). */
export const SPARK_PLUG = {
  tipY: DECK_Y + ROOF_APEX - 0.035,
  threadBottomY: DECK_Y + ROOF_APEX,
  threadTopY: DECK_Y + 0.42,
  hexTopY: DECK_Y + 0.54,
  insulatorTopY: DECK_Y + 0.98,
  terminalTopY: DECK_Y + 1.06,
  threadR: 0.06,
  hexR: 0.092,
  insulatorR: 0.052,
} as const

/** Point between the electrodes, where the spark jumps. */
export const SPARK_GAP: Vec2 = { z: 0, y: SPARK_PLUG.tipY - 0.012 }

/* ------------------------------------------------------------------ */
/* Timing belt                                                          */
/* ------------------------------------------------------------------ */

export const TIMING = {
  x: -0.82,
  crankSprocketR: 0.15,
  /** Twice the crank sprocket: the camshafts turn once per two crank turns. */
  camPulleyR: 0.3,
  beltWidth: 0.1,
  beltThickness: 0.025,
} as const

export interface Circle2 {
  c: Vec2
  r: number
}

/**
 * Closed path of a belt wrapped around the outside of convex-placed circles
 * (counter-clockwise in z–y). Returns sampled points.
 */
export function beltPath(circles: Circle2[], arcSamples = 16): Vec2[] {
  const cz = circles.reduce((a, k) => a + k.c.z, 0) / circles.length
  const cy = circles.reduce((a, k) => a + k.c.y, 0) / circles.length
  const ordered = [...circles].sort((a, b) => Math.atan2(a.c.y - cy, a.c.z - cz) - Math.atan2(b.c.y - cy, b.c.z - cz))
  const n = ordered.length
  // Outward normal angle of the external tangent leaving circle i towards circle i+1.
  const tangentAngle: number[] = []
  for (let i = 0; i < n; i++) {
    const a = ordered[i]
    const b = ordered[(i + 1) % n]
    const dz = b.c.z - a.c.z
    const dy = b.c.y - a.c.y
    const d = Math.hypot(dz, dy)
    const beta = Math.atan2(dy, dz)
    const psi = Math.acos(Math.max(-1, Math.min(1, (a.r - b.r) / d)))
    tangentAngle.push(beta - psi)
  }
  const pts: Vec2[] = []
  for (let i = 0; i < n; i++) {
    const k = ordered[i]
    const start = tangentAngle[(i - 1 + n) % n]
    let end = tangentAngle[i]
    while (end < start) end += 2 * Math.PI
    for (let j = 0; j <= arcSamples; j++) {
      const ang = start + ((end - start) * j) / arcSamples
      pts.push({ z: k.c.z + k.r * Math.cos(ang), y: k.c.y + k.r * Math.sin(ang) })
    }
  }
  return pts
}

export function timingBeltPath(arcSamples = 16): Vec2[] {
  return beltPath(
    [
      { c: { z: 0, y: 0 }, r: TIMING.crankSprocketR },
      { c: camCentre('intake'), r: TIMING.camPulleyR },
      { c: camCentre('exhaust'), r: TIMING.camPulleyR },
    ],
    arcSamples,
  )
}

export interface LoopSample {
  point: Vec2
  /** Unit tangent in the direction of increasing arc length. */
  tangent: Vec2
}

export interface LoopSampler {
  /** Total length of the closed loop (scene units). */
  length: number
  /** Point and tangent at arc length `s` (wrapped onto the loop). */
  at: (s: number) => LoopSample
}

/** Arc-length parametrisation of a closed polyline. */
export function loopSampler(path: Vec2[]): LoopSampler {
  const n = path.length
  const cumulative = [0]
  for (let i = 0; i < n; i++) {
    const a = path[i]
    const b = path[(i + 1) % n]
    cumulative.push(cumulative[i] + Math.hypot(b.z - a.z, b.y - a.y))
  }
  const length = cumulative[n]
  return {
    length,
    at: (s) => {
      const target = mod(s, length)
      let lo = 0
      let hi = n
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1
        if (cumulative[mid] <= target) lo = mid
        else hi = mid
      }
      const a = path[lo]
      const b = path[(lo + 1) % n]
      const seg = cumulative[lo + 1] - cumulative[lo] || 1
      const t = (target - cumulative[lo]) / seg
      return {
        point: { z: a.z + (b.z - a.z) * t, y: a.y + (b.y - a.y) * t },
        tangent: { z: (b.z - a.z) / seg, y: (b.y - a.y) / seg },
      }
    },
  }
}

/**
 * Distance the belt surface has travelled (scene units, along the loop's
 * counter-clockwise order) after `crankDeg` of crank rotation: the crank
 * sprocket's radius times the angle. The crank turns clockwise in the z–y
 * plane (pin from +y towards +z), so the belt runs against the path order.
 * Over one 720° cycle this equals one full turn of a cam pulley.
 */
export const beltTravel = (crankDeg: number) => -TIMING.crankSprocketR * crankDeg * DEG

/* ------------------------------------------------------------------ */
/* Connecting rod                                                       */
/* ------------------------------------------------------------------ */

/** Wrist-pin and crank-pin centres (scene units) — the rod always spans exactly these two points. */
export function rodEnds(pinHeightMm: number, crankPin: { y: number; z: number }) {
  return { small: { z: 0, y: pinHeightMm * MM }, big: { z: crankPin.z * MM, y: crankPin.y * MM } }
}

/* ------------------------------------------------------------------ */
/* Conceptual gas colours                                               */
/* ------------------------------------------------------------------ */

export type RGB = readonly [number, number, number]

const hex = (h: number): RGB => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255]
export const GAS_COLOURS = {
  fresh: hex(0x38d7f2),
  compressed: hex(0xc4f3ff),
  burning: hex(0xf6a63a),
  burnt: hex(0x8a93a0),
} as const

const mix = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

export interface GasAppearance {
  color: RGB
  opacity: number
  /** 0 … ~1.6 emissive strength (combustion glow + spark). */
  glow: number
}

const V_IVC = normalisedVolume(VALVE_TIMING.intake.closes)
const V_MIN = normalisedVolume(360)
/** 0 at intake-valve closing … 1 at firing TDC. */
const compressionLevel = (t: number) => Math.min(1, Math.max(0, (V_IVC - normalisedVolume(t)) / (V_IVC - V_MIN)))

/**
 * CONCEPTUAL colour of the cylinder contents — fresh charge (cyan),
 * compressed (paler), burning (amber glow), burnt / exhaust (grey). Purely a
 * teaching aid; it is continuous all the way round the cycle.
 */
export function gasAppearance(crankDeg: number): GasAppearance {
  const t = mod(Math.round(crankDeg * 1e6) / 1e6, 720)
  const ivc = VALVE_TIMING.intake.closes
  if (t < ivc) {
    const fill = smooth(0, 90, t)
    return { color: mix(GAS_COLOURS.burnt, GAS_COLOURS.fresh, fill), opacity: 0.22 + 0.08 * smooth(0, 180, t), glow: 0.04 * fill }
  }
  const f = compressionLevel(t)
  const compressed = mix(GAS_COLOURS.fresh, GAS_COLOURS.compressed, f)
  const compressedOpacity = 0.3 + 0.14 * f
  if (t >= 540) return { color: GAS_COLOURS.burnt, opacity: 0.22, glow: 0 }
  const burn = burnFraction(t)
  const c = combustionIntensity(t)
  const cooled = smooth(420, 540, t)
  const hot = mix(compressed, GAS_COLOURS.burning, burn)
  return {
    color: mix(hot, GAS_COLOURS.burnt, cooled),
    opacity: lerp(compressedOpacity + 0.34 * c, 0.22, cooled),
    glow: lerp(0.04 + 0.2 * f, 0, Math.max(burn, cooled)) + 1.5 * c,
  }
}

/** Conceptual flow tint in a port: visible while its valve is open. */
export function portGasAppearance(valve: ValveId, crankDeg: number): GasAppearance {
  const open = valveLift(valve, crankDeg) / VALVE_TIMING[valve].maxLiftMm
  if (valve === 'intake') return { color: GAS_COLOURS.fresh, opacity: 0.4 * open, glow: 0.15 * open }
  // Exhaust leaves hot at blow-down and cools towards the end of the stroke.
  const t = mod(crankDeg, 720)
  const cooling = t >= VALVE_TIMING.exhaust.opens ? smooth(VALVE_TIMING.exhaust.opens, 640, t) : 1
  return { color: mix(GAS_COLOURS.burning, GAS_COLOURS.burnt, cooling), opacity: 0.42 * open, glow: 0.6 * open * (1 - cooling) }
}
