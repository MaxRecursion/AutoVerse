/**
 * Original multi-cylinder teaching cutaway, built from AutoVerse's detailed
 * procedural engine parts. Cylinder count, bank arrangement and firing phase
 * follow the preset; bore proportions and the two-valve DOHC valvetrain are
 * illustrative rather than OEM CAD. One geometry set is shared by every
 * cylinder and disposed by the scene, never by individual meshes.
 */
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import {
  AdditiveBlending,
  BoxGeometry,
  CylinderGeometry,
  DoubleSide,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SRGBColorSpace,
  TorusGeometry,
  type Group,
  type Mesh,
  type MeshStandardMaterialParameters,
  type PointLight,
} from 'three'
import type { QualityTier } from '@/hooks/useQualityTier'
import { CAM_LOCAL_Y, buildEngineGeometries, disposeAll, type EngineGeometries } from '@/features/engine-lab/engineGeometry'
import {
  DECK_Y,
  SPARK_GAP,
  SPARK_PLUG,
  VALVES,
  VALVE_S,
  camRotation,
  gasAppearance,
  portGasAppearance,
  visualLift,
} from '@/features/engine-lab/engineModel'
import { combustionIntensity, sparkIntensity, type ValveId } from '@/features/engine-lab/kinematics'
import { bankAxis, DEG, type FrameBus } from './animation'
import { CUTAWAY_PITCH, cutawayLayout, cutawayState, type CutawayCylinder } from './cutawayMath'
import type { EngineSpec } from './engines'
import type { FiringEvent } from './firing'

export interface CutawaySceneProps {
  spec: EngineSpec
  events: FiringEvent[]
  bankAngle: number
  sense: 1 | -1
  bus: FrameBus
  tier: QualityTier
  view: 'engine' | 'detail'
  /** Firing-event index, including presets without published maker numbering. */
  selectedIndex: number
  onSelect: (index: number) => void
}

function createMaterials() {
  const metal = (color: string, metalness = 0.65, roughness = 0.35, extra: MeshStandardMaterialParameters = {}) =>
    new MeshStandardMaterial({ color, metalness, roughness, ...extra })
  return {
    casting: metal('#8c939c', 0.55, 0.46),
    section: metal('#975c44', 0.05, 0.8, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    liner: metal('#adb6c3', 0.8, 0.27),
    chamber: metal('#535f70', 0.65, 0.45, { side: DoubleSide }),
    port: metal('#6f7f91', 0.6, 0.5, { side: DoubleSide }),
    crank: metal('#c2ccd7', 0.75, 0.26),
    rod: metal('#b8c1cf', 0.7, 0.3),
    piston: metal('#e4e8ee', 0.6, 0.28),
    rings: metal('#303c4b', 0.85, 0.35),
    pin: metal('#dfe9f3', 0.85, 0.18),
    intake: metal('#c3d0dc', 0.7, 0.28),
    exhaust: metal('#c4a485', 0.65, 0.34),
    spring: metal('#5e8eb6', 0.65, 0.3),
    retainer: metal('#b3c2ce', 0.7, 0.3),
    cam: metal('#c6d0db', 0.75, 0.25),
    pulley: metal('#334355', 0.75, 0.35),
    belt: metal('#19222e', 0, 0.8),
    mark: metal('#f6a63a', 0.2, 0.4, { emissive: '#f6a63a', emissiveIntensity: 0.45 }),
    flywheel: metal('#7d8da2', 0.7, 0.4),
    sump: metal('#26364a', 0.5, 0.5),
    oil: metal('#8f5c17', 0.1, 0.15, { transparent: true, opacity: 0.7 }),
    plug: metal('#b4c5d8', 0.75, 0.25),
    insulator: metal('#eee8dc', 0, 0.32),
    injector: metal('#6a9aab', 0.75, 0.25),
    selection: new MeshBasicMaterial({ color: '#38d7f2', transparent: true, opacity: 0.75, depthWrite: false, toneMapped: false }),
  }
}

type Materials = ReturnType<typeof createMaterials>

function createGasMaterials() {
  const gas = () => new MeshStandardMaterial({
    color: '#38d7f2', roughness: 0.9, transparent: true, opacity: 0.3,
    depthWrite: false, side: DoubleSide, emissive: '#38d7f2', emissiveIntensity: 0.1,
  })
  return {
    charge: gas(), intake: gas(), exhaust: gas(),
    flash: new MeshBasicMaterial({ color: '#fff0b2', transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false }),
  }
}

function ValveFrame({ valve, children }: { valve: ValveId; children: ReactNode }) {
  const v = VALVES[valve]
  return <group position={[0, v.seat.y, v.seat.z]} rotation={[v.rotationX, 0, 0]}>{children}</group>
}

interface ValveRefs {
  lifted: Group | null
  spring: Mesh | null
  cam: Group | null
  flow: Mesh | null
}

const restSpringHeight = VALVE_S.retainer - 0.022 - VALVE_S.springSeat

function ValveAssembly({ valve, geo, mats, refs, timing }: { valve: ValveId; geo: EngineGeometries; mats: Materials; refs: ValveRefs; timing: boolean }) {
  const parts = geo.cams[valve]
  return (
    <>
      <ValveFrame valve={valve}>
        <mesh geometry={geo.spring.seat} material={mats.retainer} />
        <mesh ref={(mesh) => { refs.spring = mesh }} geometry={geo.spring.coil} material={mats.spring} position={[0, VALVE_S.springSeat, 0]} scale={[1, restSpringHeight, 1]} />
        <group ref={(group) => { refs.lifted = group }}>
          <mesh geometry={geo.valves[valve]} material={valve === 'intake' ? mats.intake : mats.exhaust} />
          <mesh geometry={geo.spring.retainer} material={mats.retainer} />
          <mesh geometry={geo.follower.body} material={mats.retainer} />
          <mesh geometry={geo.follower.roller} material={mats.pin} />
        </group>
        <group ref={(group) => { refs.cam = group }} position={[0, CAM_LOCAL_Y, 0]}>
          <mesh geometry={parts.shaft} material={mats.cam} />
          {timing && <mesh geometry={parts.pulley} material={mats.pulley} />}
          {timing && <mesh geometry={parts.mark} material={mats.mark} />}
        </group>
      </ValveFrame>
    </>
  )
}

function setGas(material: MeshStandardMaterial, appearance: ReturnType<typeof gasAppearance>) {
  material.color.setRGB(...appearance.color, SRGBColorSpace)
  material.emissive.copy(material.color)
  material.emissiveIntensity = appearance.glow
  material.opacity = appearance.opacity
}

interface CylinderProps {
  cylinder: CutawayCylinder
  spec: EngineSpec
  bankAngle: number
  sense: 1 | -1
  bus: FrameBus
  geo: EngineGeometries
  mats: Materials
  selectionGeometry: TorusGeometry
  injectorGeometry: CylinderGeometry
  detail: boolean
  selected: boolean
  endAssembly: boolean
  timing: boolean
  light: boolean
  onSelect: (index: number) => void
}

/** Every moving part reads one shared timeline; React only handles preset/view/selection changes. */
function Cylinder({ cylinder, spec, bankAngle, sense, bus, geo, mats, selectionGeometry, injectorGeometry, detail, selected, endAssembly, timing, light, onSelect }: CylinderProps) {
  const bank = useRef<Group>(null)
  const piston = useRef<Group>(null)
  const rod = useRef<Group>(null)
  const crank = useRef<Group>(null)
  const gas = useRef<Mesh>(null)
  const flash = useRef<Mesh>(null)
  const glow = useRef<PointLight>(null)
  const valves = useMemo<Record<ValveId, ValveRefs>>(() => ({
    intake: { lifted: null, spring: null, cam: null, flow: null },
    exhaust: { lifted: null, spring: null, cam: null, flow: null },
  }), [])
  // Gas colour is per-cylinder; sharing it would make all ten cylinders show the same stroke.
  const gases = useMemo(() => createGasMaterials(), [])
  useEffect(() => () => Object.values(gases).forEach((material) => material.dispose()), [gases])
  const last = useRef({ playhead: Number.NaN, bank: Number.NaN, firingAngle: Number.NaN, sense, animate: false })
  const diesel = spec.ignition === 'compression'
  const initial = cutawayState(0, cylinder.event.angle, sense)

  useFrame(() => {
    const frame = bus.last
    const playhead = frame?.playhead ?? 0
    const drawnBank = detail ? 0 : spec.layout === 'flat' ? 180 : frame?.bank ?? bankAngle
    const animate = frame?.animate ?? false
    // A crankpin experiment can change a cylinder's phase while the crank is stopped.
    const firingAngle = cylinder.event.angle
    if (last.current.playhead === playhead && last.current.bank === drawnBank && last.current.firingAngle === firingAngle && last.current.sense === sense && last.current.animate === animate) return
    last.current = { playhead, bank: drawnBank, firingAngle, sense, animate }
    const state = cutawayState(playhead, cylinder.event.angle, sense)
    if (bank.current) bank.current.rotation.x = detail ? 0 : bankAxis(cylinder.side, drawnBank) * DEG
    if (piston.current) piston.current.position.y = state.pistonY
    if (rod.current) {
      rod.current.position.y = state.pistonY
      rod.current.rotation.x = state.rodRotation
    }
    if (crank.current) crank.current.rotation.x = state.mechanicalDeg * DEG
    for (const valve of ['intake', 'exhaust'] as const) {
      const r = valves[valve]
      const lift = visualLift(valve, state.cycleDeg)
      if (r.lifted) r.lifted.position.y = -lift
      if (r.spring) r.spring.scale.y = Math.max(0.01, restSpringHeight - lift)
      if (r.cam) r.cam.rotation.x = sense * camRotation(valve, state.cycleDeg)
      const appearance = portGasAppearance(valve, state.cycleDeg)
      if (r.flow) r.flow.visible = appearance.opacity > 0.005
      setGas(gases[valve], appearance)
    }
    if (gas.current) {
      gas.current.position.y = state.crownY
      gas.current.scale.y = Math.max(0.001, DECK_Y - state.crownY)
    }
    setGas(gases.charge, gasAppearance(state.cycleDeg))
    const ignition = animate ? sparkIntensity(state.cycleDeg) : 0
    if (flash.current) {
      flash.current.visible = ignition > 0.001
      flash.current.scale.setScalar(diesel ? 0.8 + ignition * 1.8 : 0.4 + ignition * 1.4)
      gases.flash.opacity = ignition
    }
    if (glow.current) glow.current.intensity = animate ? 2.2 * combustionIntensity(state.cycleDeg) : 0
  })

  const pick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    onSelect(cylinder.event.index)
  }

  return (
    <group ref={bank} position={[detail ? 0 : cylinder.x, 0, 0]} rotation={[detail ? 0 : bankAxis(cylinder.side, bankAngle) * DEG, 0, 0]} onClick={pick} userData={{ cylinder: cylinder.event.cylinder ?? cylinder.event.bank, eventIndex: cylinder.event.index }}>
      {detail && (
        <>
          <mesh geometry={geo.block} material={mats.casting} />
          <mesh geometry={geo.section.block} material={mats.section} />
          <mesh geometry={geo.head} material={mats.casting} />
          <mesh geometry={geo.section.head} material={mats.section} />
          <mesh geometry={geo.sump.pan} material={mats.sump} />
          <mesh geometry={geo.sump.oil} material={mats.oil} />
        </>
      )}
      <mesh geometry={geo.liner} material={mats.liner} />
      <mesh geometry={geo.section.liner} material={detail ? mats.section : mats.liner} />
      <mesh geometry={geo.chamber} material={mats.chamber} />
      <mesh geometry={geo.ports.intake} material={mats.port} />
      <mesh geometry={geo.ports.exhaust} material={mats.port} />
      <mesh ref={(mesh) => { valves.intake.flow = mesh }} geometry={geo.ports.intakeGas} material={gases.intake} renderOrder={2} />
      <mesh ref={(mesh) => { valves.exhaust.flow = mesh }} geometry={geo.ports.exhaustGas} material={gases.exhaust} renderOrder={2} />

      <group ref={piston} position={[0, initial.pistonY, 0]}>
        <mesh geometry={geo.piston.body} material={mats.piston} />
        <mesh geometry={geo.piston.rings} material={mats.rings} />
        <mesh geometry={geo.piston.pin} material={mats.pin} />
      </group>
      <group ref={rod} position={[0, initial.pistonY, 0]} rotation={[initial.rodRotation, 0, 0]}>
        <mesh geometry={geo.rod} material={mats.rod} />
      </group>
      <group ref={crank} rotation={[initial.mechanicalDeg * DEG, 0, 0]}>
        {(detail || cylinder.showCrank) && <mesh geometry={geo.crank.steel} material={mats.crank} />}
        {timing && <mesh geometry={geo.crank.sprocketMark} material={mats.mark} />}
        {endAssembly && <mesh geometry={geo.crank.flywheel} material={mats.flywheel} />}
        {endAssembly && <mesh geometry={geo.crank.flywheelMark} material={mats.mark} />}
      </group>
      <ValveAssembly valve="intake" geo={geo} mats={mats} refs={valves.intake} timing={timing} />
      <ValveAssembly valve="exhaust" geo={geo} mats={mats} refs={valves.exhaust} timing={timing} />
      {timing && <mesh geometry={geo.belt} material={mats.belt} />}
      {diesel ? (
        <mesh geometry={injectorGeometry} material={mats.injector} />
      ) : (
        <>
          <mesh geometry={geo.plug.shell} material={mats.plug} />
          <mesh geometry={geo.plug.insulator} material={mats.insulator} />
        </>
      )}
      <mesh ref={gas} geometry={geo.gas.column} material={gases.charge} position={[0, initial.crownY, 0]} scale={[1, Math.max(0.001, DECK_Y - initial.crownY), 1]} renderOrder={2} />
      <mesh geometry={geo.gas.cap} material={gases.charge} renderOrder={2} />
      <mesh ref={flash} geometry={geo.flash} material={gases.flash} position={[0.01, SPARK_GAP.y, SPARK_GAP.z]} visible={false} renderOrder={3} />
      {selected && !detail && <mesh geometry={selectionGeometry} material={mats.selection} position={[0, DECK_Y + 0.08, 0]} rotation={[Math.PI / 2, 0, 0]} />}
      {light && <pointLight ref={glow} color="#ffb14a" position={[0.32, DECK_Y, 0]} intensity={0} distance={3} decay={2} />}
    </group>
  )
}

export function CutawayScene({ spec, events, bankAngle, sense, bus, tier, view, selectedIndex, onSelect }: CutawaySceneProps) {
  const invalidate = useThree((state) => state.invalidate)
  useEffect(() => bus.subscribe(() => invalidate()), [bus, invalidate])
  const geometryTier = view === 'engine' && spec.cylinders > 4 ? 'low' : tier
  const geo = useMemo(() => buildEngineGeometries(geometryTier), [geometryTier])
  const mats = useMemo(() => createMaterials(), [])
  const placement = useMemo(() => cutawayLayout(spec, events, bankAngle, sense), [spec, events, bankAngle, sense])
  const slots = spec.layout === 'inline' ? spec.cylinders : spec.cylinders / 2
  const length = (slots - 1) * CUTAWAY_PITCH + 1.2
  const extras = useMemo(() => {
    const rail = new BoxGeometry(length + 0.8, 0.12, 1.1)
    rail.translate(0, -0.85, 0)
    const bearing = new BoxGeometry(0.2, 0.6, 0.45)
    bearing.translate(0, -0.45, 0)
    const shaft = new CylinderGeometry(0.105, 0.105, length + 0.3, 20)
    shaft.rotateZ(Math.PI / 2)
    const selection = new TorusGeometry(0.52, 0.015, 6, 32)
    const injector = new CylinderGeometry(0.04, 0.065, 0.66, 12)
    injector.translate(0, SPARK_PLUG.tipY + 0.3, 0)
    return { rail, bearing, shaft, selection, injector }
  }, [length])
  useEffect(() => () => disposeAll(geo), [geo])
  useEffect(() => () => disposeAll(extras), [extras])
  useEffect(() => () => Object.values(mats).forEach((material) => material.dispose()), [mats])
  const detail = view === 'detail'
  const selected = placement.find((cylinder) => cylinder.event.index === selectedIndex) ?? placement[0]
  const visible = detail && selected ? [selected] : placement

  return (
    <group dispose={null} name="production-engine-cutaway">
      {!detail && (
        <>
          <mesh geometry={extras.rail} material={mats.sump} />
          <mesh geometry={extras.shaft} material={mats.crank} />
          {Array.from({ length: slots }, (_, slot) => <mesh key={slot} geometry={extras.bearing} material={mats.sump} position={[(slot - (slots - 1) / 2) * CUTAWAY_PITCH, 0, 0]} />)}
        </>
      )}
      {visible.map((cylinder) => (
        <Cylinder
          key={cylinder.event.index}
          cylinder={cylinder}
          spec={spec}
          bankAngle={bankAngle}
          sense={sense}
          bus={bus}
          geo={geo}
          mats={mats}
          selectionGeometry={extras.selection}
          injectorGeometry={extras.injector}
          detail={detail}
          selected={cylinder.event.index === selectedIndex}
          endAssembly={detail || (cylinder.slot === 0 && cylinder.side !== 'B')}
          timing={detail || cylinder.slot === slots - 1}
          light={tier === 'high' && (detail || cylinder.event.index === selectedIndex)}
          onSelect={onSelect}
        />
      ))}
    </group>
  )
}
