/**
 * Gearbox laboratory — procedural geometry (three.js, no React).
 *
 * Everything is built along the scene's shaft axis (x). Gear teeth come from
 * tooth counts and the shared module in gearboxModel, so meshing gears match:
 * tooth k of a gear sits at ψ = 2πk/z, measured in the y–z plane from +y
 * towards +z (three.js rotation.x), exactly as `meshPhase` assumes.
 *
 * Helical gears are twisted about their own axis, symmetrically about the
 * face centre, so the tooth positions `meshPhase` relies on (mid-face) are
 * unchanged. Gears on the mainshaft axis use one hand and layshaft gears the
 * opposite hand, which is what two external helical gears need to mesh.
 */
import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  LatheGeometry,
  PlaneGeometry,
  Shape,
  TorusGeometry,
  Vector2,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { HEAD_PAIR, REVERSE_TRAIN, SPEED_PAIRS, type IndirectGearId } from './gearbox'
import {
  CASE,
  CLUTCH_GEO,
  DOG_MODULE,
  DOG_TEETH,
  DOG_WIDTH,
  FACE_WIDTH,
  HELIX_ANGLE,
  HUB_WIDTH,
  IDLER,
  LAY_REVERSE,
  LAY_Y,
  MAIN_Y,
  MODULE,
  OUTPUT_FLANGE,
  RAIL_Y,
  SHAFT,
  pitchRadius,
  rootRadius,
  tipRadius,
} from './gearboxModel'

export type GeometryTier = 'low' | 'high'

interface Detail {
  /** Segments around revolved parts. */
  radial: number
  /** Axial slices of a helical gear. */
  helixSteps: number
  /** Whether the flywheel carries a toothed starter ring. */
  ringGear: boolean
}

export const DETAIL: Record<GeometryTier, Detail> = {
  low: { radial: 28, helixSteps: 1, ringGear: false },
  high: { radial: 56, helixSteps: 4, ringGear: true },
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

/** Merge geometries into one non-indexed geometry and dispose the inputs. */
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
  if (!merged) throw new Error('gearbox geometry merge failed')
  return merged
}

/** Dispose every BufferGeometry in a (nested) record or array. */
export function disposeAll(obj: unknown): void {
  if (obj instanceof BufferGeometry) obj.dispose()
  else if (obj && typeof obj === 'object') Object.values(obj).forEach(disposeAll)
}

/** Solid cylinder along x, centred at x. */
export function cylinderX(radius: number, length: number, x: number, segments: number, y = 0, z = 0): BufferGeometry {
  const g = new CylinderGeometry(radius, radius, length, segments)
  g.rotateZ(-Math.PI / 2)
  g.translate(x, y, z)
  return g
}

/**
 * Revolve an (x, r) profile about the x axis. Each profile segment is built
 * as its own band so corners stay crisp while the surface stays smooth around
 * the circumference. Profiles traversed counter-clockwise in the (r → right,
 * x → up) plane face outwards.
 */
export function latheX(profile: [number, number][], segments: number, phiStart = 0, phiLength = Math.PI * 2): BufferGeometry {
  const bands: BufferGeometry[] = []
  for (let i = 0; i < profile.length - 1; i++) {
    const [x0, r0] = profile[i]
    const [x1, r1] = profile[i + 1]
    if (x0 === x1 && r0 === r1) continue
    const g = new LatheGeometry([new Vector2(r0, x0), new Vector2(r1, x1)], segments, phiStart, phiLength)
    g.rotateZ(-Math.PI / 2) // lathe y → world x
    bands.push(g)
  }
  return merge(bands)
}

/** Thin box strut between two points in the y–z plane at a given x. */
function strut(x: number, from: [number, number], to: [number, number], width: number, depth: number): BufferGeometry {
  const dy = to[0] - from[0]
  const dz = to[1] - from[1]
  const g = new BoxGeometry(width, Math.hypot(dy, dz), depth)
  g.rotateX(Math.atan2(dz, dy))
  g.translate(x, (from[0] + to[0]) / 2, (from[1] + to[1]) / 2)
  return g
}

/* ------------------------------------------------------------------ */
/* Gears                                                                */
/* ------------------------------------------------------------------ */

export interface GearSpec {
  teeth: number
  width: number
  module?: number
  /** Signed helix angle (rad); 0 = straight-cut. The sign is the hand. */
  helix?: number
  /** Axial slices for the helix twist. */
  steps?: number
}

/**
 * Tooth outline: angular offsets (fractions of the tooth pitch) from the
 * tooth centre and the radius each point sits on. Tooth ≈ 0.44 pitch thick at
 * the pitch circle, so partners always have backlash.
 */
const TOOTH_OUTLINE: [number, 'root' | 'pitch' | 'tip'][] = [
  [-0.3, 'root'],
  [-0.22, 'pitch'],
  [-0.13, 'tip'],
  [0.13, 'tip'],
  [0.22, 'pitch'],
  [0.3, 'root'],
  [0.5, 'root'],
]

/** Spur or helical gear, axis along x, face centred on x = 0, tooth 0 at +y. */
export function gearGeometry({ teeth, width, module = MODULE, helix = 0, steps = 1 }: GearSpec): BufferGeometry {
  const radii = { root: rootRadius(teeth, module), pitch: pitchRadius(teeth, module), tip: tipRadius(teeth, module) }
  const pitch = (2 * Math.PI) / teeth
  const pts: Vector2[] = []
  for (let k = 0; k < teeth; k++) {
    for (const [f, which] of TOOTH_OUTLINE) {
      const psi = k * pitch + f * pitch
      const r = radii[which]
      // Shape X = −z, shape Y = y (see rotateY below): ψ from +y towards +z.
      pts.push(new Vector2(-r * Math.sin(psi), r * Math.cos(psi)))
    }
  }
  const twisted = helix !== 0
  const g = new ExtrudeGeometry(new Shape(pts), { depth: width, bevelEnabled: false, steps: twisted ? Math.max(1, steps) : 1 })
  g.translate(0, 0, -width / 2)
  g.rotateY(Math.PI / 2) // (X, Y, Z) → (Z, Y, −X): extrusion → +x, shape X → −z
  if (twisted) {
    // Twist about x: rolling the pitch cylinder by x·tanβ gives the helix.
    const rate = Math.tan(helix) / radii.pitch
    const pos = g.getAttribute('position')
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const z = pos.getZ(i)
      const a = rate * x
      const c = Math.cos(a)
      const s = Math.sin(a)
      pos.setXYZ(i, x, y * c - z * s, y * s + z * c)
    }
    pos.needsUpdate = true
  }
  g.computeVertexNormals()
  return g
}

/** A gear with a hub boss on one or both sides (boss spans |x| ≤ face/2 + boss). */
function gearWithBoss(spec: GearSpec, bossRadius: number, boss: { left?: number; right?: number }, radial: number): BufferGeometry {
  const parts = [gearGeometry(spec)]
  const half = spec.width / 2
  if (boss.left) parts.push(cylinderX(bossRadius, boss.left, -half - boss.left / 2, radial))
  if (boss.right) parts.push(cylinderX(bossRadius, boss.right, half + boss.right / 2, radial))
  return merge(parts)
}

/** Dog-clutch ring on the side of a gear: short straight-cut teeth the synchro collar slides over. */
export const dogRingGeometry = () => gearGeometry({ teeth: DOG_TEETH, module: DOG_MODULE, width: DOG_WIDTH })

/* ------------------------------------------------------------------ */
/* Builders                                                             */
/* ------------------------------------------------------------------ */

const MAIN_HAND = 1
const LAY_HAND = -1

export function buildGearboxGeometries(tier: GeometryTier) {
  const d = DETAIL[tier]
  const R = d.radial
  const helical = (teeth: number, hand: number, width = FACE_WIDTH): GearSpec => ({
    teeth,
    width,
    helix: hand * HELIX_ANGLE,
    steps: d.helixSteps,
  })

  /* --- Gears (each centred on its own origin; the scene positions them) --- */
  const mainGears = {} as Record<IndirectGearId, BufferGeometry>
  const layGears = {} as Record<IndirectGearId, BufferGeometry>
  for (const g of Object.keys(SPEED_PAIRS) as IndirectGearId[]) {
    mainGears[g] = gearGeometry(helical(SPEED_PAIRS[g].driven, MAIN_HAND))
    layGears[g] = gearGeometry(helical(SPEED_PAIRS[g].driver, LAY_HAND))
  }
  const gears = {
    pinion: gearWithBoss(helical(HEAD_PAIR.driver, MAIN_HAND), SHAFT.input.radius + 0.06, { left: 0.08 }, R),
    layHead: gearGeometry(helical(HEAD_PAIR.driven, LAY_HAND)),
    main: mainGears,
    lay: layGears,
    // Reverse is straight-cut, as in most manual boxes (it is not synchronised).
    layReverse: gearGeometry({ teeth: REVERSE_TRAIN.driver, width: LAY_REVERSE.width }),
    idler: gearWithBoss({ teeth: REVERSE_TRAIN.idler, width: IDLER.width }, SHAFT.idler.radius + 0.05, { left: 0.04, right: 0.04 }, R),
    mainReverse: gearGeometry({ teeth: REVERSE_TRAIN.driven, width: FACE_WIDTH * 0.9 }),
    dogRing: dogRingGeometry(),
  }

  /* --- Shafts --- */
  const span = (s: { from: number; to: number }) => ({ length: s.to - s.from, mid: (s.from + s.to) / 2 })
  const input = span(SHAFT.input)
  const main = span(SHAFT.main)
  const lay = span(SHAFT.lay)
  const idler = span(SHAFT.idler)
  const shafts = {
    input: cylinderX(SHAFT.input.radius, input.length, input.mid, R),
    main: merge([
      cylinderX(SHAFT.main.radius, main.length, main.mid, R),
      // Output flange with four bolts, so the shaft's rotation is visible.
      cylinderX(OUTPUT_FLANGE.radius, OUTPUT_FLANGE.width, OUTPUT_FLANGE.x, R),
      ...[0, 1, 2, 3].map((i) => {
        const a = (i * Math.PI) / 2 + Math.PI / 4
        return cylinderX(0.035, OUTPUT_FLANGE.width + 0.06, OUTPUT_FLANGE.x + 0.02, 12, Math.cos(a) * 0.24, Math.sin(a) * 0.24)
      }),
    ]),
    lay: cylinderX(SHAFT.lay.radius, lay.length, lay.mid, R),
    idler: cylinderX(SHAFT.idler.radius, idler.length, idler.mid, R),
  }

  /* --- Synchronisers (hub + sliding collar + brass baulk rings) --- */
  const collarOuter = 0.37
  const collarInner = tipRadius(DOG_TEETH, DOG_MODULE) + 0.008
  const groove = { depth: 0.045, width: 0.07 }
  const hw = HUB_WIDTH / 2
  const synchro = {
    hub: merge([cylinderX(collarInner - 0.005, HUB_WIDTH - 0.02, 0, R), cylinderX(SHAFT.main.radius + 0.05, HUB_WIDTH + 0.04, 0, R)]),
    // Collar profile, outer surface with the fork groove, then the bore (CCW in r–x).
    collar: latheX(
      [
        [-hw, collarInner],
        [-hw, collarOuter],
        [-groove.width / 2, collarOuter],
        [-groove.width / 2, collarOuter - groove.depth],
        [groove.width / 2, collarOuter - groove.depth],
        [groove.width / 2, collarOuter],
        [hw, collarOuter],
        [hw, collarInner],
        [-hw, collarInner],
      ],
      R,
    ),
    baulk: merge([-1, 1].map((side) => cylinderX(collarInner - 0.02, 0.026, side * (hw + 0.016), R))),
  }

  /* --- Clutch stack (engaged positions; the scene animates offsets) --- */
  const c = CLUTCH_GEO
  const face = c.flywheelFace
  const flywheelParts = [cylinderX(c.flywheelRadius, c.flywheelThickness, face - c.flywheelThickness / 2, R)]
  // Crank flange boss on the engine side.
  flywheelParts.push(cylinderX(0.32, 0.12, face - c.flywheelThickness - 0.06, R))
  const ringGear = d.ringGear
    ? (() => {
        const g = gearGeometry({ teeth: 96, module: 0.021, width: 0.1 })
        g.translate(face - c.flywheelThickness + 0.05, 0, 0)
        return g
      })()
    : cylinderX(c.flywheelRadius + 0.02, 0.1, face - c.flywheelThickness + 0.05, R)

  const discX = face + c.discThickness / 2
  const springs: BufferGeometry[] = []
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    const r = 0.3
    const g = new CylinderGeometry(0.035, 0.035, 0.16, 10)
    // Tangential springs on the hub face, axis in the y–z plane.
    g.rotateX(a + Math.PI / 2)
    g.translate(discX + 0.06, Math.cos(a) * r, Math.sin(a) * r)
    springs.push(g)
  }
  const disc = {
    facing: cylinderX(c.discRadius, c.discThickness, discX, R),
    centre: merge([
      cylinderX(0.48, c.discThickness + 0.02, discX, R),
      // Splined hub that slides on the input shaft.
      cylinderX(SHAFT.input.radius + 0.07, 0.22, discX + 0.05, R),
    ]),
    springs: merge(springs),
  }

  const plateX0 = face + c.discThickness
  const plateX1 = plateX0 + c.plateThickness
  const pressurePlate = latheX(
    [
      [plateX0, c.plateOuter],
      [plateX1, c.plateOuter],
      [plateX1, c.plateInner],
      [plateX0, c.plateInner],
      [plateX0, c.plateOuter],
    ],
    R,
  )

  // Cover: from the flywheel rim back over the plate to the diaphragm fulcrum (CCW: outside first).
  const coverBack = face + c.discThickness + c.plateThickness + c.diaphragm.outerDrop + 0.03
  const cover = latheX(
    [
      [face + 0.004, c.flywheelRadius - 0.04],
      [face + 0.05, c.flywheelRadius - 0.04],
      [face + 0.08, c.plateOuter + 0.08],
      [coverBack, c.plateOuter + 0.02],
      [coverBack, c.diaphragm.fulcrum - 0.04],
      [coverBack - 0.02, c.diaphragm.fulcrum - 0.04],
      [coverBack - 0.02, c.plateOuter],
      [face + 0.06, c.plateOuter + 0.06],
      [face + 0.004, c.flywheelRadius - 0.06],
      [face + 0.004, c.flywheelRadius - 0.04],
    ],
    R,
  )
  const coverBolts = merge(
    [0, 1, 2, 3, 4, 5].map((i) => {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6
      return cylinderX(0.04, 0.08, face + 0.06, 10, Math.cos(a) * (c.flywheelRadius - 0.07), Math.sin(a) * (c.flywheelRadius - 0.07))
    }),
  )
  // Diaphragm cone, local x measured from the fulcrum (the scene scales it about x = 0).
  const t = 0.018
  const dia = c.diaphragm
  const diaphragm = latheX(
    [
      [-dia.outerDrop, dia.outer],
      [0, dia.fulcrum],
      [dia.fingerRise, dia.inner],
      [dia.fingerRise + t, dia.inner],
      [t, dia.fulcrum],
      [-dia.outerDrop + t, dia.outer],
      [-dia.outerDrop, dia.outer],
    ].reverse() as [number, number][],
    R,
  )
  const bearing = latheX(
    [
      [0, SHAFT.input.radius + 0.05],
      [0, 0.26],
      [c.bearingWidth, 0.24],
      [c.bearingWidth + 0.08, 0.2],
      [c.bearingWidth + 0.08, SHAFT.input.radius + 0.05],
      [0, SHAFT.input.radius + 0.05],
    ],
    R,
  )

  /* --- Selector forks and rails --- */
  const forkRadius = collarOuter - groove.depth + 0.012
  const yoke = () => {
    const g = new TorusGeometry(forkRadius, 0.022, 8, 24, Math.PI)
    g.rotateY(Math.PI / 2) // ring in the y–z plane, upper half
    return g
  }
  const fork = (railZ: number) =>
    merge([
      yoke(),
      strut(0, [forkRadius, 0], [RAIL_Y - MAIN_Y, railZ], 0.045, 0.06),
      new BoxGeometry(0.16, 0.12, 0.12).translate(0, RAIL_Y - MAIN_Y, railZ),
    ])
  const RAIL_Z = { h34: -0.26, h12: 0, h5: 0.26 } as const
  const rails = merge(
    Object.values(RAIL_Z).map((z) => cylinderX(0.035, CASE.rear - CASE.front, (CASE.front + CASE.rear) / 2, 12, RAIL_Y, z)),
  )

  /* --- Casing: the half away from the camera (z ≤ 0), sectioned at z = 0 --- */
  const casing = buildCasing(R)

  return {
    gears,
    shafts,
    synchro,
    clutch: { flywheel: merge(flywheelParts), ringGear, disc, pressurePlate, cover, coverBolts, diaphragm, bearing },
    forks: { h34: fork(RAIL_Z.h34), h12: fork(RAIL_Z.h12), h5: fork(RAIL_Z.h5), rails },
    casing,
  }
}

export type GearboxGeometries = ReturnType<typeof buildGearboxGeometries>

/**
 * Open half-cylinder shells (outer + inner skin) around an axis at height
 * `y`, covering the far side (z ≤ 0) and spanning the given angle range of
 * that half. θ is CylinderGeometry's angle after rotating its axis onto x:
 * (π, 3π/2) is the upper-back quarter, (π/2, π) the lower-back quarter.
 */
function shell(radius: number, x0: number, x1: number, y: number, thetaStart: number, thetaLength: number, radial: number) {
  const g = new CylinderGeometry(radius, radius, x1 - x0, Math.max(6, Math.round(radial / 4)), 1, true, thetaStart, thetaLength)
  g.rotateZ(-Math.PI / 2)
  g.translate((x0 + x1) / 2, y, 0)
  return g
}

/** A flat section face on the cut plane (z = 0), spanning x0..x1 and y0..y1. */
function sectionStrip(x0: number, x1: number, y0: number, y1: number) {
  const g = new PlaneGeometry(x1 - x0, Math.abs(y1 - y0))
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, 0.002)
  return g
}

/** Half-stadium end wall (y–z plane, z ≤ 0) of thickness `wall` starting at x. */
function endWall(x: number, wall: number, curve: number) {
  const r = CASE.radius
  const s = new Shape()
  // Shape coordinates: X = −z (so z ≤ 0 ⇒ X ≥ 0), Y = y.
  s.moveTo(0, MAIN_Y + r)
  s.absarc(0, MAIN_Y, r, Math.PI / 2, 0, true)
  s.lineTo(r, LAY_Y)
  s.absarc(0, LAY_Y, r, 0, -Math.PI / 2, true)
  s.lineTo(0, MAIN_Y + r)
  const g = new ExtrudeGeometry(s, { depth: wall, bevelEnabled: false, curveSegments: curve })
  g.rotateY(Math.PI / 2)
  g.translate(x, 0, 0)
  return g
}

function buildCasing(radial: number) {
  const r = CASE.radius
  const w = CASE.wall
  const inner = r - w
  const bellR = CLUTCH_GEO.flywheelRadius + 0.2
  const ext = 0.3
  const curve = Math.max(6, Math.round(radial / 6))
  const skins: BufferGeometry[] = []
  for (const rad of [r, inner]) {
    skins.push(shell(rad, CASE.front, CASE.rear, MAIN_Y, Math.PI, Math.PI / 2, radial))
    skins.push(shell(rad, CASE.front, CASE.rear, LAY_Y, Math.PI / 2, Math.PI / 2, radial))
    // Flat back wall between the two axes.
    const back = new PlaneGeometry(CASE.rear - CASE.front, MAIN_Y - LAY_Y)
    back.translate((CASE.front + CASE.rear) / 2, (MAIN_Y + LAY_Y) / 2, -rad)
    skins.push(back)
  }
  for (const rad of [bellR, bellR - w]) {
    skins.push(shell(rad, CASE.bellFrom, CASE.front, MAIN_Y, Math.PI / 2, Math.PI, radial))
  }
  for (const rad of [ext, ext - w * 0.6]) {
    skins.push(shell(rad, CASE.rear, CASE.extensionTo, MAIN_Y, Math.PI / 2, Math.PI, radial))
  }
  const walls = merge([endWall(CASE.front - w, w, curve), endWall(CASE.rear, w, curve)])
  const section = merge([
    sectionStrip(CASE.front, CASE.rear, MAIN_Y + inner, MAIN_Y + r),
    sectionStrip(CASE.front, CASE.rear, LAY_Y - r, LAY_Y - inner),
    sectionStrip(CASE.bellFrom, CASE.front, MAIN_Y + bellR - w, MAIN_Y + bellR),
    sectionStrip(CASE.bellFrom, CASE.front, MAIN_Y - bellR, MAIN_Y - bellR + w),
    sectionStrip(CASE.front - w, CASE.front, LAY_Y - r, MAIN_Y + r),
    sectionStrip(CASE.rear, CASE.rear + w, LAY_Y - r, MAIN_Y + r),
  ])
  return { skin: merge(skins), walls, section }
}
