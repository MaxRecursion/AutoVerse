/**
 * 2D drawings of the suspension (pure — SVG coordinates only):
 * - the FRONT VIEW of the double-wishbone corner at true scale, built from the
 *   same solved linkage as the 3D scene;
 * - the QUARTER-CAR SCHEMATIC — body mass, wheel mass, spring, damper and
 *   tyre spring over the scrolling road profile — with displacements drawn
 *   1.5× so small movements stay readable.
 * Used for the no-WebGL fallback and the "Model" tab.
 */
import { HARDPOINTS, TIE_ROD_INNER, TYRE, knucklePoint, type Vec2 } from './linkage'
import { roadHeightAt, staticTyreDeflection, BASE_PARAMS } from './quarterCar'
import { COILOVER, LOADED_RADIUS, coiloverState, type SuspensionFrame } from './suspensionModel'

export type Pt = [number, number]

/* ------------------------------------------------------------------ */
/* Shared                                                               */
/* ------------------------------------------------------------------ */

/**
 * Zig-zag spring from (x, y0) to (x, y1) with `coils` full coils of half-width
 * `w`; short straight ends so it seats cleanly. Returns an SVG path.
 */
export function zigzag(x: number, y0: number, y1: number, coils: number, w: number): string {
  const end = (y1 - y0) * 0.08
  const a = y0 + end
  const b = y1 - end
  const n = Math.max(1, Math.round(coils * 2))
  let d = `M${x.toFixed(1)} ${y0.toFixed(1)}L${x.toFixed(1)} ${a.toFixed(1)}`
  for (let i = 0; i < n; i++) {
    const y = a + ((b - a) * (i + 0.5)) / n
    d += `L${(x + (i % 2 === 0 ? w : -w)).toFixed(1)} ${y.toFixed(1)}`
  }
  d += `L${x.toFixed(1)} ${b.toFixed(1)}L${x.toFixed(1)} ${y1.toFixed(1)}`
  return d
}

const fmt = (p: Pt) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`
export const points = (pts: Pt[]) => pts.map(fmt).join(' ')

/* ------------------------------------------------------------------ */
/* Front view (true scale)                                              */
/* ------------------------------------------------------------------ */

export const FRONT = {
  /** px per metre. */
  scale: 280,
  x0: -0.14,
  y1: 0.98,
  width: 300,
  height: 320,
} as const

export const frontSvg = (x: number, y: number): Pt => [(x - FRONT.x0) * FRONT.scale, (FRONT.y1 - y) * FRONT.scale]

export interface FrontView {
  roadY: number
  /** Body-side rectangles (subframe, tower, bracket, turret), already moved with the body. */
  chassis: { x: number; y: number; w: number; h: number }[]
  lowerArm: [Pt, Pt]
  upperArm: [Pt, Pt]
  knuckle: Pt[]
  tieRod: [Pt, Pt]
  dropLink: [Pt, Pt]
  ballJoints: Pt[]
  tyre: Pt[]
  rim: Pt[]
  wheelCentre: Pt
  damperBody: [Pt, Pt]
  damperRod: [Pt, Pt]
  bumpStop: [Pt, Pt]
  /** Zig-zag drawn up from (0, 0) to (0, −length): place it with translate(from) rotate(angleDeg). */
  spring: { from: Pt; to: Pt; angleDeg: number; path: string }
  /** Static body reference line (y, px) — the turret top at ride height. */
  rideHeightY: number
  /** Tyre-load bar under the tyre: centre x, width (px) — 0 when airborne. */
  load: { x: number; y: number; width: number }
}

const LIP = HARDPOINTS.lowerInner
const UIP = HARDPOINTS.upperInner
const TURRET_Y = HARDPOINTS.topMount.y + 0.04

function rotateRect(c: Vec2, halfW: number, halfH: number, angle: number): Vec2[] {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return [
    [-halfW, -halfH],
    [halfW, -halfH],
    [halfW, halfH],
    [-halfW, halfH],
  ].map(([dx, dy]) => ({ x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos }))
}

export function frontView(f: SuspensionFrame): FrontView {
  const b = f.pose.body
  const P = (p: Vec2): Pt => frontSvg(p.x, p.y + b)
  const { link } = f
  const k = (p: Vec2) => knucklePoint(p, link.lowerBallJoint, link.knuckleAngle)
  const wc = link.wheelCentre
  const rect = (x0: number, x1: number, y0: number, y1: number) => {
    const [sx, sy] = frontSvg(x0, y1 + b)
    return { x: sx, y: sy, w: (x1 - x0) * FRONT.scale, h: (y1 - y0) * FRONT.scale }
  }
  const angle = link.knuckleAngle
  // Coil-over along its axis from the lower eye.
  const c = coiloverState(link)
  const u = { x: -Math.sin(link.coiloverAngle), y: Math.cos(link.coiloverAngle) }
  const along = (s: number): Vec2 => ({ x: link.coiloverLower.x + u.x * s, y: link.coiloverLower.y + u.y * s })
  const springFrom = P(along(COILOVER.lowerSeat))
  const springTo = P(along(c.length - COILOVER.upperSeatGap))
  // The zig-zag is drawn vertical, then rotated by the coil-over angle around its lower end in the SVG.
  const springLen = Math.hypot(springTo[0] - springFrom[0], springTo[1] - springFrom[1])
  const wcStatic = { x: HARDPOINTS.wheelCentreX, y: LOADED_RADIUS }
  const knuckleStatic = [
    HARDPOINTS.lowerBallJoint,
    { x: wcStatic.x - 0.07, y: wcStatic.y },
    { x: HARDPOINTS.hubFaceX, y: wcStatic.y },
    { x: wcStatic.x - 0.07, y: wcStatic.y },
    HARDPOINTS.upperBallJoint,
  ]
  const tyreBottom = wc.y + b - TYRE.freeRadius
  return {
    roadY: frontSvg(0, f.pose.roadZ)[1],
    chassis: [
      rect(FRONT.x0, LIP.x - 0.03, LIP.y - 0.035, LIP.y + 0.035),
      rect(LIP.x - 0.01, LIP.x + 0.06, LIP.y + 0.035, TURRET_Y),
      rect(LIP.x + 0.04, UIP.x - 0.01, UIP.y - 0.035, UIP.y + 0.035),
      rect(LIP.x - 0.01, HARDPOINTS.topMount.x + 0.12, TURRET_Y, TURRET_Y + 0.025),
      rect(FRONT.x0, LIP.x - 0.01, TURRET_Y - 0.07, TURRET_Y),
    ],
    lowerArm: [P(LIP), P(link.lowerBallJoint)],
    upperArm: [P(UIP), P(link.upperBallJoint)],
    knuckle: knuckleStatic.map((p) => P(k(p))),
    tieRod: [P(TIE_ROD_INNER), P({ x: link.tieRodOuter[0], y: link.tieRodOuter[1] })],
    dropLink: [P({ x: link.dropLinkLower[0], y: link.dropLinkLower[1] }), P({ x: link.dropLinkUpper[0], y: link.dropLinkUpper[1] })],
    ballJoints: [P(link.lowerBallJoint), P(link.upperBallJoint)],
    tyre: rotateRect(wc, TYRE.width / 2, TYRE.freeRadius, angle).map(P),
    rim: rotateRect(wc, TYRE.width / 2 - 0.012, TYRE.rimRadius, angle).map(P),
    wheelCentre: P(wc),
    damperBody: [P(along(0)), P(along(COILOVER.tubeLength))],
    damperRod: [P(along(c.length - COILOVER.rodLength)), P(along(c.length))],
    bumpStop: [P(along(c.length - c.bumpStopLength)), P(along(c.length))],
    spring: {
      from: springFrom,
      to: springTo,
      angleDeg: (Math.atan2(springTo[0] - springFrom[0], springFrom[1] - springTo[1]) * 180) / Math.PI,
      path: zigzag(0, 0, -springLen, COILOVER.turns - 2 * COILOVER.deadTurns, COILOVER.coilRadius * FRONT.scale),
    },
    rideHeightY: frontSvg(0, TURRET_Y + 0.025)[1],
    load: {
      x: frontSvg(wc.x, 0)[0],
      y: frontSvg(0, Math.max(f.pose.roadZ, tyreBottom))[1],
      width: f.pose.contact ? Math.min(2.5, f.pose.loadFactor) * 0.4 * TYRE.width * FRONT.scale : 0,
    },
  }
}

/* ------------------------------------------------------------------ */
/* Quarter-car schematic                                                */
/* ------------------------------------------------------------------ */

export const SCHEMATIC = {
  width: 220,
  height: 330,
  /** px per metre, vertical. */
  scale: 270,
  /** Displacement exaggeration. */
  exaggeration: 1.5,
  /** SVG y of the road datum. */
  datumY: 300,
  /** Horizontal px per metre of road (side view). */
  roadScale: 64,
  /** Static centres of the wheel and body boxes, m above the datum. */
  wheel0: 0.25,
  body0: 0.84,
  wheelBox: { w: 0.24, h: 0.07 },
  bodyBox: { w: 0.5, h: 0.12 },
  /** Damper: cylinder height and rod length (schematic m). */
  damper: { cylinder: 0.3, rod: 0.345 },
  cx: 110,
} as const

export const schematicY = (m: number) => SCHEMATIC.datumY - m * SCHEMATIC.scale

export interface Schematic {
  road: string
  roadFill: string
  body: { x: number; y: number; w: number; h: number }
  wheel: { x: number; y: number; w: number; h: number }
  bodyRestY: number
  wheelRestY: number
  spring: string
  damperCylinder: { x: number; y: number; w: number; h: number }
  damperRod: [Pt, Pt]
  piston: [Pt, Pt]
  tyreSpring: string
  /** Bottom of the tyre spring and whether it touches the road. */
  contact: { x: number; y: number; touching: boolean }
}

export function schematic(f: SuspensionFrame): Schematic {
  const S = SCHEMATIC
  const E = S.exaggeration
  const zs = f.pose.body * E
  const zu = f.pose.wheel * E
  const wheelC = S.wheel0 + zu
  const bodyC = S.body0 + zs
  const wheelTop = wheelC + S.wheelBox.h / 2
  const wheelBottom = wheelC - S.wheelBox.h / 2
  const bodyBottom = bodyC - S.bodyBox.h / 2
  const cx = S.cx

  // Road profile in side view: ahead of the tyre is to the right.
  const halfSpan = S.width / 2 / S.roadScale
  const pts: Pt[] = []
  const N = 64
  for (let i = 0; i <= N; i++) {
    const z = -halfSpan + (2 * halfSpan * i) / N
    pts.push([cx + z * S.roadScale, schematicY(roadHeightAt(f.road, f.distance + z) * E)])
  }
  const road = `M${pts.map(fmt).join('L')}`
  const roadFill = `${road}L${S.width} ${S.height}L0 ${S.height}Z`

  // Tyre spring: free length = static length + static squash; it can only push, so it lifts off the road.
  const staticSquash = staticTyreDeflection(BASE_PARAMS) * E
  const freeBottom = wheelBottom - (S.wheel0 - S.wheelBox.h / 2) - staticSquash
  const roadHere = f.pose.roadZ * E
  const touching = f.pose.contact
  const tyreBottom = touching ? roadHere : Math.max(roadHere, freeBottom)

  const box = (c: number, w: number, h: number) => ({ x: cx - (w * S.scale) / 2, y: schematicY(c + h / 2), w: w * S.scale, h: h * S.scale })
  const springX = cx - 0.07 * S.scale
  const damperX = cx + 0.07 * S.scale
  const pistonY = bodyBottom - S.damper.rod
  return {
    road,
    roadFill,
    body: box(bodyC, S.bodyBox.w, S.bodyBox.h),
    wheel: box(wheelC, S.wheelBox.w, S.wheelBox.h),
    bodyRestY: schematicY(S.body0),
    wheelRestY: schematicY(S.wheel0),
    spring: zigzag(springX, schematicY(wheelTop), schematicY(bodyBottom), 5, 9),
    damperCylinder: { x: damperX - 9, y: schematicY(wheelTop + S.damper.cylinder), w: 18, h: S.damper.cylinder * S.scale },
    damperRod: [
      [damperX, schematicY(bodyBottom)],
      [damperX, schematicY(pistonY)],
    ],
    piston: [
      [damperX - 7, schematicY(pistonY)],
      [damperX + 7, schematicY(pistonY)],
    ],
    tyreSpring: zigzag(cx, schematicY(wheelBottom), schematicY(tyreBottom), 3, 7),
    contact: { x: cx, y: schematicY(tyreBottom), touching },
  }
}
