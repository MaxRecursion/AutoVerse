/**
 * Disc-brake laboratory — 3D scene.
 *
 * MODEL DECISION: the brake corner is ORIGINAL procedural geometry built from
 * brakeParts.ts (ventilated disc, floating single-piston caliper, pads,
 * hub, tone ring and wheel-speed sensor, tyre and rim) plus a hydraulic
 * schematic (pedal, servo, master cylinder, ABS modulator, brake line). The
 * manifest's CC0 Poly Haven "old tyre" was considered and not used: it is a
 * worn, bald prop (the wrong message in a braking lab), it would add a
 * 365 KB download plus meshopt/WebP decoding for one part, and the
 * procedural tyre carries tread blocks and a sidewall mark that make rolling
 * versus locking easy to read.
 *
 * Every moving transform is a pure function of the lab's (progress, params),
 * read in useFrame via store.getState() → stateFor(); there is no per-frame
 * integration. The disc, hub, tone ring and wheel all take their rotation
 * from the single closed-form wheel angle, so they can never drift apart.
 * Fluid colours and the disc's heat glow are a conceptual visualisation.
 */
import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Group,
  type Material,
  type Mesh,
  type MeshStandardMaterialParameters,
} from 'three'
import { useLabStoreApi } from '@/components/three/LabContext'
import { Part } from '@/components/three/Part'
import type { QualityTier } from '@/hooks/useQualityTier'
import { planFor, stateFor, type SurfaceId } from './braking'
import { BRAKE_DETAIL, buildBrakeGeometries, disposeAll } from './brakeGeometry'
import {
  ABS_UNIT,
  AXIS_Y,
  CALIPER,
  CALIPER_FRAME_ROT_X,
  DISC_FACE,
  EXPLODE,
  HUB,
  MASTER,
  PAD_GAP,
  PAD_STACK,
  PEDAL,
  PISTON_LENGTH,
  ROAD,
  SCHEMATIC,
  SENSOR,
  SERVO,
  TYRE,
  UNITS_PER_M,
  brakeLinePoints,
  sensorPoint,
  type BrakePartId,
  type Vec3,
} from './brakeParts'
import { heatGlow, pressureGlow, valveOpenings, type Rgb } from './brakingText'

const DEG = Math.PI / 180

/* ------------------------------------------------------------------ */
/* Materials                                                            */
/* ------------------------------------------------------------------ */

function createBrakeMaterials() {
  const std = (color: string, metalness: number, roughness: number, extra: MeshStandardMaterialParameters = {}) =>
    new MeshStandardMaterial({ color, metalness, roughness, ...extra })
  const glow = () => new MeshBasicMaterial({ color: '#000000', blending: AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false, side: DoubleSide })
  return {
    rubber: std('#1f2125', 0, 0.9),
    tread: std('#141619', 0, 0.95),
    rim: std('#b3b9c1', 0.8, 0.28),
    barrel: std('#7b828b', 0.7, 0.42, { side: DoubleSide }),
    marker: std('#f6a63a', 0.1, 0.5, { emissive: '#f6a63a', emissiveIntensity: 0.35 }),
    hub: std('#959ca5', 0.7, 0.36),
    knuckle: std('#6a717b', 0.55, 0.5),
    disc: std('#80858c', 0.75, 0.42),
    slots: std('#25282d', 0.4, 0.7),
    caliper: std('#76808e', 0.55, 0.38),
    housing: std('#76808e', 0.55, 0.38, { side: DoubleSide }),
    section: std('#8f523d', 0.05, 0.8, { side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    carrier: std('#3a3f47', 0.55, 0.55),
    piston: std('#d9dde2', 0.9, 0.16),
    friction: std('#3d3833', 0, 0.95),
    backing: std('#858b93', 0.6, 0.4),
    pedal: std('#8d939c', 0.65, 0.35),
    servo: std('#262a30', 0.45, 0.45),
    alloy: std('#bcc1c8', 0.7, 0.3, { side: DoubleSide }),
    reservoir: std('#ece8de', 0, 0.3, { transparent: true, opacity: 0.6 }),
    absBlock: std('#a9afb7', 0.75, 0.3),
    line: std('#5c636c', 0.6, 0.4),
    sensor: std('#2b2f35', 0.3, 0.55),
    wire: std('#16181b', 0, 0.7),
    tone: std('#9ba2ab', 0.75, 0.32),
    // Conceptual overlays: colours written every frame.
    fluid: new MeshBasicMaterial({ color: '#1d4d58', toneMapped: false }),
    lamp: new MeshBasicMaterial({ color: '#2a3038', toneMapped: false }),
    heat: glow(),
    pressure: glow(),
    // Road (not a component; never highlighted).
    road: std('#3a3d42', 0.05, 0.9),
    dash: std('#d6d1c4', 0, 0.75),
    skid: new MeshBasicMaterial({ color: '#08090a', transparent: true, opacity: 0.75, depthWrite: false }),
  }
}

type BrakeMaterials = ReturnType<typeof createBrakeMaterials>

const ROAD_LOOK: Record<SurfaceId, { color: string; roughness: number; metalness: number }> = {
  dry: { color: '#3a3d42', roughness: 0.92, metalness: 0.02 },
  wet: { color: '#1f2226', roughness: 0.18, metalness: 0.25 },
  ice: { color: '#9fb4c4', roughness: 0.12, metalness: 0.05 },
}

/* ------------------------------------------------------------------ */
/* Frame helpers                                                        */
/* ------------------------------------------------------------------ */

const FLUID_REST = new Color('#1d4d58')
const FLUID_HOT = new Color('#38d7f2')
const LAMP_OFF = new Color('#2a3038')
const LAMP_IN = new Color('#38d7f2')
const LAMP_OUT = new Color('#f6a63a')

/** Part clones every material, so per-frame colours go to the mesh's own (cloned) material. */
const matOf = (mesh: Mesh | null) => (mesh ? (mesh.material as Material & { color: Color }) : null)

function setGlow(mesh: Mesh | null, color: Rgb, intensity: number) {
  const m = matOf(mesh)
  if (m) m.color.setRGB(color[0] * intensity, color[1] * intensity, color[2] * intensity)
}

const GHOST = 0.1

/**
 * Label anchors are spread so the crowded caliper corner stays readable from the default camera:
 * the sensor's label sits a little rearward of the sensor, clear of the pad labels.
 */
const SENSOR_LABEL: Vec3 = (() => {
  const [x, y, z] = sensorPoint(SENSOR.tipRadius + SENSOR.length + 0.05)
  return [x, y + 0.05, z + 0.45]
})()

/* ------------------------------------------------------------------ */
/* Scene                                                                */
/* ------------------------------------------------------------------ */

export function BrakeScene({ tier }: { tier: QualityTier }) {
  const store = useLabStoreApi()
  const geo = useMemo(() => buildBrakeGeometries(BRAKE_DETAIL[tier]), [tier])
  useEffect(() => () => disposeAll(geo), [geo])
  const mats = useMemo(() => createBrakeMaterials(), [])
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats])

  const wheelSpin = useRef<Group>(null)
  const hubSpin = useRef<Group>(null)
  const discSpin = useRef<Group>(null)
  const toneSpin = useRef<Group>(null)
  const caliperBody = useRef<Group>(null)
  const outerPad = useRef<Group>(null)
  const innerPad = useRef<Group>(null)
  const piston = useRef<Group>(null)
  const caliperFluid = useRef<Mesh>(null)
  const pedalArm = useRef<Group>(null)
  const pushrod = useRef<Group>(null)
  const mcPiston = useRef<Group>(null)
  const mcFluid = useRef<Mesh>(null)
  const lineGlowA = useRef<Mesh>(null)
  const lineGlowB = useRef<Mesh>(null)
  const heatGlowMesh = useRef<Mesh>(null)
  const inletLamp = useRef<Mesh>(null)
  const outletLamp = useRef<Mesh>(null)
  const dashes = useRef<(Mesh | null)[]>([])
  const skid = useRef<Mesh>(null)
  const surface = useRef<SurfaceId | null>(null)

  useFrame(() => {
    const lab = store.getState()
    const st = stateFor(lab.params, lab.progress)
    const plan = planFor(lab.params)
    const ghost = (id: BrakePartId) => (lab.isolatedId !== null && lab.isolatedId !== id ? GHOST : 1)

    // One closed-form wheel angle drives every rotating part (rolling towards −Z ⇒ negative X rotation).
    const spin = -st.wheelAngle
    for (const g of [wheelSpin, hubSpin, discSpin, toneSpin]) if (g.current) g.current.rotation.x = spin

    // Floating caliper: the piston pushes the inner pad out, the reaction pulls the body (and outer pad) in.
    const take = st.padContact * PAD_GAP
    if (innerPad.current) innerPad.current.position.x = take
    if (piston.current) piston.current.position.x = take
    if (caliperBody.current) caliperBody.current.position.x = -take
    if (outerPad.current) outerPad.current.position.x = -take
    const fluid = caliperFluid.current
    if (fluid) {
      const back = geo.caliper.fluidBackX - take
      fluid.position.x = back
      fluid.scale.x = Math.max(0.001, PAD_STACK.pistonFace - PISTON_LENGTH + take - back)
    }

    // Pedal and master cylinder: the pushrod pin travels pinRadius·sin(β); the servo passes that motion on.
    const beta = PEDAL.maxAngleDeg * DEG * st.pedalTravel
    const travel = PEDAL.pushrodPin * Math.sin(beta)
    if (pedalArm.current) pedalArm.current.rotation.z = beta
    if (pushrod.current) pushrod.current.position.x = travel
    if (mcPiston.current) mcPiston.current.position.x = travel
    const mcf = mcFluid.current
    if (mcf) {
      const start = MASTER.x0 + 0.04 + MASTER.pistonLength + travel
      mcf.position.x = start
      mcf.scale.x = Math.max(0.001, MASTER.x1 - start)
    }

    // Conceptual fluid pressure: master side before the ABS valves, caliper side after them.
    const master = pressureGlow(st.masterPressurePa)
    const caliper = pressureGlow(st.caliperPressurePa)
    matOf(mcf)?.color.copy(FLUID_REST).lerp(FLUID_HOT, master.intensity)
    matOf(fluid)?.color.copy(FLUID_REST).lerp(FLUID_HOT, caliper.intensity)
    const lineGhost = ghost('brake-line')
    setGlow(lineGlowA.current, master.color, 0.3 * master.intensity * lineGhost)
    setGlow(lineGlowB.current, caliper.color, 0.3 * caliper.intensity * lineGhost)

    // Conceptual heat map on the disc faces.
    const heat = heatGlow(st.discTempC)
    setGlow(heatGlowMesh.current, heat.color, 0.75 * heat.intensity * ghost('brake-disc'))

    // ABS valve lamps: inlet (cyan) and outlet (amber), lit when open.
    const valves = valveOpenings(st.absValve)
    const absGhost = ghost('abs-modulator')
    matOf(inletLamp.current)?.color.copy(valves.inlet ? LAMP_IN : LAMP_OFF).multiplyScalar(absGhost)
    matOf(outletLamp.current)?.color.copy(valves.outlet ? LAMP_OUT : LAMP_OFF).multiplyScalar(absGhost)

    // Road: markings move with the car's travel; a locked tyre leaves a skid mark.
    const travelled = st.travel * UNITS_PER_M
    dashes.current.forEach((d, i) => {
      if (!d) return
      const z = (((i * ROAD.dashSpacing + travelled) % (ROAD.dashSpacing * ROAD.dashes)) + ROAD.dashSpacing * ROAD.dashes) % (ROAD.dashSpacing * ROAD.dashes)
      d.position.z = z - (ROAD.dashSpacing * ROAD.dashes) / 2
    })
    if (skid.current) {
      const sliding = plan.mode === 'lock' && st.t > plan.tLimit ? (st.travel - plan.atLimit.x) * UNITS_PER_M : 0
      const len = Math.min(ROAD.length / 2, Math.max(0, sliding))
      skid.current.visible = len > 0.02
      skid.current.scale.z = Math.max(0.001, len)
    }
    if (surface.current !== plan.params.surface) {
      surface.current = plan.params.surface
      const look = ROAD_LOOK[plan.params.surface]
      mats.road.color.set(look.color)
      mats.road.roughness = look.roughness
      mats.road.metalness = look.metalness
    }
  })

  const line = useMemo(() => brakeLinePoints(), [])
  const lineLabel: Vec3 = line.b[2]

  return (
    <group>
      {/* ---------------- Wheel, hub, disc ---------------- */}
      <Part id="braked-wheel" explode={EXPLODE['braked-wheel']} labelAnchor={[TYRE.x - 0.3, TYRE.radius + 0.15, 0.4]}>
        <group ref={wheelSpin}>
          <mesh geometry={geo.wheel.tyre} material={mats.rubber} />
          <mesh geometry={geo.wheel.tread} material={mats.tread} />
          <mesh geometry={geo.wheel.rim} material={mats.rim} />
          <mesh geometry={geo.wheel.barrel} material={mats.barrel} />
          <mesh geometry={geo.wheel.marker} material={mats.marker} />
        </group>
      </Part>

      <Part id="hub-flange" explode={EXPLODE['hub-flange']} labelAnchor={[HUB.knuckleInboardX + 0.05, -0.38, 0.1]}>
        <group ref={hubSpin}>
          <mesh geometry={geo.hub.spin} material={mats.hub} />
        </group>
        <mesh geometry={geo.hub.knuckle} material={mats.knuckle} />
      </Part>

      <Part id="brake-disc" explode={EXPLODE['brake-disc']} labelAnchor={[DISC_FACE.inboard - 0.05, -0.62, 0.42]}>
        <group ref={discSpin}>
          <mesh geometry={geo.disc.body} material={mats.disc} />
          <mesh geometry={geo.disc.slots} material={mats.slots} />
        </group>
        {/* The glow is a heat map of the whole disc, so it does not need to turn. */}
        <mesh ref={heatGlowMesh} geometry={geo.disc.glow} material={mats.heat} renderOrder={2} />
      </Part>

      <Part id="wheel-speed-sensor" explode={EXPLODE['wheel-speed-sensor']} labelAnchor={SENSOR_LABEL}>
        <group ref={toneSpin}>
          <mesh geometry={geo.tone.ring} material={mats.tone} />
        </group>
        <mesh geometry={geo.tone.sensorBody} material={mats.sensor} />
        <mesh geometry={geo.tone.wire} material={mats.wire} />
      </Part>

      {/* ---------------- Caliper (frame: +Y radial) ---------------- */}
      <group rotation={[CALIPER_FRAME_ROT_X, 0, 0]}>
        <Part id="brake-caliper" explode={EXPLODE['brake-caliper']} labelAnchor={[CALIPER.housingBackX, CALIPER.bridgeOuterRadius + 0.14, 0]}>
          <group ref={caliperBody}>
            <mesh geometry={geo.caliper.housing} material={mats.housing} />
            <mesh geometry={geo.caliper.housingSection} material={mats.section} />
            <mesh geometry={geo.caliper.body} material={mats.caliper} />
          </group>
          <mesh geometry={geo.caliper.carrier} material={mats.carrier} />
          <mesh ref={caliperFluid} geometry={geo.caliper.fluid} material={mats.fluid} />
        </Part>
        <Part id="caliper-piston" explode={EXPLODE['caliper-piston']} labelAnchor={[PAD_STACK.pistonFace - PISTON_LENGTH, CALIPER.centreRadius - 0.3, -0.05]}>
          <group ref={piston}>
            <mesh geometry={geo.caliper.piston} material={mats.piston} />
          </group>
        </Part>
        <Part id="inner-brake-pad" explode={EXPLODE['inner-brake-pad']} labelAnchor={[PAD_STACK.innerBacking - 0.1, CALIPER.padInnerRadius - 0.1, 0.32]}>
          <group ref={innerPad}>
            <mesh geometry={geo.caliper.innerFriction} material={mats.friction} />
            <mesh geometry={geo.caliper.innerBacking} material={mats.backing} />
          </group>
        </Part>
        <Part id="outer-brake-pad" explode={EXPLODE['outer-brake-pad']} labelAnchor={[PAD_STACK.outerBacking + 0.1, CALIPER.padOuterRadius, 0.45]}>
          <group ref={outerPad}>
            <mesh geometry={geo.caliper.outerFriction} material={mats.friction} />
            <mesh geometry={geo.caliper.outerBacking} material={mats.backing} />
          </group>
        </Part>
      </group>

      {/* ---------------- Hydraulic schematic (plane: +X pedal → ABS) ---------------- */}
      <group position={SCHEMATIC.position} rotation={[0, SCHEMATIC.rotY, 0]}>
        <Part id="brake-pedal" explode={EXPLODE['brake-pedal']} labelAnchor={[0.05, PEDAL.pivot[1] - PEDAL.length - 0.22, 0]}>
          <group ref={pedalArm} position={[PEDAL.pivot[0], PEDAL.pivot[1], 0]}>
            <mesh geometry={geo.schematic.pedalArm} material={mats.pedal} />
          </group>
          <mesh geometry={geo.schematic.pedalBracket} material={mats.knuckle} position={[PEDAL.pivot[0], PEDAL.pivot[1], 0]} />
          <group ref={pushrod}>
            <mesh geometry={geo.schematic.pushrod} material={mats.pedal} />
          </group>
        </Part>
        <Part id="brake-servo" explode={EXPLODE['brake-servo']} labelAnchor={[(SERVO.x0 + SERVO.x1) / 2, AXIS_Y + SERVO.radius + 0.14, 0]}>
          <mesh geometry={geo.schematic.servo} material={mats.servo} />
        </Part>
        <Part id="master-cylinder" explode={EXPLODE['master-cylinder']} labelAnchor={[(MASTER.x0 + MASTER.x1) / 2, AXIS_Y - MASTER.radius - 0.16, 0]}>
          <mesh geometry={geo.schematic.mcShell} material={mats.alloy} />
          <mesh geometry={geo.schematic.mcSection} material={mats.section} />
          <mesh geometry={geo.schematic.reservoir} material={mats.reservoir} />
          <group ref={mcPiston}>
            <mesh geometry={geo.schematic.mcPiston} material={mats.piston} />
          </group>
          <mesh ref={mcFluid} geometry={geo.schematic.mcFluid} material={mats.fluid} />
        </Part>
        <Part id="abs-modulator" explode={EXPLODE['abs-modulator']} labelAnchor={[ABS_UNIT.x, AXIS_Y + ABS_UNIT.height / 2 + 0.3, 0]}>
          <mesh geometry={geo.schematic.absBlock} material={mats.absBlock} />
          <mesh ref={inletLamp} geometry={geo.schematic.inletLamp} material={mats.lamp} />
          <mesh ref={outletLamp} geometry={geo.schematic.outletLamp} material={mats.lamp} />
        </Part>
      </group>

      <Part id="brake-line" explode={EXPLODE['brake-line']} labelAnchor={lineLabel}>
        <mesh geometry={geo.lines.lineA} material={mats.line} />
        <mesh geometry={geo.lines.lineB} material={mats.line} />
        <mesh ref={lineGlowA} geometry={geo.lines.glowA} material={mats.pressure} renderOrder={2} />
        <mesh ref={lineGlowB} geometry={geo.lines.glowB} material={mats.pressure} renderOrder={2} />
      </Part>

      {/* ---------------- Road (context only) ---------------- */}
      <Road geo={geo} mats={mats} dashes={dashes} skid={skid} />
    </group>
  )
}

function Road({
  geo,
  mats,
  dashes,
  skid,
}: {
  geo: ReturnType<typeof buildBrakeGeometries>
  mats: BrakeMaterials
  dashes: RefObject<(Mesh | null)[]>
  skid: RefObject<Mesh | null>
}) {
  const edgeX = ROAD.x - ROAD.width / 2 + 0.16
  return (
    <group position={[0, ROAD.y, 0]}>
      <mesh geometry={geo.road.road} material={mats.road} position={[ROAD.x, 0, 0]} raycast={() => null} />
      {Array.from({ length: ROAD.dashes }, (_, i) => (
        <mesh
          key={i}
          ref={(m) => {
            dashes.current[i] = m
          }}
          geometry={geo.road.dash}
          material={mats.dash}
          position={[edgeX, 0.003, 0]}
          raycast={() => null}
        />
      ))}
      <mesh ref={skid} geometry={geo.road.skid} material={mats.skid} position={[TYRE.x, 0.004, 0]} visible={false} raycast={() => null} />
    </group>
  )
}
