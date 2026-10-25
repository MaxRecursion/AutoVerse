/**
 * Double-wishbone linkage kinematics — pure maths, no three.js.
 *
 * Front view of the front-left corner: x points outboard (to the viewer's
 * right), y up from the static ground, z forward (towards the viewer). All
 * points are in the BODY frame at static ride height, in metres; the whole
 * frame moves up and down with the body displacement z_s.
 *
 * The wishbones pivot about axes parallel to z, so every point on an arm
 * moves in its own x–y plane. Given the suspension travel s (wheel centre
 * height relative to the body, + = bump), we solve:
 *   1. the lower-arm angle α so the wheel centre rises by exactly s
 *      (bisection — the wheel-centre height is monotonic in α over the range);
 *   2. the upper ball joint as the intersection of the upper-arm circle
 *      about its inner pivot and the knuckle circle about the lower ball
 *      joint (the knuckle is rigid);
 *   3. the knuckle rotation from the new ball-joint line — the camber change;
 *   4. the coil-over length between its lower eye on the lower arm and the
 *      top mount on the body;
 *   5. the anti-roll bar arm angle that keeps the drop link at its length.
 * So the ball joints stay exactly on the knuckle and every link keeps its
 * length — the geometry closes at every pose.
 *
 * Hard points are illustrative (a short-long-arm layout typical of a car
 * front corner), not a real vehicle's.
 */

export interface Vec2 {
  x: number
  y: number
}

export type Vec3 = [number, number, number]

const v2 = (x: number, y: number): Vec2 => ({ x, y })
const sub = (a: Vec2, b: Vec2): Vec2 => v2(a.x - b.x, a.y - b.y)
const add = (a: Vec2, b: Vec2): Vec2 => v2(a.x + b.x, a.y + b.y)
const scale = (a: Vec2, k: number): Vec2 => v2(a.x * k, a.y * k)
export const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y)
export const dist3 = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

/** Rotate `p` about `c` by `a` radians, counter-clockwise seen from +z (three.js convention). */
export function rotateAbout(p: Vec2, c: Vec2, a: number): Vec2 {
  const d = sub(p, c)
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  return v2(c.x + d.x * cos - d.y * sin, c.y + d.x * sin + d.y * cos)
}

/** Intersection of circle (c0, r0) and circle (c1, r1) nearest to `hint`, or null when they do not meet. */
export function circleIntersection(c0: Vec2, r0: number, c1: Vec2, r1: number, hint: Vec2): Vec2 | null {
  const d = dist(c0, c1)
  if (d < 1e-12 || d > r0 + r1 || d < Math.abs(r0 - r1)) return null
  const a = (r0 * r0 - r1 * r1 + d * d) / (2 * d)
  const h = Math.sqrt(Math.max(0, r0 * r0 - a * a))
  const u = scale(sub(c1, c0), 1 / d)
  const m = add(c0, scale(u, a))
  const p1 = v2(m.x - u.y * h, m.y + u.x * h)
  const p2 = v2(m.x + u.y * h, m.y - u.x * h)
  return dist(p1, hint) <= dist(p2, hint) ? p1 : p2
}

/* ------------------------------------------------------------------ */
/* Hard points (body frame, static ride height)                         */
/* ------------------------------------------------------------------ */

export const TYRE = {
  /** Unloaded radius, m (205/55 R16-like). */
  freeRadius: 0.315,
  width: 0.205,
  rimRadius: 0.203,
} as const

export const HARDPOINTS = {
  /** Lower-arm inner pivot axis (front and rear bushes at ±z). */
  lowerInner: v2(0.2, 0.17),
  lowerInnerZ: 0.16,
  /** Upper-arm inner pivot axis. */
  upperInner: v2(0.32, 0.56),
  upperInnerZ: 0.14,
  lowerBallJoint: v2(0.585, 0.13),
  upperBallJoint: v2(0.53, 0.6),
  /** Wheel centre (x = wheel centre-plane). y is set from the static loaded radius at runtime. */
  wheelCentreX: 0.7,
  /** Hub mounting face (x). */
  hubFaceX: 0.735,
  /** Coil-over lower eye as a fraction along the lower arm (from inner pivot to ball joint). */
  coiloverLowerFraction: 0.6,
  /** Coil-over top mount under the turret. */
  topMount: v2(0.375, 0.82),
  /** Tie-rod joints (z behind the axle line: a rear-steer rack). */
  tieRodZ: -0.14,
  tieRodOuter: v2(0.565, 0.33),
  /** Anti-roll bar: axis along x at (y, z); arm length along +z to the drop-link top. */
  antiRollAxis: { y: 0.25, z: -0.3 },
  antiRollArm: 0.22,
  /** Drop-link lower end, as a fraction along the rear leg of the lower arm. */
  dropLinkFraction: 0.5,
} as const

/** Body-frame wheel centre at static ride height for a given static loaded radius. */
export const staticWheelCentre = (loadedRadius: number): Vec2 => v2(HARDPOINTS.wheelCentreX, loadedRadius)

/* ------------------------------------------------------------------ */
/* Derived constants                                                    */
/* ------------------------------------------------------------------ */

const LIP = HARDPOINTS.lowerInner
const UIP = HARDPOINTS.upperInner
const LBJ0 = HARDPOINTS.lowerBallJoint
const UBJ0 = HARDPOINTS.upperBallJoint
export const LOWER_ARM_LENGTH = dist(LBJ0, LIP)
export const UPPER_ARM_LENGTH = dist(UBJ0, UIP)
export const KNUCKLE_LENGTH = dist(UBJ0, LBJ0)
const KNUCKLE_ANGLE0 = Math.atan2(UBJ0.y - LBJ0.y, UBJ0.x - LBJ0.x)
const COILOVER_LOWER0 = add(LIP, scale(sub(LBJ0, LIP), HARDPOINTS.coiloverLowerFraction))

/** Rear leg of the lower wishbone: from its rear bush to the ball joint (3D). */
const lowerRearBush: Vec3 = [LIP.x, LIP.y, -HARDPOINTS.lowerInnerZ]
const dropLower0: Vec3 = [
  lowerRearBush[0] + (LBJ0.x - lowerRearBush[0]) * HARDPOINTS.dropLinkFraction,
  lowerRearBush[1] + (LBJ0.y - lowerRearBush[1]) * HARDPOINTS.dropLinkFraction,
  lowerRearBush[2] * (1 - HARDPOINTS.dropLinkFraction),
]
const ARB = HARDPOINTS.antiRollAxis
/** The bar arm sits along +z at rest, so the drop link stands vertically under it. */
const dropUpper0: Vec3 = [dropLower0[0], ARB.y, ARB.z + HARDPOINTS.antiRollArm]
export const DROP_LINK_LENGTH = dist3(dropLower0, dropUpper0)
export const DROP_LINK = { lower0: dropLower0, upper0: dropUpper0, x: dropLower0[0] } as const

/* ------------------------------------------------------------------ */
/* Solver                                                               */
/* ------------------------------------------------------------------ */

export interface LinkagePose {
  /** Suspension travel (m), + = bump. */
  travel: number
  /** Lower / upper arm rotation from static (rad, CCW seen from the front). */
  lowerArmAngle: number
  upperArmAngle: number
  /** Knuckle rotation from static (rad, CCW seen from the front: top of the wheel moves inboard). */
  knuckleAngle: number
  /** Camber change in degrees (− = top of the wheel leaning in). */
  camberChangeDeg: number
  lowerBallJoint: Vec2
  upperBallJoint: Vec2
  wheelCentre: Vec2
  /** Lateral shift of the wheel centre from static (m). */
  trackChange: number
  coiloverLower: Vec2
  coiloverLength: number
  /** Coil-over axis angle from vertical (rad, CCW seen from the front). */
  coiloverAngle: number
  tieRodOuter: Vec3
  tieRodInner: Vec3
  /** Anti-roll bar arm rotation about its axis (rad). */
  antiRollAngle: number
  dropLinkLower: Vec3
  dropLinkUpper: Vec3
}

/** Map a body-frame point fixed to the knuckle from its static place to its place at a solved pose. */
export function knucklePoint(p: Vec2, lbj: Vec2, knuckleAngle: number): Vec2 {
  return add(lbj, sub(rotateAbout(p, LBJ0, knuckleAngle), LBJ0))
}

interface ArmSolution {
  lbj: Vec2
  ubj: Vec2
  knuckleAngle: number
  wheelCentre: Vec2
}

function solveArms(alpha: number, wc0: Vec2): ArmSolution | null {
  const lbj = rotateAbout(LBJ0, LIP, alpha)
  const ubj = circleIntersection(UIP, UPPER_ARM_LENGTH, lbj, KNUCKLE_LENGTH, UBJ0)
  if (!ubj) return null
  const knuckleAngle = Math.atan2(ubj.y - lbj.y, ubj.x - lbj.x) - KNUCKLE_ANGLE0
  const wheelCentre = add(lbj, sub(rotateAbout(wc0, LBJ0, knuckleAngle), LBJ0))
  return { lbj, ubj, knuckleAngle, wheelCentre }
}

/** Centre of the circle through three points (null when they are collinear). */
export function circumcentre(a: Vec2, b: Vec2, c: Vec2): Vec2 | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y))
  if (Math.abs(d) < 1e-12) return null
  const a2 = a.x * a.x + a.y * a.y
  const b2 = b.x * b.x + b.y * b.y
  const c2 = c.x * c.x + c.y * c.y
  return v2((a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d, (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d)
}

/**
 * Inner tie-rod joint (rack end). It sits at the centre of the arc the outer
 * joint follows as the knuckle rises and falls, so the tie rod keeps its
 * length through the travel and the wheel does not steer itself over bumps
 * (minimal "bump steer"). The knuckle path does not depend on ride height,
 * so any reference wheel-centre height gives the same arc.
 */
export const TIE_ROD_INNER: Vec2 = (() => {
  const wc0 = staticWheelCentre(0.3)
  const outerAt = (alpha: number) => {
    const arms = solveArms(alpha, wc0)
    return arms ? knucklePoint(HARDPOINTS.tieRodOuter, arms.lbj, arms.knuckleAngle) : HARDPOINTS.tieRodOuter
  }
  return circumcentre(outerAt(-0.14), outerAt(0), outerAt(0.14)) ?? v2(0.28, HARDPOINTS.tieRodOuter.y)
})()

export const TIE_ROD_LENGTH = dist(TIE_ROD_INNER, HARDPOINTS.tieRodOuter)

/** Travel range the hard points are laid out for (m). */
export const TRAVEL_LIMIT = 0.11
const ALPHA_RANGE = 0.5

/** Anti-roll bar arm angle that keeps the drop link at its length (bisection, monotonic near rest). */
function solveAntiRoll(lower: Vec3): number {
  const at = (beta: number): Vec3 => [DROP_LINK.x, ARB.y + HARDPOINTS.antiRollArm * Math.sin(beta), ARB.z + HARDPOINTS.antiRollArm * Math.cos(beta)]
  const f = (beta: number) => dist3(at(beta), lower) - DROP_LINK_LENGTH
  let lo = -0.9
  let hi = 0.9
  // Bar end above the link's lower end: lifting the bar end lengthens the link, so f rises with beta.
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2
    if (f(mid) > 0) hi = mid
    else lo = mid
  }
  return (lo + hi) / 2
}

/**
 * Solve the corner for a suspension travel (clamped to ±TRAVEL_LIMIT).
 * `loadedRadius` sets the static wheel-centre height.
 */
export function solveLinkage(travel: number, loadedRadius: number): LinkagePose {
  const s = Math.max(-TRAVEL_LIMIT, Math.min(TRAVEL_LIMIT, Number.isFinite(travel) ? travel : 0))
  const wc0 = staticWheelCentre(loadedRadius)
  // Bisection on the lower-arm angle: wheel-centre height rises with alpha (CCW lifts the outer end).
  let lo = -ALPHA_RANGE
  let hi = ALPHA_RANGE
  for (let i = 0; i < 52; i++) {
    const mid = (lo + hi) / 2
    const sol = solveArms(mid, wc0)
    const rise = sol ? sol.wheelCentre.y - wc0.y : mid > 0 ? Infinity : -Infinity
    if (rise > s) hi = mid
    else lo = mid
  }
  const alpha = (lo + hi) / 2
  const arms = solveArms(alpha, wc0) ?? { lbj: LBJ0, ubj: UBJ0, knuckleAngle: 0, wheelCentre: wc0 }
  const upperArmAngle = Math.atan2(arms.ubj.y - UIP.y, arms.ubj.x - UIP.x) - Math.atan2(UBJ0.y - UIP.y, UBJ0.x - UIP.x)

  const coiloverLower = rotateAbout(COILOVER_LOWER0, LIP, alpha)
  const axis = sub(HARDPOINTS.topMount, coiloverLower)
  const coiloverLength = Math.hypot(axis.x, axis.y)
  // Angle of the axis from +y, CCW positive (three.js rotation.z that turns +y onto the axis).
  const coiloverAngle = Math.atan2(-axis.x, axis.y)

  const outer = knucklePoint(HARDPOINTS.tieRodOuter, arms.lbj, arms.knuckleAngle)
  const dl = rotateAbout(v2(dropLower0[0], dropLower0[1]), LIP, alpha)
  const dropLinkLower: Vec3 = [dl.x, dl.y, dropLower0[2]]
  const antiRollAngle = solveAntiRoll(dropLinkLower)
  const dropLinkUpper: Vec3 = [
    DROP_LINK.x,
    ARB.y + HARDPOINTS.antiRollArm * Math.sin(antiRollAngle),
    ARB.z + HARDPOINTS.antiRollArm * Math.cos(antiRollAngle),
  ]

  return {
    travel: s,
    lowerArmAngle: alpha,
    upperArmAngle,
    knuckleAngle: arms.knuckleAngle,
    camberChangeDeg: (-arms.knuckleAngle * 180) / Math.PI,
    lowerBallJoint: arms.lbj,
    upperBallJoint: arms.ubj,
    wheelCentre: arms.wheelCentre,
    trackChange: arms.wheelCentre.x - wc0.x,
    coiloverLower,
    coiloverLength,
    coiloverAngle,
    tieRodOuter: [outer.x, outer.y, HARDPOINTS.tieRodZ],
    tieRodInner: [TIE_ROD_INNER.x, TIE_ROD_INNER.y, HARDPOINTS.tieRodZ],
    antiRollAngle,
    dropLinkLower,
    dropLinkUpper,
  }
}

/** Coil-over length at rest (m). */
export const coiloverLengthAt = (travel: number, loadedRadius: number) => solveLinkage(travel, loadedRadius).coiloverLength

/** Motion ratio (coil-over travel per unit wheel travel) about a pose, by central difference. */
export function motionRatio(travel: number, loadedRadius: number, h = 1e-4): number {
  return (coiloverLengthAt(travel - h, loadedRadius) - coiloverLengthAt(travel + h, loadedRadius)) / (2 * h)
}
