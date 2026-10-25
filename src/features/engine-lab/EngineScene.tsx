/**
 * Engine laboratory — 3D scene.
 *
 * MODEL DECISION (see docs/3d-asset-inventory.md §1.2 and
 * public/models/manifest.json): no engine asset is eligible for interactive
 * use. The legacy Khronos "2 Cylinder Engine" has separate pistons and rods
 * but carries no licence (rejected, kept only as a private reference), and
 * every Sketchfab / GitHub candidate needs a sign-in and was not downloaded.
 * None of them shows valves, springs, a spark plug or a cutaway anyway. So
 * the teaching model is an ORIGINAL procedural single-cylinder, twin-cam
 * (DOHC) cutaway built from engineModel.ts, and no secondary "real CAD" view
 * is offered. Swap in a GLB here (useGLTF + <Part><primitive/></Part>) only
 * once the manifest lists a licence-verified engine with separable parts.
 *
 * Every moving transform is a pure function of the lab's `progress`, read in
 * useFrame via store.getState() — no React re-render per frame. Static
 * castings are sectioned at x = 0 (the half nearer the camera is cut away);
 * moving parts are whole so they read as solid objects.
 */
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  DoubleSide,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  SRGBColorSpace,
  type Group,
  type InstancedMesh,
  type Mesh,
  type MeshStandardMaterialParameters,
  type PointLight,
} from 'three'
import { useLabStoreApi } from '@/components/three/LabContext'
import { Part } from '@/components/three/Part'
import type { QualityTier } from '@/hooks/useQualityTier'
import type { LabState } from '@/lib/simulation/labStore'
import {
  BLOCK,
  DECK_Y,
  FLYWHEEL,
  HEAD,
  MM,
  SPARK_GAP,
  SPARK_PLUG,
  TIMING,
  VALVES,
  VALVE_S,
  alongValve,
  beltTravel,
  camCentre,
  camRotation,
  crownYFromPinMm,
  gasAppearance,
  loopSampler,
  portGasAppearance,
  timingBeltPath,
  visualLift,
} from './engineModel'
import { CAM_LOCAL_Y, DETAIL, buildEngineGeometries, disposeAll, type EngineGeometries } from './engineGeometry'
import { EXPLODE, type EnginePartId } from './engineParts'
import {
  combustionIntensity,
  crankAngleFromProgress,
  pistonPinHeight,
  rodAngle,
  sparkIntensity,
  type ValveId,
} from './kinematics'

const DEG = Math.PI / 180
type Vec3 = [number, number, number]

/* ------------------------------------------------------------------ */
/* Materials                                                            */
/* ------------------------------------------------------------------ */

function createEngineMaterials() {
  const std = (color: string, metalness: number, roughness: number, extra: MeshStandardMaterialParameters = {}) =>
    new MeshStandardMaterial({ color, metalness, roughness, ...extra })
  // Conceptual gas: colour, opacity and glow are written every frame.
  const gas = () => std('#38d7f2', 0, 0.9, { transparent: true, opacity: 0.3, depthWrite: false, side: DoubleSide, emissive: '#000000' })
  return {
    casting: std('#8c939c', 0.55, 0.46),
    section: std('#8f523d', 0.05, 0.8, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    liner: std('#aab0b8', 0.85, 0.28),
    chamber: std('#5a606a', 0.6, 0.5, { side: DoubleSide }),
    port: std('#747b86', 0.55, 0.55, { side: DoubleSide }),
    crank: std('#c3c8cf', 0.7, 0.32),
    rod: std('#b4bac2', 0.7, 0.34),
    piston: std('#d5d8dc', 0.6, 0.34),
    rings: std('#3a3f47', 0.85, 0.38),
    pin: std('#e3e6ea', 0.8, 0.2),
    intakeValve: std('#c4c9cf', 0.7, 0.3),
    exhaustValve: std('#b09f8d', 0.65, 0.38),
    spring: std('#5a7f99', 0.65, 0.38),
    springSeat: std('#a3aab3', 0.7, 0.32),
    cam: std('#bcc2ca', 0.75, 0.26),
    follower: std('#9aa1aa', 0.7, 0.32),
    pulley: std('#30353d', 0.75, 0.4),
    belt: std('#17191d', 0, 0.82),
    mark: std('#f6a63a', 0.2, 0.45, { emissive: '#f6a63a', emissiveIntensity: 0.55 }),
    flywheel: std('#7d848e', 0.7, 0.4),
    sump: std('#2b3038', 0.5, 0.52),
    oil: std('#7c4f12', 0.1, 0.12, { transparent: true, opacity: 0.88 }),
    plugShell: std('#bcc1c7', 0.75, 0.28),
    insulator: std('#ece8df', 0, 0.32),
    gas: gas(),
    intakeGas: gas(),
    exhaustGas: gas(),
    flash: new MeshBasicMaterial({ color: '#fff3c9', transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false }),
  }
}

type EngineMaterials = ReturnType<typeof createEngineMaterials>

/* ------------------------------------------------------------------ */
/* Label anchors (world space; the Part groups sit at the origin)       */
/* ------------------------------------------------------------------ */

const at = (p: { z: number; y: number }, x = 0, dy = 0): Vec3 => [x, p.y + dy, p.z]

const LABEL: Record<EnginePartId, Vec3> = {
  'engine-block': [0.05, 1.15, -BLOCK.halfWidth + 0.04],
  cylinder: [0.05, 1.55, 0.47],
  'oil-sump': [0.05, BLOCK.sumpBottomY + 0.1, 0.45],
  crankshaft: [0.42, -0.12, 0],
  flywheel: [FLYWHEEL.x, FLYWHEEL.radius + 0.05, 0],
  'connecting-rod': [0.12, 1.0, 0.1],
  'wrist-pin': [0.36, 1.55, 0],
  piston: [0.3, 1.95, -0.28],
  'piston-rings': [0.42, 1.8, 0.2],
  'combustion-chamber': [0.12, DECK_Y + 0.02, 0],
  'cylinder-head': [0.05, DECK_Y + HEAD.height - 0.05, 0],
  'intake-port': at({ z: HEAD.halfWidth - 0.08, y: DECK_Y + 0.36 }, 0.1),
  'exhaust-port': at({ z: -HEAD.halfWidth + 0.08, y: DECK_Y + 0.36 }, 0.1),
  'spark-plug': [0.05, SPARK_PLUG.terminalTopY + 0.06, 0],
  'intake-valve': at(alongValve(VALVES.intake, 0.28), 0.08),
  'exhaust-valve': at(alongValve(VALVES.exhaust, 0.28), 0.08),
  'valve-spring': at(alongValve(VALVES.intake, 0.62, 0.12), 0.12),
  'cam-follower': at(alongValve(VALVES.exhaust, 0.88, 0.14), 0.14),
  'intake-camshaft': at(camCentre('intake'), 0.32, 0.2),
  'exhaust-camshaft': at(camCentre('exhaust'), 0.32, 0.2),
  'timing-belt': [TIMING.x, DECK_Y + 0.2, 0.45],
}

/** Shared props for every <Part>: its exploded-view offset and label anchor. */
const partProps = (id: EnginePartId) => ({ id, explode: EXPLODE[id], labelAnchor: LABEL[id] })

/* ------------------------------------------------------------------ */
/* Frame helpers                                                        */
/* ------------------------------------------------------------------ */

/** Run `update` every frame with the current crank angle (degrees) and store state. */
function useCrankFrame(update: (crankDeg: number, s: LabState) => void) {
  const store = useLabStoreApi()
  useFrame(() => {
    const s = store.getState()
    update(crankAngleFromProgress(s.progress), s)
  })
}

/**
 * Whether a conceptual overlay (gas, spark flash) should show: not in the
 * exploded view, and not when its owning part is hidden or another part is
 * isolated.
 */
function overlayVisible(s: LabState, owner: string, alsoWith: readonly string[] = []) {
  if (s.exploded || s.hidden[owner]) return false
  return s.isolatedId === null || s.isolatedId === owner || alsoWith.includes(s.isolatedId)
}

/** Places children in a valve's frame: origin at the valve seat, +y up the stem. */
function ValveFrame({ valve, children }: { valve: ValveId; children: ReactNode }) {
  const v = VALVES[valve]
  return (
    <group position={[0, v.seat.y, v.seat.z]} rotation={[v.rotationX, 0, 0]}>
      {children}
    </group>
  )
}

/** Group turned with the crankshaft (rotation about x = crank angle). */
function CrankRotating({ children }: { children: ReactNode }) {
  const ref = useRef<Group>(null)
  useCrankFrame((deg) => {
    if (ref.current) ref.current.rotation.x = deg * DEG
  })
  return <group ref={ref}>{children}</group>
}

/** Group that slides down the valve axis by the (visually scaled) valve lift. */
function Lifted({ valve, children }: { valve: ValveId; children: ReactNode }) {
  const ref = useRef<Group>(null)
  useCrankFrame((deg) => {
    if (ref.current) ref.current.position.y = -visualLift(valve, deg)
  })
  return <group ref={ref}>{children}</group>
}

/* ------------------------------------------------------------------ */
/* Moving assemblies                                                    */
/* ------------------------------------------------------------------ */

function PistonAndRod({ geo, mats }: { geo: EngineGeometries; mats: EngineMaterials }) {
  const piston = useRef<Group>(null)
  const rings = useRef<Group>(null)
  const pin = useRef<Group>(null)
  const rod = useRef<Group>(null)
  useCrankFrame((deg) => {
    // The rod hangs from the wrist pin and is turned by −φ so its big end lands exactly on the crank pin.
    const y = pistonPinHeight(deg) * MM
    for (const g of [piston.current, rings.current, pin.current, rod.current]) if (g) g.position.y = y
    if (rod.current) rod.current.rotation.x = -rodAngle(deg)
  })
  return (
    <>
      <Part {...partProps('piston')}>
        <group ref={piston}>
          <mesh geometry={geo.piston.body} material={mats.piston} />
        </group>
      </Part>
      <Part {...partProps('piston-rings')}>
        <group ref={rings}>
          <mesh geometry={geo.piston.rings} material={mats.rings} />
        </group>
      </Part>
      <Part {...partProps('wrist-pin')}>
        <group ref={pin}>
          <mesh geometry={geo.piston.pin} material={mats.pin} />
        </group>
      </Part>
      <Part {...partProps('connecting-rod')}>
        <group ref={rod}>
          <mesh geometry={geo.rod} material={mats.rod} />
        </group>
      </Part>
    </>
  )
}

function Camshaft({ valve, geo, mats }: { valve: ValveId; geo: EngineGeometries; mats: EngineMaterials }) {
  const ref = useRef<Group>(null)
  useCrankFrame((deg) => {
    // Half crank speed, phased so the lobe nose meets the follower at peak lift.
    if (ref.current) ref.current.rotation.x = camRotation(valve, deg)
  })
  const cam = geo.cams[valve]
  return (
    <Part {...partProps(valve === 'intake' ? 'intake-camshaft' : 'exhaust-camshaft')}>
      <ValveFrame valve={valve}>
        <group ref={ref} position={[0, CAM_LOCAL_Y, 0]}>
          <mesh geometry={cam.shaft} material={mats.cam} />
          <mesh geometry={cam.pulley} material={mats.pulley} />
          <mesh geometry={cam.mark} material={mats.mark} />
        </group>
      </ValveFrame>
    </Part>
  )
}

/** Coil spring squeezed between its fixed seat and the retainer, which moves with the valve. */
function ValveSpring({ valve, geo, mats }: { valve: ValveId; geo: EngineGeometries; mats: EngineMaterials }) {
  const coil = useRef<Mesh>(null)
  const restTop = VALVE_S.retainer - 0.022
  useCrankFrame((deg) => {
    if (coil.current) coil.current.scale.y = restTop - visualLift(valve, deg) - VALVE_S.springSeat
  })
  return (
    <ValveFrame valve={valve}>
      <mesh geometry={geo.spring.seat} material={mats.springSeat} />
      <mesh ref={coil} geometry={geo.spring.coil} material={mats.spring} position={[0, VALVE_S.springSeat, 0]} scale={[1, restTop - VALVE_S.springSeat, 1]} />
      <Lifted valve={valve}>
        <mesh geometry={geo.spring.retainer} material={mats.springSeat} />
      </Lifted>
    </ValveFrame>
  )
}

/** Raised ribs that travel round the timing belt at the crank sprocket's surface speed. */
function BeltRibs({ geo, mats, tier }: { geo: EngineGeometries; mats: EngineMaterials; tier: QualityTier }) {
  const ref = useRef<InstancedMesh>(null)
  const count = tier === 'low' ? 24 : 40
  const sampler = useMemo(() => loopSampler(timingBeltPath(DETAIL[tier].curve)), [tier])
  const dummy = useMemo(() => new Object3D(), [])
  const last = useRef(Number.NaN)
  useCrankFrame((deg) => {
    const mesh = ref.current
    if (!mesh || deg === last.current) return
    last.current = deg
    const travel = beltTravel(deg)
    for (let i = 0; i < count; i++) {
      const { point, tangent } = sampler.at((i * sampler.length) / count + travel)
      dummy.position.set(TIMING.x, point.y, point.z)
      // Local +y → outward normal (tangent rotated −90° on this counter-clockwise loop).
      dummy.rotation.set(Math.atan2(tangent.y, -tangent.z), 0, 0)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[geo.beltRib, mats.belt, count]} frustumCulled={false} />
}

/* ------------------------------------------------------------------ */
/* Conceptual overlays (not components; never selectable)               */
/* ------------------------------------------------------------------ */

const GAS_ISOLATION_PEERS = ['piston', 'cylinder', 'spark-plug'] as const

function GasVolume({ geo, mats }: { geo: EngineGeometries; mats: EngineMaterials }) {
  const group = useRef<Group>(null)
  const column = useRef<Mesh>(null)
  useCrankFrame((deg, s) => {
    const g = group.current
    if (!g) return
    g.visible = overlayVisible(s, 'combustion-chamber', GAS_ISOLATION_PEERS)
    if (!g.visible) return
    const crownY = crownYFromPinMm(pistonPinHeight(deg))
    if (column.current) {
      column.current.position.y = crownY
      column.current.scale.y = Math.max(0.001, DECK_Y - crownY)
    }
    const a = gasAppearance(deg)
    const m = mats.gas
    m.color.setRGB(a.color[0], a.color[1], a.color[2], SRGBColorSpace)
    m.emissive.copy(m.color)
    m.emissiveIntensity = a.glow
    m.opacity = a.opacity
  })
  return (
    <group ref={group}>
      <mesh ref={column} geometry={geo.gas.column} material={mats.gas} renderOrder={2} />
      <mesh geometry={geo.gas.cap} material={mats.gas} renderOrder={2} />
    </group>
  )
}

function PortGas({ valve, geo, mats }: { valve: ValveId; geo: EngineGeometries; mats: EngineMaterials }) {
  const ref = useRef<Mesh>(null)
  const port = valve === 'intake' ? 'intake-port' : 'exhaust-port'
  const valveId = valve === 'intake' ? 'intake-valve' : 'exhaust-valve'
  const material = valve === 'intake' ? mats.intakeGas : mats.exhaustGas
  useCrankFrame((deg, s) => {
    const mesh = ref.current
    if (!mesh) return
    const a = portGasAppearance(valve, deg)
    mesh.visible = a.opacity > 0.005 && overlayVisible(s, port, [valveId])
    if (!mesh.visible) return
    material.color.setRGB(a.color[0], a.color[1], a.color[2], SRGBColorSpace)
    material.emissive.copy(material.color)
    material.emissiveIntensity = a.glow
    material.opacity = a.opacity
  })
  return <mesh ref={ref} geometry={valve === 'intake' ? geo.ports.intakeGas : geo.ports.exhaustGas} material={material} renderOrder={2} />
}

/** Spark flash at the plug gap, plus the conceptual combustion light. */
function SparkAndGlow({ geo, mats, tier }: { geo: EngineGeometries; mats: EngineMaterials; tier: QualityTier }) {
  const flash = useRef<Mesh>(null)
  const light = useRef<PointLight>(null)
  useCrankFrame((deg, s) => {
    const spark = sparkIntensity(deg)
    const showFlash = spark > 0.001 && overlayVisible(s, 'spark-plug', ['combustion-chamber'])
    if (flash.current) {
      flash.current.visible = showFlash
      flash.current.scale.setScalar(0.45 + 1.4 * spark)
      mats.flash.opacity = spark
    }
    if (light.current) {
      const glow = overlayVisible(s, 'combustion-chamber', GAS_ISOLATION_PEERS) ? combustionIntensity(deg) : 0
      light.current.intensity = 3.2 * glow + (showFlash ? 2.2 * spark : 0)
    }
  })
  return (
    <>
      <mesh ref={flash} geometry={geo.flash} material={mats.flash} position={[0.01, SPARK_GAP.y, SPARK_GAP.z]} visible={false} renderOrder={3} />
      {tier === 'high' && <pointLight ref={light} position={[0.38, DECK_Y + 0.02, 0]} color="#ffb04a" intensity={0} distance={3} decay={2} />}
    </>
  )
}

/** Slow presentation sway for the homepage hero (advances only while the lab plays). */
function Sway({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const store = useLabStoreApi()
  const ref = useRef<Group>(null)
  const t = useRef(0)
  useFrame((_, dt) => {
    if (!enabled || !ref.current) return
    if (store.getState().playing) t.current += Math.min(dt, 0.1)
    ref.current.rotation.y = 0.22 * Math.sin(t.current * 0.18)
  })
  return <group ref={ref}>{children}</group>
}

/* ------------------------------------------------------------------ */
/* Scene                                                                */
/* ------------------------------------------------------------------ */

export interface EngineSceneProps {
  tier: QualityTier
  /** Gentle side-to-side presentation sway (hero only; off for reduced motion). */
  sway?: boolean
}

export function EngineScene({ tier, sway = false }: EngineSceneProps) {
  const geo = useMemo(() => buildEngineGeometries(tier), [tier])
  const mats = useMemo(() => createEngineMaterials(), [])
  useEffect(() => () => disposeAll(geo), [geo])
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats])

  return (
    <Sway enabled={sway}>
      {/* Static castings, sectioned at x = 0 */}
      <Part {...partProps('engine-block')}>
        <mesh geometry={geo.block} material={mats.casting} />
        <mesh geometry={geo.section.block} material={mats.section} />
      </Part>
      <Part {...partProps('cylinder')}>
        <mesh geometry={geo.liner} material={mats.liner} />
        <mesh geometry={geo.section.liner} material={mats.section} />
      </Part>
      <Part {...partProps('oil-sump')}>
        <mesh geometry={geo.sump.pan} material={mats.sump} />
        <mesh geometry={geo.sump.oil} material={mats.oil} />
      </Part>
      <Part {...partProps('cylinder-head')}>
        <mesh geometry={geo.head} material={mats.casting} />
        <mesh geometry={geo.section.head} material={mats.section} />
      </Part>
      <Part {...partProps('combustion-chamber')}>
        <mesh geometry={geo.chamber} material={mats.chamber} />
      </Part>
      <Part {...partProps('intake-port')}>
        <mesh geometry={geo.ports.intake} material={mats.port} />
      </Part>
      <Part {...partProps('exhaust-port')}>
        <mesh geometry={geo.ports.exhaust} material={mats.port} />
      </Part>
      <Part {...partProps('spark-plug')}>
        <mesh geometry={geo.plug.shell} material={mats.plugShell} />
        <mesh geometry={geo.plug.insulator} material={mats.insulator} />
      </Part>

      {/* Bottom end: crank, flywheel, piston and rod */}
      <Part {...partProps('crankshaft')}>
        <CrankRotating>
          <mesh geometry={geo.crank.steel} material={mats.crank} />
          <mesh geometry={geo.crank.sprocketMark} material={mats.mark} />
        </CrankRotating>
      </Part>
      <Part {...partProps('flywheel')}>
        <CrankRotating>
          <mesh geometry={geo.crank.flywheel} material={mats.flywheel} />
          <mesh geometry={geo.crank.flywheelMark} material={mats.mark} />
        </CrankRotating>
      </Part>
      <PistonAndRod geo={geo} mats={mats} />

      {/* Valvetrain */}
      {(['intake', 'exhaust'] as const).map((valve) => (
        <Part key={valve} {...partProps(valve === 'intake' ? 'intake-valve' : 'exhaust-valve')}>
          <ValveFrame valve={valve}>
            <Lifted valve={valve}>
              <mesh geometry={geo.valves[valve]} material={valve === 'intake' ? mats.intakeValve : mats.exhaustValve} />
            </Lifted>
          </ValveFrame>
        </Part>
      ))}
      <Part {...partProps('valve-spring')}>
        <ValveSpring valve="intake" geo={geo} mats={mats} />
        <ValveSpring valve="exhaust" geo={geo} mats={mats} />
      </Part>
      <Part {...partProps('cam-follower')}>
        {(['intake', 'exhaust'] as const).map((valve) => (
          <ValveFrame key={valve} valve={valve}>
            <Lifted valve={valve}>
              <mesh geometry={geo.follower.body} material={mats.follower} />
              <mesh geometry={geo.follower.roller} material={mats.pin} />
            </Lifted>
          </ValveFrame>
        ))}
      </Part>
      <Camshaft valve="intake" geo={geo} mats={mats} />
      <Camshaft valve="exhaust" geo={geo} mats={mats} />
      <Part {...partProps('timing-belt')}>
        <mesh geometry={geo.belt} material={mats.belt} />
        <BeltRibs geo={geo} mats={mats} tier={tier} />
      </Part>

      {/* Conceptual visualisation */}
      <GasVolume geo={geo} mats={mats} />
      <PortGas valve="intake" geo={geo} mats={mats} />
      <PortGas valve="exhaust" geo={geo} mats={mats} />
      <SparkAndGlow geo={geo} mats={mats} tier={tier} />
    </Sway>
  )
}
