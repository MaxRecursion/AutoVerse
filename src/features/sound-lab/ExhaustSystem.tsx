/**
 * The exhaust of a Sound Lab cutaway: pipes, and the gas flowing through them
 * and out of the tailpipes (exhaustGas.ts). Shared by CutawayScene and
 * V10Scene. The scene describes its plumbing at a bank angle; this component
 * rebuilds the pipes and the gas whenever the drawn bank angle moves by half
 * a degree, and every frame hands the gas shader each cylinder's degrees since
 * its exhaust valve opened, how far the gas has moved, and the engine's load.
 * Gas only flows while the engine turns: stopped, or with reduced motion, the
 * pipes stay empty, like the rest of the scene's flow cues.
 */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CatmullRomCurve3, TubeGeometry, Vector3, type BufferGeometry, type Material, type Mesh } from 'three'
import type { QualityTier } from '@/hooks/useQualityTier'
import { merge } from '@/features/engine-lab/engineGeometry'
import { mod, type FrameBus } from './animation'
import type { EngineSpec } from './engines'
import { exhaustLoad, sinceExhaustOpened, type Vec3 } from './exhaust'
import { MAX_GAS_SLOTS, buildGasGeometry, createGasMaterial, noiseStep, plumeNoiseStep, wrapNoise, type GasRoute } from './exhaustGas'

export interface ExhaustPipe {
  points: Vec3[]
  radius: number
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
  pipeMaterial: Material
  /** Whole engine: gas leaves the tailpipes as a plume. Single-cylinder views stop at a header stub. */
  plume: boolean
  spec: Pick<EngineSpec, 'idleRpm' | 'redlineRpm' | 'ignition'>
  tier: QualityTier
}

/** Crank degrees the gas keeps count of after a start: enough to fill the longest route and its plume. */
const RUN_CAP = 4000
/** Radians the eddies turn round the pipe per crank degree. */
const SWIRL_PER_DEG = 0.0035

function pipeGeometry(pipes: ExhaustPipe[]): BufferGeometry {
  const tubes = pipes.map(({ points, radius }) =>
    new TubeGeometry(new CatmullRomCurve3(points.map((p) => new Vector3(...p)), false, 'catmullrom', 0.2), Math.max(16, points.length * 10), radius, 8, false),
  )
  return merge(tubes)
}

export function ExhaustSystem({ drawing, bankOf, firingAngle, bus, pipeMaterial, plume, spec, tier }: ExhaustSystemProps) {
  const pipes = useRef<Mesh>(null)
  const gas = useRef<Mesh>(null)
  const material = useMemo(() => createGasMaterial(tier), [tier])
  useEffect(() => () => material.dispose(), [material])
  const built = useRef<{ bank: number; pipes: BufferGeometry | null; gas: BufferGeometry | null; slots: number[] }>({ bank: Number.NaN, pipes: null, gas: null, slots: [] })
  const flow = useRef({ playhead: Number.NaN, shift: 0, plumeShift: 0, swirl: 0, run: 0 })

  // A new drawing (preset, view, layout) or detail level rebuilds on the next frame.
  useEffect(() => {
    built.current.bank = Number.NaN
  }, [drawing, tier, plume])
  useEffect(
    () => () => {
      built.current.pipes?.dispose()
      built.current.gas?.dispose()
      built.current = { bank: Number.NaN, pipes: null, gas: null, slots: [] }
    },
    [],
  )

  useFrame(() => {
    const frame = bus.last
    const bank = Math.round(bankOf(frame?.bank ?? null) * 2) / 2
    const b = built.current
    if (bank !== b.bank || !b.gas) {
      const { pipes: pipeList, routes } = drawing(bank)
      const slotted = routes.slice(0, MAX_GAS_SLOTS)
      const gasRoutes: GasRoute[] = slotted.map((route, slot) => ({ slot, points: route.points, segments: route.segments, headerLength: route.headerLength, plume }))
      b.pipes?.dispose()
      b.gas?.dispose()
      b.pipes = pipeGeometry(pipeList)
      b.gas = buildGasGeometry(gasRoutes, tier)
      b.slots = slotted.map((route) => route.index)
      b.bank = bank
      if (pipes.current) pipes.current.geometry = b.pipes
      if (gas.current) gas.current.geometry = b.gas
    }

    const animate = frame?.animate ?? false
    const u = material.uniforms
    const f = flow.current
    if (!animate || !frame) {
      // Stopped (or reduced motion): no flow. The next start fills the pipes from the ports again.
      f.playhead = Number.NaN
      f.run = 0
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
    u.uShift.value = f.shift
    u.uPlumeShift.value = f.plumeShift
    u.uSwirl.value = f.swirl
    u.uRun.value = f.run
    u.uLoad.value = exhaustLoad(frame.rpm, spec.idleRpm, spec.redlineRpm)
    u.uDiesel.value = spec.ignition === 'compression' ? 1 : 0
    u.uOpacity.value = 1
    if (gas.current) gas.current.visible = true
  })

  return (
    <group name="exhaust" dispose={null}>
      <mesh name="exhaust-pipes" ref={pipes} material={pipeMaterial} renderOrder={1} />
      <mesh name="exhaust-gas" ref={gas} material={material} renderOrder={3} frustumCulled={false} visible={false} />
    </group>
  )
}
