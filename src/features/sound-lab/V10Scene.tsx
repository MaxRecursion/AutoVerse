/**
 * Sound Lab — the dedicated V10 scene inside EngineCutaway (the other presets
 * use Codex's CutawayScene). Same props, same frame bus, same demand rendering.
 *
 * Whole engine: all ten cylinders on one crankshaft of five throws, both banks
 * at the engine's true angle, bank B one rod width behind bank A so a shared
 * crankpin visibly carries two rods and split pins sit 18° apart. Every
 * repeated part is an InstancedMesh (one draw call per part and bank), and
 * hot exhaust gas flows out of each cylinder when its exhaust valve opens,
 * through the headers, collectors and tailpipes and out into the air
 * (ExhaustSystem). Valve timing and the travel delay along each route
 * determine when the flows mix in each exhaust.
 *
 * Cylinder cutaway: the selected cylinder's throw as a full Engine Lab-style
 * section of both banks, the block cut down the middle of the vee.
 *
 * Every cylinder is the Engine Lab's illustrative cylinder; layout, crankpins,
 * firing timing and exhaust routing come from the preset (v10Layout.ts).
 */
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Html } from '@react-three/drei'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import {
  AdditiveBlending,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Plane,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
  type Group,
  type InstancedMesh,
  type Material,
  type Mesh,
  type MeshStandardMaterialParameters,
} from 'three'
import { useHtmlLayer } from '@/components/three/htmlLayer'
import type { QualityTier } from '@/hooks/useQualityTier'
import { cn } from '@/lib/utils'
import { CAM_LOCAL_Y, buildEngineGeometries, type EngineGeometries } from '@/features/engine-lab/engineGeometry'
import {
  DECK_Y,
  MM,
  SPARK_GAP,
  SPARK_PLUG,
  VALVES,
  VALVE_S,
  camRotation,
  crownYFromPinMm,
  gasAppearance,
  portGasAppearance,
  visualLift,
} from '@/features/engine-lab/engineModel'
import { pistonPinHeight, rodAngle, sparkIntensity, type ValveId } from '@/features/engine-lab/kinematics'
import type { EngineFrame, FrameBus } from './animation'
import type { CutawaySceneProps } from './CutawayScene'
import type { EngineSpec } from './engines'
import { exhaustDrawing } from './exhaust'
import { ExhaustSystem, type ExhaustDrawing } from './ExhaustSystem'
import type { FiringEvent } from './firing'
import {
  BANK_STAGGER,
  LABEL_HEIGHT,
  camDirection,
  cycleAngle,
  exhaustLayout,
  leanAngle,
  moduleCrankDeg,
  toWorld,
  v10Model,
  type V10Cylinder,
  type V10Side,
} from './v10Layout'

const DEG = Math.PI / 180
const VALVE_IDS: readonly ValveId[] = ['intake', 'exhaust']
const SPRING_REST_TOP = VALVE_S.retainer - 0.022

/* ------------------------------------------------------------ shared resources */

/** The Engine Lab cylinder, built once per detail level and kept for every visit (never disposed). */
const geometryCache = new Map<QualityTier, EngineGeometries>()
function geometriesFor(tier: QualityTier): EngineGeometries {
  let geometries = geometryCache.get(tier)
  if (!geometries) {
    geometries = buildEngineGeometries(tier)
    geometryCache.set(tier, geometries)
  }
  return geometries
}

/** The Engine Lab's palette. */
function createMaterials() {
  const std = (color: string, metalness: number, roughness: number, extra: MeshStandardMaterialParameters = {}) =>
    new MeshStandardMaterial({ color, metalness, roughness, ...extra })
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
    flywheel: std('#7d848e', 0.7, 0.4),
    plugShell: std('#bcc1c7', 0.75, 0.28),
    insulator: std('#ece8df', 0, 0.32),
    injector: std('#6a9aab', 0.75, 0.25),
    selection: new MeshBasicMaterial({ color: '#38d7f2', transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false }),
    // Instanced, so colour per cylinder comes from instance colours; unlit so the glow reads.
    gas: new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.34, depthWrite: false, side: DoubleSide }),
    flash: new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95, blending: AdditiveBlending, depthWrite: false, toneMapped: false }),
  }
}
type Materials = ReturnType<typeof createMaterials>

/** Small extra shapes: the diesel injector and its spray, the selection ring. */
function createExtras() {
  const injector = new CylinderGeometry(0.04, 0.065, 0.66, 12)
  injector.translate(0, SPARK_PLUG.tipY + 0.3, 0)
  const spray = new ConeGeometry(0.11, 0.26, 14, 1, true)
  spray.translate(0, SPARK_PLUG.tipY - 0.13, 0)
  return { injector, spray, ring: new TorusGeometry(0.5, 0.016, 6, 40) }
}
type Extras = ReturnType<typeof createExtras>

/* ------------------------------------------------------------ one cylinder's pose */

interface Pose {
  /** Crank rotation inside the cylinder's own (perhaps mirrored) frame, radians. */
  crank: number
  pinY: number
  rod: number
  lift: [number, number]
  cam: [number, number]
  crownY: number
  cycle: number
}

function poseOf(c: V10Cylinder, firingAngle: number, sense: 1 | -1, playhead: number): Pose {
  const phi = moduleCrankDeg(sense, c.mirror, playhead, firingAngle)
  const cycle = cycleAngle(playhead, firingAngle)
  const dir = camDirection(sense, c.mirror)
  const pinMm = pistonPinHeight(phi)
  return {
    crank: phi * DEG,
    pinY: pinMm * MM,
    rod: -rodAngle(phi),
    lift: [visualLift('intake', cycle), visualLift('exhaust', cycle)],
    cam: [dir * camRotation('intake', cycle), dir * camRotation('exhaust', cycle)],
    crownY: crownYFromPinMm(pinMm),
    cycle,
  }
}

/** Valve frames (seat position, tilted stem), as in the Engine Lab. */
const VALVE_FRAME = VALVE_IDS.map((v) => new Matrix4().makeRotationX(VALVES[v].rotationX).setPosition(0, VALVES[v].seat.y, VALVES[v].seat.z))

const firingOf = (c: V10Cylinder, events: FiringEvent[]) => events[c.event.index]?.angle ?? c.event.angle

/* ------------------------------------------------------------ scene entry */

/** Same props as CutawayScene, so EngineCutaway can switch on the preset. */
export function V10Scene({ spec, events, bankAngle, sense, bus, tier, view, selectedIndex, onSelect }: CutawaySceneProps) {
  const invalidate = useThree((state) => state.invalidate)
  const gl = useThree((state) => state.gl)
  // Demand rendering: draw whenever the frame loop moves.
  useEffect(() => bus.subscribe(() => invalidate()), [bus, invalidate])
  // The cylinder cutaway cuts each bank's casting at the middle of the vee.
  useEffect(() => {
    gl.localClippingEnabled = true
  }, [gl])
  const { cylinders } = useMemo(() => v10Model(spec), [spec])
  const mats = useMemo(() => createMaterials(), [])
  const extras = useMemo(() => createExtras(), [])
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats])
  useEffect(() => () => Object.values(extras).forEach((g) => g.dispose()), [extras])
  const selected = cylinders.find((c) => c.event.index === selectedIndex) ?? cylinders[0]!
  const diesel = spec.ignition === 'compression'
  const shared = { cylinders, events, sense, bus, bankAngle, mats, extras, diesel, spec, tier }

  return view === 'engine' ? (
    <WholeEngine {...shared} geo={geometriesFor('low')} sharedExhaust={!spec.separateBanks} selected={selected} onSelect={onSelect} />
  ) : (
    <ThrowCutaway {...shared} geo={geometriesFor(tier)} throwIndex={selected.throwIndex} selectedIndex={selected.event.index} />
  )
}

interface CommonProps {
  spec: EngineSpec
  tier: QualityTier
  cylinders: V10Cylinder[]
  events: FiringEvent[]
  sense: 1 | -1
  bus: FrameBus
  bankAngle: number
  mats: Materials
  extras: Extras
  diesel: boolean
  geo: EngineGeometries
}

/* ------------------------------------------------------------ whole engine (instanced) */

type PartLocal = (pose: Pose, copy: number, out: Matrix4) => Matrix4

interface PartDef {
  key: string
  geometry: BufferGeometry
  material: Material
  /** Instances per cylinder: two for parts that exist once per valve. */
  per: 1 | 2
  local: PartLocal
}

const scratch = { a: new Matrix4(), b: new Matrix4() }
const identity: PartLocal = (_p, _k, out) => out.identity()
const atPin: PartLocal = (p, _k, out) => out.makeTranslation(0, p.pinY, 0)
const lifted: PartLocal = (p, k, out) => out.copy(VALVE_FRAME[k]!).multiply(scratch.a.makeTranslation(0, -p.lift[k]!, 0))

function partDefs(geo: EngineGeometries, mats: Materials, extras: Extras, diesel: boolean): PartDef[] {
  const parts: PartDef[] = [
    { key: 'liner', geometry: geo.liner, material: mats.liner, per: 1, local: identity },
    { key: 'liner-section', geometry: geo.section.liner, material: mats.section, per: 1, local: identity },
    { key: 'chamber', geometry: geo.chamber, material: mats.chamber, per: 1, local: identity },
    { key: 'port-intake', geometry: geo.ports.intake, material: mats.port, per: 1, local: identity },
    { key: 'port-exhaust', geometry: geo.ports.exhaust, material: mats.port, per: 1, local: identity },
    { key: 'crank', geometry: geo.crank.steel, material: mats.crank, per: 1, local: (p, _k, out) => out.makeRotationX(p.crank) },
    { key: 'piston', geometry: geo.piston.body, material: mats.piston, per: 1, local: atPin },
    { key: 'rings', geometry: geo.piston.rings, material: mats.rings, per: 1, local: atPin },
    { key: 'wrist-pin', geometry: geo.piston.pin, material: mats.pin, per: 1, local: atPin },
    { key: 'rod', geometry: geo.rod, material: mats.rod, per: 1, local: (p, _k, out) => out.makeRotationX(p.rod).setPosition(0, p.pinY, 0) },
    { key: 'valve-intake', geometry: geo.valves.intake, material: mats.intakeValve, per: 1, local: (p, _k, out) => lifted(p, 0, out) },
    { key: 'valve-exhaust', geometry: geo.valves.exhaust, material: mats.exhaustValve, per: 1, local: (p, _k, out) => lifted(p, 1, out) },
    { key: 'retainer', geometry: geo.spring.retainer, material: mats.springSeat, per: 2, local: lifted },
    { key: 'follower', geometry: geo.follower.body, material: mats.follower, per: 2, local: lifted },
    { key: 'spring-seat', geometry: geo.spring.seat, material: mats.springSeat, per: 2, local: (_p, k, out) => out.copy(VALVE_FRAME[k]!) },
    {
      key: 'spring',
      geometry: geo.spring.coil,
      material: mats.spring,
      per: 2,
      local: (p, k, out) =>
        out
          .copy(VALVE_FRAME[k]!)
          .multiply(scratch.a.makeTranslation(0, VALVE_S.springSeat, 0))
          .multiply(scratch.b.makeScale(1, SPRING_REST_TOP - p.lift[k]! - VALVE_S.springSeat, 1)),
    },
    {
      key: 'cam-intake',
      geometry: geo.cams.intake.shaft,
      material: mats.cam,
      per: 1,
      local: (p, _k, out) => out.copy(VALVE_FRAME[0]!).multiply(scratch.a.makeRotationX(p.cam[0]).setPosition(0, CAM_LOCAL_Y, 0)),
    },
    {
      key: 'cam-exhaust',
      geometry: geo.cams.exhaust.shaft,
      material: mats.cam,
      per: 1,
      local: (p, _k, out) => out.copy(VALVE_FRAME[1]!).multiply(scratch.a.makeRotationX(p.cam[1]).setPosition(0, CAM_LOCAL_Y, 0)),
    },
  ]
  if (diesel) parts.push({ key: 'injector', geometry: extras.injector, material: mats.injector, per: 1, local: identity })
  else {
    parts.push({ key: 'plug', geometry: geo.plug.shell, material: mats.plugShell, per: 1, local: identity })
    parts.push({ key: 'insulator', geometry: geo.plug.insulator, material: mats.insulator, per: 1, local: identity })
  }
  return parts
}

interface WholeEngineProps extends CommonProps {
  sharedExhaust: boolean
  selected: V10Cylinder
  onSelect: (index: number) => void
}

function WholeEngine({ spec, tier, cylinders, events, sense, bus, bankAngle, mats, extras, diesel, geo, sharedExhaust, selected, onSelect }: WholeEngineProps) {
  const banks = useMemo(() => ({ A: cylinders.filter((c) => c.side === 'A'), B: cylinders.filter((c) => c.side === 'B') }), [cylinders])
  const parts = useMemo(() => partDefs(geo, mats, extras, diesel), [geo, mats, extras, diesel])
  const meshes = useRef(new Map<string, InstancedMesh>())
  const gas = useRef(new Map<string, InstancedMesh>())
  const flashes = useRef(new Map<V10Side, InstancedMesh>())
  const flywheel = useRef<Group>(null)
  const ring = useRef<Group>(null)
  const labels = useRef(new Map<number, Group>())
  const rear = cylinders.find((c) => c.side === 'A' && c.throwIndex === 4)!
  const last = useRef({ playhead: Number.NaN, bank: Number.NaN, animate: false })

  useFrame(() => {
    const frame = bus.last
    const playhead = frame?.playhead ?? 0
    const bank = frame?.bank ?? bankAngle
    const animate = frame?.animate ?? false
    const prev = last.current
    if (prev.playhead === playhead && prev.bank === bank && prev.animate === animate) return
    last.current = { playhead, bank, animate }
    writeInstances(frame, playhead, bank, animate)
  })

  const color = useMemo(() => new Color(), [])
  const base = useMemo(() => new Matrix4(), [])
  const local = useMemo(() => new Matrix4(), [])
  const instance = useMemo(() => new Matrix4(), [])

  function writeInstances(_frame: EngineFrame | null, playhead: number, bank: number, animate: boolean) {
    const half = (bank / 2) * DEG
    for (const side of ['A', 'B'] as const) {
      banks[side].forEach((c, i) => {
        const pose = poseOf(c, firingOf(c, events), sense, playhead)
        // Both banks: T(x)·Rx(−half). Bank A's meshes are mirrored as objects (z → −z), which turns this into its own lean.
        base.makeRotationX(-half).setPosition(c.x, 0, 0)
        for (const part of parts) {
          const mesh = meshes.current.get(`${side}:${part.key}`)
          if (!mesh) continue
          for (let k = 0; k < part.per; k++) mesh.setMatrixAt(i * part.per + k, instance.multiplyMatrices(base, part.local(pose, k, local)))
        }
        // The charge in the cylinder: colour and glow from the Engine Lab's conceptual gas.
        const a = gasAppearance(pose.cycle)
        const glow = animate ? a.glow : 0
        color.setRGB(a.color[0], a.color[1], a.color[2], SRGBColorSpace).multiplyScalar(0.55 + 0.8 * glow)
        const column = gas.current.get(`${side}:column`)
        const cap = gas.current.get(`${side}:cap`)
        if (column) {
          column.setMatrixAt(i, instance.multiplyMatrices(base, local.makeScale(1, Math.max(0.001, DECK_Y - pose.crownY), 1).setPosition(0, pose.crownY, 0)))
          column.setColorAt(i, color)
        }
        if (cap) {
          cap.setMatrixAt(i, base)
          cap.setColorAt(i, color)
        }
        // Spark (petrol) or injection (diesel): only while the engine turns.
        const spark = animate ? sparkIntensity(pose.cycle) : 0
        const flash = flashes.current.get(side)
        if (flash) {
          const s = spark > 0.001 ? (diesel ? 0.6 + 1.2 * spark : 0.45 + 1.4 * spark) : 0
          flash.setMatrixAt(i, instance.multiplyMatrices(base, diesel ? local.makeScale(s, s, s) : local.makeScale(s, s, s).setPosition(0.01, SPARK_GAP.y, SPARK_GAP.z)))
          flash.setColorAt(i, color.set(diesel ? '#ffd27a' : '#fff3c9').multiplyScalar(spark))
        }
        // The flywheel is not mirrored or leaned: give it the crank's angle in the scene (lean + mirror·φ), so it turns with the shaft.
        if (c === rear && flywheel.current) flywheel.current.rotation.x = leanAngle(c.side, bank) + c.mirror * pose.crank
        const label = labels.current.get(c.event.index)
        if (label) label.position.set(...toWorld(c.side, bank, c.x, { z: 0, y: LABEL_HEIGHT }))
        if (c === selected && ring.current) {
          ring.current.position.set(...toWorld(c.side, bank, c.x, { z: 0, y: DECK_Y + 0.06 }))
          ring.current.rotation.set(leanAngle(c.side, bank) + Math.PI / 2, 0, 0)
        }
      })
    }
    for (const mesh of [...meshes.current.values(), ...gas.current.values(), ...flashes.current.values()]) {
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
  }

  // Write the first pose as soon as the meshes exist (before any frame arrives).
  useEffect(() => {
    last.current = { playhead: Number.NaN, bank: Number.NaN, animate: false }
  }, [parts, cylinders, events, selected])

  const pick = (side: V10Side) => (e: ThreeEvent<MouseEvent>) => {
    if (e.instanceId === undefined) return
    e.stopPropagation()
    const c = banks[side][e.instanceId]
    if (c) onSelect(c.event.index)
  }

  return (
    <group name="v10-whole-engine">
      {(['A', 'B'] as const).map((side) => (
        // Bank A is drawn as a mirror image (z → −z) so its exhausts face out of the vee.
        <group key={side} scale={[1, 1, side === 'A' ? -1 : 1]}>
          {parts.map((part) => (
            <instancedMesh
              key={part.key}
              ref={(mesh) => {
                if (mesh) meshes.current.set(`${side}:${part.key}`, mesh)
                else meshes.current.delete(`${side}:${part.key}`)
              }}
              args={[part.geometry, part.material, 5 * part.per]}
              frustumCulled={false}
              onClick={part.key === 'liner' || part.key === 'piston' ? pick(side) : undefined}
            />
          ))}
          {(['column', 'cap'] as const).map((piece) => (
            <instancedMesh
              key={piece}
              ref={(mesh) => {
                if (mesh) gas.current.set(`${side}:${piece}`, mesh)
                else gas.current.delete(`${side}:${piece}`)
              }}
              args={[piece === 'column' ? geo.gas.column : geo.gas.cap, mats.gas, 5]}
              frustumCulled={false}
              renderOrder={2}
            />
          ))}
          <instancedMesh
            ref={(mesh) => {
              if (mesh) flashes.current.set(side, mesh)
              else flashes.current.delete(side)
            }}
            args={[diesel ? extras.spray : geo.flash, mats.flash, 5]}
            frustumCulled={false}
            renderOrder={3}
          />
        </group>
      ))}
      <group ref={flywheel} position={[rear.x, 0, 0]}>
        <mesh geometry={geo.crank.flywheel} material={mats.flywheel} />
      </group>
      <group ref={ring}>
        <mesh geometry={extras.ring} material={mats.selection} />
      </group>
      <V10Exhaust spec={spec} tier={tier} cylinders={cylinders} events={events} bus={bus} bankAngle={bankAngle} shared={sharedExhaust} full />
      {cylinders.map((c) => (
        <group
          key={c.event.index}
          ref={(g) => {
            if (g) labels.current.set(c.event.index, g)
            else labels.current.delete(c.event.index)
          }}
        >
          <Tag text={String(c.event.cylinder ?? c.side)} side={c.side} strong={c.throwIndex === selected.throwIndex} />
        </group>
      ))}
    </group>
  )
}

/* ------------------------------------------------------------ exhausts */

interface V10ExhaustProps {
  spec: EngineSpec
  tier: QualityTier
  cylinders: V10Cylinder[]
  events: FiringEvent[]
  bus: FrameBus
  bankAngle: number
  shared: boolean
  /** Whole engine: collectors, tailpipes and the plume too. Otherwise each header stops just past its bend. */
  full: boolean
}

/** This V10's headers, collectors and tailpipes, carrying its valve-timed exhaust gas. */
function V10Exhaust({ spec, tier, cylinders, events, bus, bankAngle, shared, full }: V10ExhaustProps) {
  const drawing = useCallback((bank: number): ExhaustDrawing => exhaustDrawing(exhaustLayout(cylinders, bank, shared), full), [cylinders, shared, full])
  const bankOf = useCallback((frameBank: number | null) => frameBank ?? bankAngle, [bankAngle])
  const firingAngle = useCallback((index: number) => events[index]?.angle ?? cylinders.find((c) => c.event.index === index)?.event.angle ?? 0, [events, cylinders])
  return <ExhaustSystem drawing={drawing} bankOf={bankOf} firingAngle={firingAngle} bus={bus} plume={full} spec={spec} tier={tier} />
}

/* ------------------------------------------------------------ one throw, full cutaway */

interface ThrowProps extends CommonProps {
  throwIndex: number
  selectedIndex: number
}

/** Both cylinders of one throw, full castings, each bank's casting cut at the middle of the vee. */
function ThrowCutaway({ spec, tier, cylinders, events, sense, bus, bankAngle, mats, extras, diesel, geo, throwIndex, selectedIndex }: ThrowProps) {
  // Centre the throw at the origin: bank A at x = 0, bank B one rod width behind.
  const pair = useMemo(
    () =>
      cylinders
        .filter((c) => c.throwIndex === throwIndex)
        .sort((a, b) => (a.side < b.side ? -1 : 1))
        .map((c) => ({ ...c, x: c.side === 'B' ? -BANK_STAGGER : 0 })),
    [cylinders, throwIndex],
  )
  return (
    <group name="v10-throw-cutaway">
      {pair.map((c) => (
        <SectionedCylinder key={c.event.index} c={c} events={events} sense={sense} bus={bus} bankAngle={bankAngle} mats={mats} extras={extras} diesel={diesel} geo={geo} selected={c.event.index === selectedIndex} />
      ))}
      <V10Exhaust spec={spec} tier={tier} cylinders={pair} events={events} bus={bus} bankAngle={bankAngle} shared={false} full={false} />
    </group>
  )
}

interface SectionedProps {
  c: V10Cylinder
  events: FiringEvent[]
  sense: 1 | -1
  bus: FrameBus
  bankAngle: number
  mats: Materials
  extras: Extras
  diesel: boolean
  geo: EngineGeometries
  selected: boolean
}

function SectionedCylinder({ c, events, sense, bus, bankAngle, mats, extras, diesel, geo, selected }: SectionedProps) {
  // Each bank keeps its own side of the vee's middle plane (z = 0) for the block and liner castings.
  const cut = useMemo(() => {
    const plane = c.side === 'A' ? new Plane(new Vector3(0, 0, 1), 0) : new Plane(new Vector3(0, 0, -1), 0)
    const clip = (m: MeshStandardMaterial) => {
      const copy = m.clone()
      copy.clippingPlanes = [plane]
      return copy
    }
    const gas = () =>
      new MeshStandardMaterial({ color: '#38d7f2', metalness: 0, roughness: 0.9, transparent: true, opacity: 0.3, depthWrite: false, side: DoubleSide, emissive: '#000000' })
    return {
      casting: clip(mats.casting),
      section: clip(mats.section),
      liner: clip(mats.liner),
      gas: gas(),
      intakeGas: gas(),
      exhaustGas: gas(),
      flash: new MeshBasicMaterial({ color: diesel ? '#ffd27a' : '#fff3c9', transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false }),
    }
  }, [c.side, mats, diesel])
  useEffect(() => () => Object.values(cut).forEach((m) => m.dispose()), [cut])

  const lean = useRef<Group>(null)
  const crank = useRef<Group>(null)
  const piston = useRef<Group>(null)
  const rod = useRef<Group>(null)
  const intakeLift = useRef<Group>(null)
  const exhaustLift = useRef<Group>(null)
  const intakeCoil = useRef<Mesh>(null)
  const exhaustCoil = useRef<Mesh>(null)
  const intakeCam = useRef<Group>(null)
  const exhaustCam = useRef<Group>(null)
  const intakePort = useRef<Mesh>(null)
  const exhaustPort = useRef<Mesh>(null)
  const valveRefs = {
    intake: { lift: intakeLift, coil: intakeCoil, cam: intakeCam, port: intakePort, gas: cut.intakeGas },
    exhaust: { lift: exhaustLift, coil: exhaustCoil, cam: exhaustCam, port: exhaustPort, gas: cut.exhaustGas },
  }
  const column = useRef<Mesh>(null)
  const flash = useRef<Mesh>(null)

  useFrame(() => {
    const frame = bus.last
    const playhead = frame?.playhead ?? 0
    const animate = frame?.animate ?? false
    if (lean.current) lean.current.rotation.x = leanAngle(c.side, frame?.bank ?? bankAngle)
    const pose = poseOf(c, firingOf(c, events), sense, playhead)
    if (crank.current) crank.current.rotation.x = pose.crank
    if (piston.current) piston.current.position.y = pose.pinY
    if (rod.current) {
      rod.current.position.y = pose.pinY
      rod.current.rotation.x = pose.rod
    }
    VALVE_IDS.forEach((valve, k) => {
      const r = valveRefs[valve]
      const l = r.lift.current
      const coil = r.coil.current
      const cam = r.cam.current
      const port = r.port.current
      if (l) l.position.y = -pose.lift[k]!
      if (coil) coil.scale.y = SPRING_REST_TOP - pose.lift[k]! - VALVE_S.springSeat
      if (cam) cam.rotation.x = pose.cam[k]!
      if (port) {
        const a = portGasAppearance(valve, pose.cycle)
        const material = r.gas
        port.visible = a.opacity > 0.005
        material.color.setRGB(a.color[0], a.color[1], a.color[2], SRGBColorSpace)
        material.emissive.copy(material.color)
        material.emissiveIntensity = animate ? a.glow : 0
        material.opacity = a.opacity
      }
    })
    if (column.current) {
      column.current.position.y = pose.crownY
      column.current.scale.y = Math.max(0.001, DECK_Y - pose.crownY)
    }
    const a = gasAppearance(pose.cycle)
    cut.gas.color.setRGB(a.color[0], a.color[1], a.color[2], SRGBColorSpace)
    cut.gas.emissive.copy(cut.gas.color)
    cut.gas.emissiveIntensity = animate ? a.glow : 0
    cut.gas.opacity = a.opacity
    const spark = animate ? sparkIntensity(pose.cycle) : 0
    if (flash.current) {
      flash.current.visible = spark > 0.001
      flash.current.scale.setScalar(diesel ? 0.7 + 0.9 * spark : 0.45 + 1.4 * spark)
    }
    cut.flash.opacity = spark
  })

  const v = VALVE_IDS.map((valve) => VALVES[valve])
  return (
    <group ref={lean} position={[c.x, 0, 0]} rotation={[leanAngle(c.side, bankAngle), 0, 0]}>
      <group scale={[1, 1, c.mirror]}>
        <mesh geometry={geo.block} material={cut.casting} />
        <mesh geometry={geo.section.block} material={cut.section} />
        <mesh geometry={geo.liner} material={cut.liner} />
        <mesh geometry={geo.section.liner} material={cut.section} />
        <mesh geometry={geo.head} material={mats.casting} />
        <mesh geometry={geo.section.head} material={mats.section} />
        <mesh geometry={geo.chamber} material={mats.chamber} />
        <mesh geometry={geo.ports.intake} material={mats.port} />
        <mesh geometry={geo.ports.exhaust} material={mats.port} />
        {diesel ? (
          <mesh geometry={extras.injector} material={mats.injector} />
        ) : (
          <>
            <mesh geometry={geo.plug.shell} material={mats.plugShell} />
            <mesh geometry={geo.plug.insulator} material={mats.insulator} />
          </>
        )}
        <group ref={crank}>
          <mesh geometry={geo.crank.steel} material={mats.crank} />
        </group>
        <group ref={piston}>
          <mesh geometry={geo.piston.body} material={mats.piston} />
          <mesh geometry={geo.piston.rings} material={mats.rings} />
          <mesh geometry={geo.piston.pin} material={mats.pin} />
        </group>
        <group ref={rod}>
          <mesh geometry={geo.rod} material={mats.rod} />
        </group>
        {VALVE_IDS.map((valve, k) => (
          <group key={valve} position={[0, v[k]!.seat.y, v[k]!.seat.z]} rotation={[v[k]!.rotationX, 0, 0]}>
            <group ref={valveRefs[valve].lift}>
              <mesh geometry={geo.valves[valve]} material={valve === 'intake' ? mats.intakeValve : mats.exhaustValve} />
              <mesh geometry={geo.spring.retainer} material={mats.springSeat} />
              <mesh geometry={geo.follower.body} material={mats.follower} />
              <mesh geometry={geo.follower.roller} material={mats.pin} />
            </group>
            <mesh geometry={geo.spring.seat} material={mats.springSeat} />
            <mesh ref={valveRefs[valve].coil} geometry={geo.spring.coil} material={mats.spring} position={[0, VALVE_S.springSeat, 0]} scale={[1, SPRING_REST_TOP - VALVE_S.springSeat, 1]} />
            <group ref={valveRefs[valve].cam} position={[0, CAM_LOCAL_Y, 0]}>
              <mesh geometry={geo.cams[valve].shaft} material={mats.cam} />
              <mesh geometry={geo.cams[valve].pulley} material={mats.pulley} />
            </group>
          </group>
        ))}
        <mesh ref={column} geometry={geo.gas.column} material={cut.gas} renderOrder={2} />
        <mesh geometry={geo.gas.cap} material={cut.gas} renderOrder={2} />
        <mesh ref={intakePort} geometry={geo.ports.intakeGas} material={cut.intakeGas} renderOrder={2} visible={false} />
        <mesh ref={exhaustPort} geometry={geo.ports.exhaustGas} material={cut.exhaustGas} renderOrder={2} visible={false} />
        <mesh
          ref={flash}
          geometry={diesel ? extras.spray : geo.flash}
          material={cut.flash}
          position={diesel ? [0, 0, 0] : [0.01, SPARK_GAP.y, SPARK_GAP.z]}
          visible={false}
          renderOrder={3}
        />
      </group>
      <group position={[0.2, LABEL_HEIGHT, 0]}>
        <Tag text={String(c.event.cylinder ?? c.side)} side={c.side} strong={selected} />
      </group>
    </group>
  )
}

/* ------------------------------------------------------------ labels */

/** Cylinder number in its bank's colour. Decorative: the canvas label and the buttons carry the meaning. */
function Tag({ text, side, strong }: { text: string; side: V10Side; strong: boolean }) {
  const portal = useHtmlLayer()
  return (
    <Html portal={portal} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
      <span
        aria-hidden
        className={cn(
          'block whitespace-nowrap rounded border px-1.5 py-0.5 font-mono text-[11px] font-semibold leading-none backdrop-blur-sm',
          side === 'B' ? 'border-amber/50 text-amber' : 'border-cyan/50 text-cyan',
          strong ? 'bg-graphite-850/95 ring-1 ring-paper/40' : 'bg-graphite-950/75',
        )}
      >
        {text}
      </span>
    </Html>
  )
}
