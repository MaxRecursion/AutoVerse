/**
 * The exhaust of a Sound Lab cutaway: pipes, and the gas flowing through them
 * and out of the tailpipes (exhaustGas.ts). Shared by CutawayScene and
 * V10Scene. The scene describes its plumbing at a bank angle; this component
 * rebuilds the pipes and the gas when the drawn bank angle moves (at most ten
 * times a second while the bank-angle experiment eases, then once more where
 * it settles), and every frame hands the gas shader each cylinder's degrees
 * since its exhaust valve opened, how far the gas has moved, and the engine's
 * load. Gas only flows while the engine turns: stopped, or with reduced
 * motion, the pipes stay empty and cool, like the rest of the scene's flow cues.
 *
 * The pipes are see-through face-on and solid at their edges, so the gas
 * shows inside them while their outlines still read; the first stretch of each
 * header glows dull red after sustained high revs.
 */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { CatmullRomCurve3, Float32BufferAttribute, MeshStandardMaterial, TubeGeometry, Vector3, type BufferGeometry, type Group, type Mesh } from 'three'
import type { QualityTier } from '@/hooks/useQualityTier'
import { merge } from '@/features/engine-lab/engineGeometry'
import { mod, type FrameBus } from './animation'
import type { EngineSpec } from './engines'
import { approachWallHeat, exhaustLoad, headerHeat, sinceExhaustOpened, wallHeatTarget, type Vec3 } from './exhaust'
import { MAX_GAS_SLOTS, buildGasGeometry, createGasMaterial, noiseStep, plumeNoiseStep, wrapNoise, type GasRoute } from './exhaustGas'

export interface ExhaustPipe {
  points: Vec3[]
  radius: number
  /** A header leaving an exhaust port: its first stretch can glow with heat. */
  header?: boolean
}

export interface ExhaustRoute {
  /** Firing-event index of the cylinder whose gas this is. */
  index: number
  points: Vec3[]
  /** Exact visible pipe curves, sampled separately so gas stays inside their bends. */
  segments: Vec3[][]
  headerLength: number
}

export interface ExhaustDrawing {
  pipes: ExhaustPipe[]
  routes: ExhaustRoute[]
}

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
        '#include <emissivemap_fragment>\nfloat wallGlow = smoothstep(0.12, 1.0, uWallHeat * vHeat);\ntotalEmissiveRadiance += mix(vec3(0.55, 0.04, 0.0), vec3(1.0, 0.3, 0.05), wallGlow) * wallGlow * 2.2;',
      )
      .replace(
        '#include <opaque_fragment>',
        // Glowing metal is opaque; cool walls stay see-through face-on so the gas shows.
        'float wallFacing = abs(dot(normal, normalize(vViewPosition)));\ndiffuseColor.a = max(mix(0.68, 0.14, wallFacing * wallFacing), 0.9 * wallGlow);\n#include <opaque_fragment>',
      )
  }
  material.customProgramCacheKey = () => 'exhaust-pipe-1'
  return { material, wallHeat }
}

export function ExhaustSystem({ drawing, bankOf, firingAngle, bus, plume, spec, tier }: ExhaustSystemProps) {
  const group = useRef<Group>(null)
  const pipes = useRef<Mesh>(null)
  const gas = useRef<Mesh>(null)
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)
  const invalidate = useThree((state) => state.invalidate)
  const material = useMemo(() => createGasMaterial(tier), [tier])
  const pipe = useMemo(() => createPipeMaterial(), [])
  useEffect(() => () => material.dispose(), [material])
  useEffect(() => () => pipe.material.dispose(), [pipe])
  const built = useRef<{ bank: number; at: number; pipes: BufferGeometry | null; gas: BufferGeometry | null; slots: number[] }>({ bank: Number.NaN, at: -Infinity, pipes: null, gas: null, slots: [] })
  const flow = useRef({ playhead: Number.NaN, shift: 0, plumeShift: 0, swirl: 0, run: 0, wallHeat: 0, wallAt: Number.NaN })
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
      built.current = { bank: Number.NaN, at: -Infinity, pipes: null, gas: null, slots: [] }
    },
    [],
  )

  useFrame(() => {
    const frame = bus.last
    const now = typeof performance !== 'undefined' ? performance.now() : 0
    const bank = Math.round(bankOf(frame?.bank ?? null) * 2) / 2
    const b = built.current
    if (bank !== b.bank || !b.gas) {
      if (b.gas && now - b.at < REBUILD_GAP_MS) {
        // Easing: rebuild a little later, and ask for that frame in case the engine is stopped.
        invalidate()
      } else {
        const { pipes: pipeList, routes } = drawing(bank)
        const slotted = routes.slice(0, MAX_GAS_SLOTS)
        const gasRoutes: GasRoute[] = slotted.map((route, slot) => ({ slot, points: route.points, segments: route.segments, headerLength: route.headerLength, plume }))
        b.pipes?.dispose()
        b.gas?.dispose()
        b.pipes = pipeGeometry(pipeList)
        b.gas = buildGasGeometry(gasRoutes, tier)
        material.uniforms.uOutletTime.value.set(b.gas.userData.outletTime)
        material.uniforms.uSince.value.fill(0)
        b.slots = slotted.map((route) => route.index)
        b.bank = bank
        b.at = now
        if (pipes.current) pipes.current.geometry = b.pipes
        if (gas.current) gas.current.geometry = b.gas
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
    const u = material.uniforms
    const f = flow.current
    if (!animate || !frame) {
      // Stopped (or reduced motion): no flow, cool pipes. The next start fills the pipes from the ports again.
      f.playhead = Number.NaN
      f.run = 0
      f.wallHeat = 0
      f.wallAt = Number.NaN
      pipe.wallHeat.value = 0
      u.uOpacity.value = 0
      if (gas.current) gas.current.visible = false
      return
    }
    const step = Number.isNaN(f.playhead) ? 0 : mod(frame.playhead - f.playhead, 720)
    // A jump (a reset or an experiment) is not flow.
    const moved = step < 360 ? step : 0
    f.playhead = frame.playhead
    // Turbulence rides with the gas and slowly swirls; both wrap without a seam.
    f.shift = wrapNoise(f.shift + noiseStep(moved))
    f.plumeShift = wrapNoise(f.plumeShift + plumeNoiseStep(moved))
    f.swirl = mod(f.swirl + moved * SWIRL_PER_DEG, Math.PI * 2)
    f.run = Math.min(RUN_CAP, f.run + moved)
    b.slots.forEach((index, slot) => {
      u.uSince.value[slot] = sinceExhaustOpened(mod(frame.playhead - firingAngle(index) + 360, 720))
    })
    const load = exhaustLoad(frame.rpm, spec.idleRpm, spec.redlineRpm)
    const diesel = spec.ignition === 'compression'
    // Consume elapsed bus time once: camera redraws may reuse a tick, while a
    // slower renderer may skip ticks. Neither should change how fast metal heats.
    const wallDt = Number.isNaN(f.wallAt) ? 0 : Math.max(0, (frame.now - f.wallAt) / 1000)
    f.wallAt = frame.now
    f.wallHeat = approachWallHeat(f.wallHeat, wallHeatTarget(load, diesel), wallDt)
    pipe.wallHeat.value = f.wallHeat
    u.uShift.value = f.shift
    u.uPlumeShift.value = f.plumeShift
    u.uSwirl.value = f.swirl
    u.uRun.value = f.run
    u.uLoad.value = load
    u.uDiesel.value = diesel ? 1 : 0
    u.uOpacity.value = 1
    if (gas.current) gas.current.visible = true
  })

  return (
    <group name="exhaust" ref={group} dispose={null}>
      <mesh name="exhaust-pipes" ref={pipes} material={pipe.material} renderOrder={1} />
      <mesh name="exhaust-gas" ref={gas} material={material} renderOrder={3} frustumCulled={false} visible={false} />
    </group>
  )
}
