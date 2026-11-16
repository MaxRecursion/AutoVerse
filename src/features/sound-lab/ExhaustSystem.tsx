/**
 * The exhaust of a Sound Lab cutaway: pipes, and the gas flowing through them
 * and out of the tailpipes (exhaustGas.ts). Shared by CutawayScene and
 * V10Scene. The scene describes its plumbing at a bank angle; this component
 * rebuilds the pipes and the gas when the drawn bank angle moves (at most ten
 * times a second while the bank-angle experiment eases, then once more where
 * it settles). Every frame it hands the gas shader each cylinder's clock (the
 * degrees since its exhaust valve opened, the share of the cycle's gas out so
 * far and which cycle this is), a motion blur over the frame's crank step, and
 * what the engine is doing: revs and throttle set how hot and thick the gas
 * is, and the pipes cool it by the second. Gas only flows while the engine
 * turns: stopped, or with reduced motion, the pipes stay empty and cool, like
 * the rest of the scene's flow cues.
 *
 * The pipe gas draws before the see-through pipe walls, so it sits inside them;
 * the plumes draw after. The walls are clear face-on and solid at their edges,
 * and the first stretch of each header glows dull red after sustained hard
 * running.
 */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { CatmullRomCurve3, Float32BufferAttribute, MeshStandardMaterial, TubeGeometry, Vector3, type BufferGeometry, type Group, type Mesh } from 'three'
import type { QualityTier } from '@/hooks/useQualityTier'
import { merge } from '@/features/engine-lab/engineGeometry'
import { useTheme } from '@/features/theme/theme'
import { ease, mod, type FrameBus } from './animation'
import type { EngineSpec } from './engines'
import {
  LABEL_WRAP_CYCLES,
  SMEAR_MAX_DEG,
  approachWallHeat,
  exhaustDrive,
  exhaustedShare,
  headerHeat,
  portFlowOver,
  slotClock,
  wallHeatTarget,
  type ExhaustDrawing,
  type ExhaustPipe,
} from './exhaust'
import { MAX_GAS_SLOTS, buildGasGeometry, createGasMaterial, createPlumeMaterial, plumeNoiseStep, wrapNoise, type GasRoute } from './exhaustGas'

export type { ExhaustDrawing, ExhaustPipe, ExhaustRoute } from './exhaust'

interface ExhaustSystemProps {
  /** The pipes and each cylinder's route with the banks this far apart. */
  drawing: (bankAngle: number) => ExhaustDrawing
  /** The bank angle as drawn now (the bank-angle experiment eases it), from the frame when there is one. */
  bankOf: (frameBank: number | null) => number
  /** A cylinder's current firing angle (a crankpin experiment can change it). */
  firingAngle: (index: number) => number
  bus: FrameBus
  /** Whole engine: gas leaves the tailpipes as a plume. Single-cylinder views stop at a header stub. */
  plume: boolean
  spec: Pick<EngineSpec, 'idleRpm' | 'redlineRpm' | 'ignition'>
  tier: QualityTier
}

/** Crank degrees the gas keeps count of after a start: enough to fill the longest route and its plume. */
const RUN_CAP = 4000
/** Radians the eddies turn round the pipe per crank degree. */
const SWIRL_PER_DEG = 0.0035
/** Shortest time between rebuilds while the bank angle eases, ms. */
const REBUILD_GAP_MS = 100
/** Seconds for the rev limiter's fuel cut to cool the gas (and to recover). */
const CUT_S = 0.25
/** Samples of the motion blur when a cylinder's current flow is worked out on the CPU. */
const SMEAR_SAMPLES = 4

function pipeGeometry(pipes: ExhaustPipe[]): BufferGeometry {
  const tubes = pipes.map(({ points, radius, header }) => {
    const curve = new CatmullRomCurve3(points.map((p) => new Vector3(...p)), false, 'catmullrom', 0.2)
    const tube = new TubeGeometry(curve, Math.max(16, points.length * 10), radius, 8, false)
    // Heat along the pipe, from its distance from the port (uv.x runs along the tube).
    const uv = tube.getAttribute('uv')
    const length = curve.getLength()
    const heat = new Float32Array(uv.count)
    if (header) for (let i = 0; i < uv.count; i++) heat[i] = headerHeat(uv.getX(i) * length)
    tube.setAttribute('aHeat', new Float32BufferAttribute(heat, 1))
    return tube
  })
  return merge(tubes)
}

/** Pipe walls: clear face-on so the gas shows, solid at the edges, and a header glow driven by `uWallHeat`. */
function createPipeMaterial() {
  const wallHeat = { value: 0 }
  const material = new MeshStandardMaterial({ name: 'Exhaust pipe', color: '#9aa3ae', metalness: 0.55, roughness: 0.32, transparent: true, opacity: 1, depthWrite: false })
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWallHeat = wallHeat
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aHeat;\nvarying float vHeat;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHeat = aHeat;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uWallHeat;\nvarying float vHeat;')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\nfloat wallGlow = smoothstep(0.12, 1.0, uWallHeat * vHeat);\ntotalEmissiveRadiance += mix(vec3(0.45, 0.03, 0.0), vec3(0.95, 0.17, 0.02), wallGlow) * wallGlow * 1.5;',
      )
      .replace(
        '#include <opaque_fragment>',
        // Glowing metal shows more solidly, but stays see-through enough for the gas surging inside.
        'float wallFacing = abs(dot(normal, normalize(vViewPosition)));\ndiffuseColor.a = max(mix(0.68, 0.14, wallFacing * wallFacing), 0.5 * wallGlow);\n#include <opaque_fragment>',
      )
  }
  material.customProgramCacheKey = () => 'exhaust-pipe-1'
  return { material, wallHeat }
}

interface Built {
  bank: number
  at: number
  pipes: BufferGeometry | null
  gas: BufferGeometry | null
  plumes: BufferGeometry | null
  slots: number[]
}

const unbuilt = (): Built => ({ bank: Number.NaN, at: -Infinity, pipes: null, gas: null, plumes: null, slots: [] })

export function ExhaustSystem({ drawing, bankOf, firingAngle, bus, plume, spec, tier }: ExhaustSystemProps) {
  const group = useRef<Group>(null)
  const pipes = useRef<Mesh>(null)
  const gas = useRef<Mesh>(null)
  const plumes = useRef<Mesh>(null)
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)
  const invalidate = useThree((state) => state.invalidate)
  const theme = useTheme()
  const material = useMemo(() => createGasMaterial(tier), [tier])
  // Shares the gas material's uniforms, so every update below reaches the plumes too.
  const plumeMaterial = useMemo(() => createPlumeMaterial(material), [material])
  const pipe = useMemo(() => createPipeMaterial(), [])
  useEffect(() => () => material.dispose(), [material])
  useEffect(() => () => plumeMaterial.dispose(), [plumeMaterial])
  useEffect(() => () => pipe.material.dispose(), [pipe])
  const built = useRef<Built>(unbuilt())
  const flow = useRef({ playhead: Number.NaN, lap: 0, plumeShift: 0, swirl: 0, run: 0, wallHeat: 0, cut: 0, wallAt: Number.NaN })
  const warmed = useRef<typeof material | null>(null)

  // A new drawing (preset, view, layout) or detail level rebuilds on the next frame, without waiting.
  useEffect(() => {
    built.current.bank = Number.NaN
    built.current.at = -Infinity
    invalidate()
  }, [drawing, tier, plume, invalidate])
  useEffect(
    () => () => {
      built.current.pipes?.dispose()
      built.current.gas?.dispose()
      built.current.plumes?.dispose()
      built.current = unbuilt()
    },
    [],
  )
  // The light theme darkens the gas's haze; redraw a sleeping scene when it changes.
  useEffect(() => {
    material.uniforms.uLight.value = theme === 'light' ? 1 : 0
    invalidate()
  }, [material, theme, invalidate])

  useFrame(() => {
    const frame = bus.last
    const now = typeof performance !== 'undefined' ? performance.now() : 0
    const bank = Math.round(bankOf(frame?.bank ?? null) * 2) / 2
    const b = built.current
    const u = material.uniforms
    if (bank !== b.bank || !b.gas) {
      if (b.gas && now - b.at < REBUILD_GAP_MS) {
        // Easing: rebuild a little later, and ask for that frame in case the engine is stopped.
        invalidate()
      } else {
        const { pipes: pipeList, routes } = drawing(bank)
        const slotted = routes.slice(0, MAX_GAS_SLOTS)
        const gasRoutes: GasRoute[] = slotted.map((route, slot) => ({ slot, points: route.points, segments: route.segments, feeds: route.feeds, headerLength: route.headerLength, plume }))
        const next = buildGasGeometry(gasRoutes, tier)
        b.pipes?.dispose()
        b.gas?.dispose()
        b.plumes?.dispose()
        b.pipes = pipeGeometry(pipeList)
        b.gas = next.pipes
        b.plumes = next.plumes
        u.uOutletTime.value.set(next.outletTime)
        u.uHeaderLength.value.set(next.headerLength)
        b.slots = slotted.map((route) => route.index)
        b.bank = bank
        b.at = now
        if (pipes.current) pipes.current.geometry = b.pipes
        if (gas.current) gas.current.geometry = b.gas
        if (plumes.current && b.plumes) plumes.current.geometry = b.plumes
      }
    }

    // Warm only this exhaust, once its real attributes exist. Compiling the whole
    // scene on mount used placeholder geometry and could compile unrelated materials.
    if (group.current && b.gas && warmed.current !== material) {
      warmed.current = material
      if (gl.extensions.has('KHR_parallel_shader_compile')) gl.compileAsync(group.current, camera, scene).catch(() => {})
      else gl.compile(group.current, camera, scene)
    }

    const animate = frame?.animate ?? false
    const f = flow.current
    const show = (visible: boolean) => {
      if (gas.current) gas.current.visible = visible
      if (plumes.current) plumes.current.visible = visible && !!b.plumes
    }
    if (!animate || !frame) {
      // Stopped (or reduced motion): no flow, cool pipes. The next start fills the pipes from the ports again.
      f.playhead = Number.NaN
      f.run = 0
      f.wallHeat = 0
      f.cut = 0
      f.wallAt = Number.NaN
      pipe.wallHeat.value = 0
      u.uOpacity.value = 0
      show(false)
      return
    }
    const step = Number.isNaN(f.playhead) ? 0 : mod(frame.playhead - f.playhead, 720)
    // A jump (a reset or an experiment) is not flow.
    const moved = step < 360 ? step : 0
    // Count the playhead's 720° wraps, so each cylinder's cycle (and the gas labels) can run on.
    if (moved > 0 && frame.playhead < f.playhead) f.lap = (f.lap + 1) % LABEL_WRAP_CYCLES
    f.playhead = frame.playhead
    // Turbulence in the plume drifts and swirls; both wrap without a seam.
    f.plumeShift = wrapNoise(f.plumeShift + plumeNoiseStep(moved))
    f.swirl = mod(f.swirl + moved * SWIRL_PER_DEG, Math.PI * 2)
    f.run = Math.min(RUN_CAP, f.run + moved)
    // Blur flow over this frame's crank step, so bursts do not strobe at high revs.
    const smear = Math.min(SMEAR_MAX_DEG, moved)
    b.slots.forEach((index, slot) => {
      const clock = slotClock(frame.playhead, f.lap, firingAngle(index))
      u.uSlot.value[slot]!.set(clock.since, exhaustedShare(clock.since), clock.cycle, portFlowOver(clock.since, smear, SMEAR_SAMPLES))
    })
    const drive = exhaustDrive(frame, spec)
    const diesel = spec.ignition === 'compression'
    // Consume elapsed bus time once: camera redraws may reuse a tick, while a
    // slower renderer may skip ticks. Neither should change how fast metal heats.
    const wallDt = Number.isNaN(f.wallAt) ? 0 : Math.max(0, (frame.now - f.wallAt) / 1000)
    f.wallAt = frame.now
    f.wallHeat = approachWallHeat(f.wallHeat, wallHeatTarget(drive.load, diesel), wallDt)
    // The rev limiter cuts fuel: the gas runs cooler until it recovers.
    f.cut = ease(f.cut, drive.cut, wallDt, CUT_S)
    pipe.wallHeat.value = f.wallHeat
    u.uSmear.value = smear
    u.uMass.value = drive.mass
    u.uHeat.value = drive.heat * (1 - 0.5 * f.cut)
    // Gas waiting in a hot header stays warm.
    u.uFloorTemp.value = 0.22 + 0.4 * f.wallHeat
    u.uAgeScale.value = drive.ageScale
    u.uPlumeShift.value = f.plumeShift
    u.uSwirl.value = f.swirl
    u.uRun.value = f.run
    u.uLoad.value = drive.load
    u.uDiesel.value = diesel ? 1 : 0
    u.uOpacity.value = 1
    show(true)
  })

  return (
    <group name="exhaust" ref={group} dispose={null}>
      <mesh name="exhaust-pipes" ref={pipes} material={pipe.material} renderOrder={2} />
      <mesh name="exhaust-gas" ref={gas} material={material} renderOrder={1} frustumCulled={false} visible={false} />
      <mesh name="exhaust-plume" ref={plumes} material={plumeMaterial} renderOrder={3} frustumCulled={false} visible={false} />
    </group>
  )
}
