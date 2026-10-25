/**
 * Suspension laboratory — 3D scene.
 *
 * MODEL DECISION: no licence-verified suspension model with separable,
 * correctly pivoted parts is listed in public/models/manifest.json, so the
 * teaching model is an ORIGINAL procedural double-wishbone front corner built
 * from linkage.ts (hard points + linkage solver) and suspensionModel.ts.
 *
 * Every transform is a pure function of the lab's `progress` and `params`,
 * read in useFrame via store.getState() and resolved through one cached
 * SuspensionFrame: the quarter-car pose gives body and wheel heights; the
 * linkage solver turns the suspension travel into arm, knuckle, coil-over,
 * anti-roll-bar and tie-rod positions that keep every joint closed; the wheel
 * spin is the distance rolled divided by the rolling radius. Nothing is
 * integrated per frame, so play / pause / scrub / step always agree.
 */
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  LineDashedMaterial,
  LineSegments,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type Group,
  type Mesh,
  type MeshStandardMaterialParameters,
} from 'three'
import { useLabStoreApi } from '@/components/three/LabContext'
import { Part } from '@/components/three/Part'
import type { QualityTier } from '@/hooks/useQualityTier'
import type { LabState } from '@/lib/simulation/labStore'
import { DROP_LINK, DROP_LINK_LENGTH, HARDPOINTS, TIE_ROD_LENGTH, TYRE } from './linkage'
import {
  DASH_COUNT,
  DASH_VERTEX_COUNT,
  EDGE_VERTEX_COUNT,
  ROAD,
  ROAD_VERTEX_COUNT,
  roadIndices,
  stripIndices,
  writeMarkings,
  writeRoad,
} from './roadSurface'
import { COILOVER, LOADED_RADIUS, coiloverState, type SuspensionFrame } from './suspensionModel'
import { DETAIL, WHEEL_CENTRE0, buildSuspensionGeometries, createCoilGeometry, disposeAll, type SuspensionGeometries } from './suspensionGeometry'
import { EXPLODE, LABEL_ANCHOR, type SuspensionPartId } from './suspensionParts'
import { frameOf } from './useSuspensionFrame'

/* ------------------------------------------------------------------ */
/* Materials                                                            */
/* ------------------------------------------------------------------ */

function createMaterials() {
  const std = (color: string, metalness: number, roughness: number, extra: MeshStandardMaterialParameters = {}) =>
    new MeshStandardMaterial({ color, metalness, roughness, ...extra })
  return {
    body: std('#3d4552', 0.45, 0.55),
    section: std('#8f523d', 0.05, 0.8),
    arm: std('#7f8894', 0.7, 0.38),
    ballJoint: std('#d0d4da', 0.85, 0.22),
    knuckle: std('#a6adb6', 0.6, 0.42),
    hub: std('#c2c7ce', 0.8, 0.28),
    rim: std('#cfd4da', 0.88, 0.24),
    tyre: std('#1a1c20', 0, 0.86),
    spring: std('#4f86b0', 0.55, 0.36),
    damperBody: std('#262a31', 0.55, 0.45),
    chrome: std('#e6e9ed', 0.95, 0.12),
    rubber: std('#17191d', 0, 0.8),
    bumpStop: std('#d9a441', 0.05, 0.6),
    antiRoll: std('#2d3239', 0.6, 0.42),
    link: std('#9aa1aa', 0.75, 0.32),
    road: std('#ffffff', 0, 0.94, { vertexColors: true }),
    paint: std('#d8d2c4', 0, 0.75, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    patch: new MeshBasicMaterial({ color: '#f6a63a', transparent: true, opacity: 0.55, depthWrite: false, side: DoubleSide, toneMapped: false }),
    marker: new LineDashedMaterial({ color: '#f6a63a', dashSize: 0.018, gapSize: 0.012, transparent: true, opacity: 0.85 }),
  }
}

type Materials = ReturnType<typeof createMaterials>

/** Shared props for every <Part>: its exploded-view offset and label anchor. */
const partProps = (id: SuspensionPartId) => ({ id, explode: EXPLODE[id], labelAnchor: LABEL_ANCHOR[id] })

/* ------------------------------------------------------------------ */
/* Frame plumbing                                                       */
/* ------------------------------------------------------------------ */

/** Run `update` every frame with the current suspension frame and store state. */
function useRigFrame(update: (f: SuspensionFrame, s: LabState) => void) {
  const store = useLabStoreApi()
  useFrame(() => {
    const s = store.getState()
    update(frameOf(s), s)
  })
}

/** Everything bolted to the body rises and falls with the body displacement. */
function BodyFrame({ children }: { children: ReactNode }) {
  const ref = useRef<Group>(null)
  useRigFrame((f) => {
    if (ref.current) ref.current.position.y = f.pose.body
  })
  return <group ref={ref}>{children}</group>
}

/** A wishbone's frame: origin on its inner pivot axis, turned about z by the solved arm angle. */
function ArmFrame({ arm, children }: { arm: 'lower' | 'upper'; children: ReactNode }) {
  const ref = useRef<Group>(null)
  const pivot = arm === 'lower' ? HARDPOINTS.lowerInner : HARDPOINTS.upperInner
  useRigFrame((f) => {
    if (ref.current) ref.current.rotation.z = arm === 'lower' ? f.link.lowerArmAngle : f.link.upperArmAngle
  })
  return (
    <group ref={ref} position={[pivot.x, pivot.y, 0]}>
      {children}
    </group>
  )
}

/**
 * The knuckle's frame: children use static body coordinates; the frame maps
 * the static lower ball joint onto the solved one and turns by the knuckle
 * angle, so both ball joints land exactly on the arms.
 */
function KnuckleFrame({ children }: { children: ReactNode }) {
  const ref = useRef<Group>(null)
  useRigFrame((f) => {
    const g = ref.current
    if (!g) return
    g.position.set(f.link.lowerBallJoint.x, f.link.lowerBallJoint.y, 0)
    g.rotation.z = f.link.knuckleAngle
  })
  return (
    <group ref={ref}>
      <group position={[-HARDPOINTS.lowerBallJoint.x, -HARDPOINTS.lowerBallJoint.y, 0]}>{children}</group>
    </group>
  )
}

/** Wheel rotation about its axle: distance rolled ÷ rolling radius (a pure function of progress). */
function WheelSpin({ children }: { children: ReactNode }) {
  const ref = useRef<Group>(null)
  useRigFrame((f) => {
    if (ref.current) ref.current.rotation.x = f.wheelSpin
  })
  return (
    <group ref={ref} position={[WHEEL_CENTRE0.x, WHEEL_CENTRE0.y, 0]}>
      {children}
    </group>
  )
}

function BallJointAt({ which, children }: { which: 'lower' | 'upper'; children: ReactNode }) {
  const ref = useRef<Group>(null)
  useRigFrame((f) => {
    const g = ref.current
    if (!g) return
    const p = which === 'lower' ? f.link.lowerBallJoint : f.link.upperBallJoint
    g.position.set(p.x, p.y, 0)
    g.rotation.z = f.link.knuckleAngle
  })
  return <group ref={ref}>{children}</group>
}

/** Coil-over frame: origin at the lower eye on the lower arm, +y along the axis to the top mount. */
function CoiloverFrame({ children }: { children: ReactNode }) {
  const ref = useRef<Group>(null)
  useRigFrame((f) => {
    const g = ref.current
    if (!g) return
    g.position.set(f.link.coiloverLower.x, f.link.coiloverLower.y, 0)
    g.rotation.z = f.link.coiloverAngle
  })
  return <group ref={ref}>{children}</group>
}

/** Inside the coil-over frame: the top-mount end (rod, upper seat, bump stop), at the current coil-over length. */
function CoiloverTop({ children }: { children: ReactNode }) {
  const ref = useRef<Group>(null)
  useRigFrame((f) => {
    if (ref.current) ref.current.position.y = f.link.coiloverLength
  })
  return <group ref={ref}>{children}</group>
}

/** The rubber bump stop squashes (volume-preserving) once the damper body reaches it. */
function BumpStopSquash({ children }: { children: ReactNode }) {
  const ref = useRef<Group>(null)
  useRigFrame((f) => {
    const g = ref.current
    if (!g) return
    const k = coiloverState(f.link).bumpStopLength / COILOVER.bumpStopLength
    const bulge = 1 / Math.sqrt(k)
    g.scale.set(bulge, k, bulge)
  })
  return <group ref={ref}>{children}</group>
}

/** Anti-roll-bar arm: turned about the bar axis by the solved angle. */
function AntiRollArm({ children }: { children: ReactNode }) {
  const ref = useRef<Group>(null)
  useRigFrame((f) => {
    if (ref.current) ref.current.rotation.x = -f.link.antiRollAngle
  })
  return (
    <group position={[DROP_LINK.x, HARDPOINTS.antiRollAxis.y, HARDPOINTS.antiRollAxis.z]}>
      <group ref={ref}>{children}</group>
    </group>
  )
}

const UP = new Vector3(0, 1, 0)
const tmpA = new Vector3()
const tmpB = new Vector3()
const tmpQ = new Quaternion()

/** A rigid link drawn along +y from `from`, aimed at `to` (scaled to close any tiny solver gap). */
function Segment({ ends, nominal, children }: { ends: (f: SuspensionFrame) => readonly [readonly number[], readonly number[]]; nominal: number; children: ReactNode }) {
  const ref = useRef<Group>(null)
  useRigFrame((f) => {
    const g = ref.current
    if (!g) return
    const [a, b] = ends(f)
    tmpA.set(a[0], a[1], a[2])
    tmpB.set(b[0], b[1], b[2]).sub(tmpA)
    const length = tmpB.length()
    g.position.copy(tmpA)
    g.quaternion.copy(tmpQ.setFromUnitVectors(UP, tmpB.normalize()))
    g.scale.set(1, length / nominal, 1)
  })
  return <group ref={ref}>{children}</group>
}

const dropLinkEnds = (f: SuspensionFrame) => [f.link.dropLinkLower, f.link.dropLinkUpper] as const
const tieRodEnds = (f: SuspensionFrame) => [f.link.tieRodInner, f.link.tieRodOuter] as const

/* ------------------------------------------------------------------ */
/* Dynamic meshes                                                       */
/* ------------------------------------------------------------------ */

/** Spring gap left for the seat plates. */
const SEAT = 0.004

function CoilSpring({ tier, material }: { tier: QualityTier; material: MeshStandardMaterial }) {
  const coil = useMemo(() => createCoilGeometry(DETAIL[tier], 0.48), [tier])
  useEffect(() => () => coil.geometry.dispose(), [coil])
  useRigFrame((f) => coil.setLength(coiloverState(f.link).springLength - 2 * SEAT))
  return (
    <group position={[0, COILOVER.lowerSeat + SEAT, 0]}>
      <mesh geometry={coil.geometry} material={material} />
    </group>
  )
}

/** Linear-space RGB of a CSS colour (vertex colours are linear). */
const linear = (hex: string) => new Color(hex).toArray()

/** The scrolling road: heights rewritten whenever the distance or road changes. */
function RoadSurface({ mats }: { mats: Materials }) {
  const built = useMemo(() => {
    const strip = new BufferGeometry()
    const position = new BufferAttribute(new Float32Array(ROAD_VERTEX_COUNT * 3), 3).setUsage(DynamicDrawUsage)
    const normal = new BufferAttribute(new Float32Array(ROAD_VERTEX_COUNT * 3), 3).setUsage(DynamicDrawUsage)
    const color = new BufferAttribute(new Float32Array(ROAD_VERTEX_COUNT * 3), 3).setUsage(DynamicDrawUsage)
    strip.setAttribute('position', position)
    strip.setAttribute('normal', normal)
    strip.setAttribute('color', color)
    strip.setIndex(new BufferAttribute(roadIndices(), 1))

    const dashes = new BufferGeometry()
    const dashPos = new BufferAttribute(new Float32Array(DASH_VERTEX_COUNT * 3), 3).setUsage(DynamicDrawUsage)
    dashes.setAttribute('position', dashPos)
    dashes.setAttribute('normal', new Float32BufferAttribute(new Float32Array(DASH_VERTEX_COUNT * 3).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3))
    dashes.setIndex(new BufferAttribute(stripIndices(DASH_COUNT, ROAD.dash.rows), 1))

    const edge = new BufferGeometry()
    const edgePos = new BufferAttribute(new Float32Array(EDGE_VERTEX_COUNT * 3), 3).setUsage(DynamicDrawUsage)
    edge.setAttribute('position', edgePos)
    edge.setAttribute('normal', new Float32BufferAttribute(new Float32Array(EDGE_VERTEX_COUNT * 3).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3))
    edge.setIndex(new BufferAttribute(stripIndices(1, ROAD.rows), 1))
    return { strip, dashes, edge, position, normal, color, dashPos, edgePos }
  }, [])
  useEffect(
    () => () => {
      built.strip.dispose()
      built.dashes.dispose()
      built.edge.dispose()
    },
    [built],
  )
  const colours = useMemo(() => ({ base: linear('#30343b'), far: linear('#0d0e11') }), [])
  const last = useRef<{ road: string; distance: number }>({ road: '', distance: Number.NaN })
  useRigFrame((f) => {
    if (last.current.road === f.road.id && last.current.distance === f.distance) return
    last.current = { road: f.road.id, distance: f.distance }
    writeRoad(f.road, f.distance, { position: built.position.array as Float32Array, normal: built.normal.array as Float32Array, color: built.color.array as Float32Array }, colours.base, colours.far)
    writeMarkings(f.road, f.distance, built.dashPos.array as Float32Array, built.edgePos.array as Float32Array)
    for (const a of [built.position, built.normal, built.color, built.dashPos, built.edgePos]) a.needsUpdate = true
    built.strip.computeBoundingSphere()
    built.dashes.computeBoundingSphere()
    built.edge.computeBoundingSphere()
  })
  return (
    <group>
      <mesh geometry={built.strip} material={mats.road} />
      <mesh geometry={built.dashes} material={mats.paint} />
      <mesh geometry={built.edge} material={mats.paint} />
    </group>
  )
}

/**
 * Whether a conceptual overlay should show: not in the exploded view, and not
 * when the wheel is hidden or another part is isolated.
 */
function overlayVisible(s: LabState) {
  if (s.exploded || s.hidden['wheel-and-tyre']) return false
  return s.isolatedId === null || s.isolatedId === 'wheel-and-tyre'
}

/**
 * Conceptual contact patch: the chord where the (rigid, drawn) tyre meets the
 * road, 2·√(2Rδ − δ²) for a squash δ, fading with load; gone when the tyre is
 * off the road.
 */
function ContactPatch({ geo, mats }: { geo: SuspensionGeometries; mats: Materials }) {
  const ref = useRef<Mesh>(null)
  useRigFrame((f, s) => {
    const m = ref.current
    if (!m) return
    const R = TYRE.freeRadius
    const squash = f.pose.roadZ - (f.wheelCentreY - R)
    const visible = f.pose.contact && squash > 0 && overlayVisible(s)
    m.visible = visible
    if (!visible) return
    const length = 2 * Math.sqrt(Math.max(0, 2 * R * squash - squash * squash))
    m.position.set(f.link.wheelCentre.x, f.pose.roadZ + 0.003, 0)
    m.scale.set(1, 1, Math.max(0.001, length))
    ;(m.material as MeshBasicMaterial).opacity = Math.min(0.75, 0.25 + 0.3 * f.pose.loadFactor)
  })
  return <mesh ref={ref} geometry={geo.contactPatch} material={mats.patch} renderOrder={2} />
}

/** Dashed amber ticks at the static ride heights of the body (turret top) and the wheel centre. */
function RideHeightMarkers({ mats }: { mats: Materials }) {
  const lines = useMemo(() => {
    const turretTop = HARDPOINTS.topMount.y + 0.04 + 0.025
    const x0 = HARDPOINTS.topMount.x + 0.13
    const wx = HARDPOINTS.wheelCentreX + TYRE.width / 2 + 0.03
    const g = new BufferGeometry().setFromPoints([
      new Vector3(x0, turretTop, 0.11),
      new Vector3(x0 + 0.14, turretTop, 0.11),
      new Vector3(wx, LOADED_RADIUS, 0),
      new Vector3(wx + 0.12, LOADED_RADIUS, 0),
    ])
    const l = new LineSegments(g, mats.marker)
    l.computeLineDistances()
    return l
  }, [mats])
  useEffect(() => () => lines.geometry.dispose(), [lines])
  const store = useLabStoreApi()
  useFrame(() => {
    lines.visible = !store.getState().exploded
  })
  return <primitive object={lines} />
}

/* ------------------------------------------------------------------ */
/* Scene                                                                */
/* ------------------------------------------------------------------ */

export function SuspensionScene({ tier }: { tier: QualityTier }) {
  const geo = useMemo(() => buildSuspensionGeometries(tier), [tier])
  const mats = useMemo(() => createMaterials(), [])
  useEffect(() => () => disposeAll(geo), [geo])
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats])

  return (
    <group>
      <RoadSurface mats={mats} />
      <ContactPatch geo={geo} mats={mats} />
      <RideHeightMarkers mats={mats} />

      <Part {...partProps('chassis-mounts')}>
        <BodyFrame>
          <mesh geometry={geo.chassis} material={mats.body} />
          <mesh geometry={geo.topMount} material={mats.rubber} />
          <mesh geometry={geo.sectionCut} material={mats.section} />
        </BodyFrame>
      </Part>

      <Part {...partProps('lower-control-arm')}>
        <BodyFrame>
          <ArmFrame arm="lower">
            <mesh geometry={geo.lowerArm} material={mats.arm} />
          </ArmFrame>
        </BodyFrame>
      </Part>

      <Part {...partProps('upper-control-arm')}>
        <BodyFrame>
          <ArmFrame arm="upper">
            <mesh geometry={geo.upperArm} material={mats.arm} />
          </ArmFrame>
        </BodyFrame>
      </Part>

      <Part {...partProps('ball-joints')}>
        <BodyFrame>
          <BallJointAt which="lower">
            <mesh geometry={geo.lowerBallJoint} material={mats.ballJoint} />
          </BallJointAt>
          <BallJointAt which="upper">
            <mesh geometry={geo.upperBallJoint} material={mats.ballJoint} />
          </BallJointAt>
        </BodyFrame>
      </Part>

      <Part {...partProps('knuckle-upright')}>
        <BodyFrame>
          <KnuckleFrame>
            <mesh geometry={geo.knuckle} material={mats.knuckle} />
          </KnuckleFrame>
        </BodyFrame>
      </Part>

      <Part {...partProps('hub-bearing')}>
        <BodyFrame>
          <KnuckleFrame>
            <WheelSpin>
              <mesh geometry={geo.hub} material={mats.hub} />
            </WheelSpin>
          </KnuckleFrame>
        </BodyFrame>
      </Part>

      <Part {...partProps('wheel-and-tyre')}>
        <BodyFrame>
          <KnuckleFrame>
            <WheelSpin>
              <mesh geometry={geo.rim} material={mats.rim} />
              <mesh geometry={geo.tyre} material={mats.tyre} />
            </WheelSpin>
          </KnuckleFrame>
        </BodyFrame>
      </Part>

      <Part {...partProps('coil-spring')}>
        <BodyFrame>
          <CoiloverFrame>
            <CoilSpring tier={tier} material={mats.spring} />
          </CoiloverFrame>
        </BodyFrame>
      </Part>

      <Part {...partProps('damper')}>
        <BodyFrame>
          <CoiloverFrame>
            <mesh geometry={geo.damperBody} material={mats.damperBody} />
            <CoiloverTop>
              <mesh geometry={geo.damperRod} material={mats.chrome} />
            </CoiloverTop>
          </CoiloverFrame>
        </BodyFrame>
      </Part>

      <Part {...partProps('bump-stop')}>
        <BodyFrame>
          <CoiloverFrame>
            <CoiloverTop>
              <BumpStopSquash>
                <mesh geometry={geo.bumpStop} material={mats.bumpStop} />
              </BumpStopSquash>
            </CoiloverTop>
          </CoiloverFrame>
        </BodyFrame>
      </Part>

      <Part {...partProps('anti-roll-bar')}>
        <BodyFrame>
          <mesh geometry={geo.antiRollBar} material={mats.antiRoll} />
          <AntiRollArm>
            <mesh geometry={geo.antiRollArm} material={mats.antiRoll} />
          </AntiRollArm>
        </BodyFrame>
      </Part>

      <Part {...partProps('drop-link')}>
        <BodyFrame>
          <Segment ends={dropLinkEnds} nominal={DROP_LINK_LENGTH}>
            <mesh geometry={geo.dropLink} material={mats.link} />
          </Segment>
        </BodyFrame>
      </Part>

      <Part {...partProps('tie-rod')}>
        <BodyFrame>
          <mesh geometry={geo.rackGaiter} material={mats.rubber} />
          <mesh geometry={geo.rackHousing} material={mats.damperBody} />
          <Segment ends={tieRodEnds} nominal={TIE_ROD_LENGTH}>
            <mesh geometry={geo.tieRod} material={mats.link} />
          </Segment>
        </BodyFrame>
      </Part>
    </group>
  )
}
