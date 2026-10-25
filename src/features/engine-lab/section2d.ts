/**
 * Pure drawing geometry for the 2D engine cross-section (SVG). Everything is
 * derived from engineModel.ts — the same numbers as the 3D cutaway — so the
 * two views always agree.
 *
 * SVG space: X = −z, Y = −y, in millimetres (scene units × 100). The view is
 * from the cut-away (+x) side like the 3D camera, so the intake side (+z)
 * appears on the left and the exhaust on the right.
 */
import {
  BLOCK,
  BORE_R,
  COMPRESSION_HEIGHT,
  CRANK,
  CRANK_R,
  DECK_Y,
  FLYWHEEL,
  HEAD,
  PISTON,
  ROOF_APEX,
  SPARK_PLUG,
  VALVES,
  VALVE_S,
  alongValve,
  camCentre,
  camLobeProfile,
  camRotation,
  headRearOutline,
  headSectionPieces,
  portPath,
  rodEnds,
  timingBeltPath,
  type Vec2,
} from './engineModel'
import type { ValveId } from './kinematics'

/** SVG units per scene unit. */
export const SVG_SCALE = 100

export const toSvg = (p: Vec2): [number, number] => [-p.z * SVG_SCALE, -p.y * SVG_SCALE]

const r1 = (v: number) => Math.round(v * 10) / 10

/** SVG `points` attribute for a polygon / polyline. */
export const points = (pts: Vec2[]) =>
  pts
    .map((p) => {
      const [x, y] = toSvg(p)
      return `${r1(x)},${r1(y)}`
    })
    .join(' ')

/** Fixed viewBox that frames the whole section (sump to cam covers). */
export const SECTION_VIEWBOX = (() => {
  const top = -(DECK_Y + HEAD.height) * SVG_SCALE - 12
  const bottom = -BLOCK.sumpBottomY * SVG_SCALE + 8
  const half = Math.max(HEAD.halfWidth, FLYWHEEL.radius) * SVG_SCALE + 14
  return { x: -half, y: top, width: half * 2, height: bottom - top }
})()

const rect = (z0: number, z1: number, y0: number, y1: number): Vec2[] => [
  { z: z0, y: y0 },
  { z: z1, y: y0 },
  { z: z1, y: y1 },
  { z: z0, y: y1 },
]

const circle = (c: Vec2, r: number, n = 28): Vec2[] =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2
    return { z: c.z + r * Math.cos(a), y: c.y + r * Math.sin(a) }
  })

/* ------------------------------------------------------------------ */
/* Static drawing                                                       */
/* ------------------------------------------------------------------ */

export interface StaticSection {
  /** Sectioned block walls (hatched). */
  block: Vec2[][]
  /** Cylinder liner walls (hatched). */
  liner: Vec2[][]
  /** Coolant jacket spaces. */
  coolant: Vec2[][]
  /** Sump pan outline (open polyline) and oil level. */
  sump: { pan: Vec2[]; oil: Vec2[] }
  /** Rear head casting seen behind the section plane. */
  headBehind: Vec2[]
  /** Sectioned head pieces (hatched). */
  head: Vec2[][]
  camBores: { c: Vec2; r: number }[]
  /** Spark plug stack: thread, hex, insulator, terminal. */
  plug: { shell: Vec2[][]; insulator: Vec2[][] }
  /** Port gas regions (between the port walls). */
  ports: Record<ValveId, Vec2[]>
  /** Timing belt loop and flywheel rim, behind the section (drawn dashed). */
  belt: Vec2[]
  flywheel: { c: Vec2; r: number }
  mainBearing: { c: Vec2; r: number }
}

export function buildStaticSection(): StaticSection {
  const w = BLOCK.halfWidth
  const block: Vec2[][] = []
  const liner: Vec2[][] = []
  const coolant: Vec2[][] = []
  for (const s of [1, -1]) {
    const side = (z0: number, z1: number, y0: number, y1: number) => rect(s * z0, s * z1, y0, y1)
    block.push(side(BLOCK.jacketOuterR, w, BLOCK.jacketBottomY, DECK_Y))
    block.push(side(BLOCK.linerOuterR, w, BLOCK.linerBottomY, BLOCK.jacketBottomY))
    block.push(side(w - BLOCK.sideWall, w, BLOCK.crankcaseBottomY, BLOCK.linerBottomY))
    liner.push(side(BORE_R, BLOCK.linerOuterR, BLOCK.linerBottomY, DECK_Y))
    coolant.push(side(BLOCK.linerOuterR, BLOCK.jacketOuterR, BLOCK.jacketBottomY, DECK_Y))
  }
  const p = SPARK_PLUG
  const ports = {} as Record<ValveId, Vec2[]>
  for (const valve of ['intake', 'exhaust'] as const) {
    const path = portPath(valve)
    ports[valve] = [...path.inner, ...[...path.outer].reverse()]
  }
  return {
    block,
    liner,
    coolant,
    sump: {
      pan: [
        { z: -w, y: BLOCK.crankcaseBottomY },
        { z: -w, y: BLOCK.sumpBottomY },
        { z: w, y: BLOCK.sumpBottomY },
        { z: w, y: BLOCK.crankcaseBottomY },
      ],
      oil: rect(-w + 0.03, w - 0.03, BLOCK.sumpBottomY + 0.02, BLOCK.sumpBottomY + 0.1),
    },
    headBehind: headRearOutline(false),
    head: headSectionPieces(),
    camBores: (['intake', 'exhaust'] as const).map((v) => ({ c: camCentre(v), r: 0.105 })),
    plug: {
      shell: [rect(-p.threadR, p.threadR, p.threadBottomY, p.threadTopY), rect(-p.hexR, p.hexR, p.threadTopY, p.hexTopY)],
      insulator: [rect(-p.insulatorR, p.insulatorR, p.hexTopY, p.insulatorTopY), rect(-0.03, 0.03, p.insulatorTopY, p.terminalTopY)],
    },
    ports,
    belt: timingBeltPath(12),
    flywheel: { c: { z: 0, y: 0 }, r: FLYWHEEL.radius },
    mainBearing: { c: { z: 0, y: 0 }, r: BLOCK.mainBearingR },
  }
}

/* ------------------------------------------------------------------ */
/* Moving parts                                                         */
/* ------------------------------------------------------------------ */

export interface PistonDrawing {
  body: Vec2[]
  /** Ring groove lines (z0 → z1 at y). */
  rings: { y: number; z0: number; z1: number }[]
  pin: { c: Vec2; r: number }
  crownY: number
}

/** Piston outline for a wrist-pin height in scene units. */
export function pistonDrawing(pinY: number): PistonDrawing {
  const crownY = pinY + COMPRESSION_HEIGHT
  const r = PISTON.radius
  return {
    body: rect(-r, r, pinY - PISTON.skirtBelowPin, crownY),
    rings: PISTON.ringDepths.map((d) => ({ y: crownY - d, z0: -r, z1: r })),
    pin: { c: { z: 0, y: pinY }, r: PISTON.pinRadius },
    crownY,
  }
}

export interface RodDrawing {
  shank: Vec2[]
  small: { c: Vec2; r: number }
  big: { c: Vec2; r: number }
}

/** Connecting rod spanning exactly the wrist-pin and crank-pin centres. */
export function rodDrawing(pinHeightMm: number, crankPinMm: { y: number; z: number }): RodDrawing {
  const { small, big } = rodEnds(pinHeightMm, crankPinMm)
  const dz = big.z - small.z
  const dy = big.y - small.y
  const len = Math.hypot(dz, dy) || 1
  const n = { z: -dy / len, y: dz / len }
  const off = (c: Vec2, k: number): Vec2 => ({ z: c.z + n.z * k, y: c.y + n.y * k })
  return {
    shank: [off(small, 0.045), off(big, 0.075), off(big, -0.075), off(small, -0.045)],
    small: { c: small, r: 0.11 },
    big: { c: big, r: 0.165 },
  }
}

/**
 * Crank web + counterweight outline in the crank's own frame (pin straight up
 * at θ = 0), as SVG points. Rotate it with `rotate(${crankSvgRotation(θ)})`.
 */
export const CRANK_WEB_POINTS = (() => {
  const pts: Vec2[] = []
  const boss = 0.17
  const cw = CRANK.counterweightR
  // Same outline as the 3D web (engineGeometry webShape): pin boss over the top, counterweight below.
  for (let i = 0; i <= 16; i++) {
    const a = (Math.PI * i) / 16
    pts.push({ z: -boss * Math.cos(a), y: CRANK_R + boss * Math.sin(a) })
  }
  pts.push({ z: 0.2, y: 0 })
  for (let i = 0; i <= 20; i++) {
    const a = ((200 + (140 * i) / 20) * Math.PI) / 180
    pts.push({ z: -cw * Math.cos(a), y: cw * Math.sin(a) })
  }
  pts.push({ z: -0.2, y: 0 })
  return points(pts)
})()

/** SVG rotation (degrees) that turns the crank frame to crank angle θ in this view. */
export const crankSvgRotation = (crankDeg: number) => -crankDeg

/** Valve outline (head, neck, stem) lowered by `lift` scene units along its axis. */
export function valveOutline(valve: ValveId, lift: number): Vec2[] {
  const v = VALVES[valve]
  const top = VALVE_S.headThickness - 0.012
  const local: [number, number][] = [
    [-v.headR, -0.012],
    [v.headR, -0.012],
    [v.headR, top],
    [v.headR * 0.92, top],
    [v.stemR * 1.6, VALVE_S.neckEnd],
    [v.stemR, VALVE_S.neckEnd],
    [v.stemR, VALVE_S.stemTop],
    [-v.stemR, VALVE_S.stemTop],
    [-v.stemR, VALVE_S.neckEnd],
    [-v.stemR * 1.6, VALVE_S.neckEnd],
    [-v.headR * 0.92, top],
    [-v.headR, top],
  ]
  return local.map(([o, s]) => alongValve(v, s - lift, o))
}

export interface ValvetrainDrawing {
  /** Zig-zag coil from the fixed seat to the moving retainer. */
  spring: Vec2[]
  springSeat: Vec2[]
  retainer: Vec2[]
  follower: Vec2[]
  roller: { c: Vec2; r: number }
}

const SPRING_COIL_R = 0.092
const SPRING_TURNS = 6

/** Spring, retainer and roller follower for a valve lowered by `lift` scene units. */
export function valvetrainDrawing(valve: ValveId, lift: number): ValvetrainDrawing {
  const v = VALVES[valve]
  const along = (s: number, o: number) => alongValve(v, s, o)
  const retainerBottom = VALVE_S.retainer - 0.022 - lift
  const s0 = VALVE_S.springSeat
  const spring: Vec2[] = []
  const n = SPRING_TURNS * 2
  for (let k = 0; k <= n; k++) {
    const s = s0 + ((retainerBottom - s0) * k) / n
    const o = k === 0 || k === n ? 0 : k % 2 ? SPRING_COIL_R : -SPRING_COIL_R
    spring.push(along(s, o))
  }
  const quad = (sa: number, sb: number, oa: number, ob: number) => [along(sa, -oa), along(sa, oa), along(sb, ob), along(sb, -ob)]
  return {
    spring,
    springSeat: quad(s0 - 0.012, s0, 0.115, 0.115),
    retainer: quad(retainerBottom, VALVE_S.retainer - lift, 0.108, 0.08),
    follower: quad(VALVE_S.retainer - lift, VALVE_S.followerTop - lift, 0.13, 0.13),
    roller: { c: along(VALVE_S.followerTop + VALVE_S.rollerR - lift, 0), r: VALVE_S.rollerR },
  }
}

const LOBES: Record<ValveId, Vec2[]> = {
  intake: camLobeProfile('intake', 96),
  exhaust: camLobeProfile('exhaust', 96),
}

/**
 * Cam lobe outline in world (z, y) at a crank angle: the lobe profile turned
 * by the valve tilt plus the camshaft angle about the cam centre — the same
 * transform chain as the 3D scene, so the lobe touches the roller exactly.
 */
export function camLobeOutline(valve: ValveId, crankDeg: number): Vec2[] {
  const c = camCentre(valve)
  const a = VALVES[valve].rotationX + camRotation(valve, crankDeg)
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  return LOBES[valve].map((p) => ({ z: c.z + p.y * sin + p.z * cos, y: c.y + p.y * cos - p.z * sin }))
}

/** Gas region above the crown: crown line, bore walls, pent-roof. */
export function gasRegion(crownY: number): Vec2[] {
  return [
    { z: -BORE_R, y: crownY },
    { z: BORE_R, y: crownY },
    { z: BORE_R, y: DECK_Y },
    { z: 0, y: DECK_Y + ROOF_APEX },
    { z: -BORE_R, y: DECK_Y },
  ]
}

export { circle as circlePoints }
