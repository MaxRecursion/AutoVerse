import { defineLabConfig, type LabCue, type LabParamValue } from '@/lib/simulation/labStore'
import {
  DEFAULT_PARAMS,
  brakingStateAt,
  phaseAt,
  planFor,
  planStop,
  progressAtTime,
  timeAtProgress,
  toLabParams,
  type BrakingParams,
  type BrakingPhase,
  type StopPlan,
} from './braking'

/**
 * Disc-brake laboratory timeline (pure — no three.js, eagerly imported by the
 * lab registry). One one-shot cycle = one braking event: a short roll with the
 * pedal up, the pedal press, the stop and a moment at standstill. The params
 * (pedal force, speed, surface, ABS) change how long that event lasts, so the
 * timeline is normalised: progress 0…1 covers the whole event.
 */

/** Real seconds the whole braking event takes at 1× (simulated time is scaled to fit). */
export const BRAKING_CYCLE_SECONDS = 10

/** Canonical scenarios the lesson cues set, so "Show in 3D" always lands on the same moment. */
export const SCENARIOS = {
  /** Firm stop on a dry road, within grip (ABS on but idle). */
  firmStop: DEFAULT_PARAMS,
  /** Hard stop on a wet road without ABS: the wheel locks. */
  wetLock: { pedalN: 220, speedKmh: 80, surface: 'wet', abs: false },
  /** The same hard stop with ABS. */
  wetAbs: { pedalN: 220, speedKmh: 80, surface: 'wet', abs: true },
} as const satisfies Record<string, BrakingParams>

export type ScenarioId = keyof typeof SCENARIOS

/** Live cues are the phases deriveCue returns while the stop plays. */
export const LIVE_CUE_IDS = ['rolling', 'apply', 'braking', 'wheel-lock', 'abs-active', 'stopped'] as const satisfies readonly BrakingPhase[]

/** Event cues are seek targets for lessons; deriveCue never returns them. */
export const EVENT_CUE_IDS = ['clamp', 'heat', 'grip-limit', 'abs-sense', 'abs-release', 'abs-reapply', 'abs-stopped', 'lock-stopped'] as const

export type BrakingCueId = (typeof LIVE_CUE_IDS)[number] | (typeof EVENT_CUE_IDS)[number]

const cueAt = (id: BrakingCueId, label: string, scenario: ScenarioId, time: (plan: StopPlan) => number): LabCue => {
  const plan = planStop(SCENARIOS[scenario])
  return { id, label, progress: progressAtTime(plan, time(plan)), params: toLabParams(SCENARIOS[scenario]) }
}

/** Time of the given ABS valve state in the cycle running closest to 40 % of the stop. */
function absMoment(plan: StopPlan, phase: number): number {
  const T = plan.timing.absPeriod
  const k = Math.round((plan.tApply + 0.4 * (plan.tStop - plan.tApply) - plan.tAbsCycles) / T)
  return plan.tAbsCycles + (k + phase) * T
}

/** Time at which the car has shed half its speed. */
function halfSpeed(plan: StopPlan): number {
  let lo = plan.tApply
  let hi = plan.tStop
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2
    if (brakingStateAt(plan, mid).vehicleSpeed > plan.v0 / 2) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

export const BRAKING_CUES: LabCue[] = [
  // Live phases (labels appear in the scene's cue badge).
  cueAt('rolling', 'Rolling', 'firmStop', (p) => p.tApply / 2),
  cueAt('apply', 'Pressure rising', 'firmStop', (p) => p.tApply + 0.4 * p.timing.applyTime),
  cueAt('braking', 'Braking', 'firmStop', halfSpeed),
  cueAt('wheel-lock', 'Wheel locked', 'wetLock', (p) => p.tLimit + p.timing.lockUpTime + 0.6),
  cueAt('abs-active', 'ABS cycling', 'wetAbs', (p) => absMoment(p, 0.2)),
  cueAt('stopped', 'Stopped', 'firmStop', (p) => p.duration),
  // Events.
  cueAt('clamp', 'Pads clamp the disc', 'firmStop', (p) => p.tRampEnd + 0.05),
  cueAt('heat', 'Motion becomes heat', 'firmStop', (p) => p.tApply + 0.85 * (p.tStop - p.tApply)),
  cueAt('grip-limit', 'Grip limit reached', 'wetLock', (p) => p.tLimit),
  cueAt('abs-sense', 'Sensor sees slip rising', 'wetAbs', (p) => p.tLimit + 0.7 * p.timing.absOnset),
  cueAt('abs-release', 'ABS releases pressure', 'wetAbs', (p) => absMoment(p, 0.22)),
  cueAt('abs-reapply', 'ABS reapplies pressure', 'wetAbs', (p) => absMoment(p, 0.75)),
  cueAt('abs-stopped', 'Stopped with ABS', 'wetAbs', (p) => p.duration),
  cueAt('lock-stopped', 'Stopped after sliding', 'wetLock', (p) => p.duration),
]

/** The live cue is the phase of the stop at this moment. */
export function deriveBrakingCue(progress: number, params: Record<string, LabParamValue>): BrakingPhase {
  const plan = planFor(params)
  return phaseAt(plan, timeAtProgress(plan, progress))
}

export const brakingLabConfig = defineLabConfig({
  id: 'braking',
  cycleDuration: BRAKING_CYCLE_SECONDS,
  stepSize: 1 / 200,
  speeds: [0.1, 0.25, 0.5, 1, 2],
  loop: false,
  timeline: true,
  cues: BRAKING_CUES,
  initialParams: toLabParams(DEFAULT_PARAMS),
  deriveCue: deriveBrakingCue,
})
