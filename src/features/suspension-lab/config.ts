import { defineLabConfig, type LabCue, type LabParamValue } from '@/lib/simulation/labStore'
import { DEFAULT_SETTINGS, LAP_SECONDS, poseAt, responseFor, settingsFromParams, type ResponsePhase } from './quarterCar'

/**
 * Suspension laboratory timeline (pure — no three.js; eagerly imported by
 * the lab registry). One cycle = one lap of the test road: approach, the
 * road feature, and the car settling again. The response is a pure function
 * of the parameters (road input, damper preset, spring rate), so the live
 * cue is a lookup into the precomputed response.
 */

/** Seconds per lap at 1× — the 2 s simulated lap plays 6× slower than real time. */
export const SUSPENSION_CYCLE_SECONDS = 12
/** How many times slower than real time the 1× animation runs. */
export const SLOW_MOTION = SUSPENSION_CYCLE_SECONDS / LAP_SECONDS
/** One manual step = 10 ms of simulated time. */
export const SUSPENSION_STEP = 1 / 200

export const SUSPENSION_PARAMS = {
  road: DEFAULT_SETTINGS.road,
  damping: DEFAULT_SETTINGS.damping,
  springRate: DEFAULT_SETTINGS.springRate,
} satisfies Record<string, LabParamValue>

/** Lap position of a simulated time (s). */
const at = (seconds: number) => seconds / LAP_SECONDS

/** Live cues: what the suspension is doing right now (see deriveSuspensionCue). */
export const PHASE_CUE_IDS = ['approach', 'compression', 'rebound', 'ripples', 'settle'] as const satisfies readonly ResponsePhase[]

/** Scenario cues: lesson seek targets that set a road / damper / spring combination and pause on a telling moment. */
export const SCENARIO_CUE_IDS = ['full-bump', 'airborne', 'soft-float', 'well-damped', 'stiff-skip', 'wheel-hop', 'soft-spring'] as const
export type ScenarioCueId = (typeof SCENARIO_CUE_IDS)[number]

const defaults = { damping: 'balanced', springRate: DEFAULT_SETTINGS.springRate } as const

/**
 * Phase cues only choose the road, so the reader's damper and spring choice
 * survive a "Show in 3D". Their positions are where every damper preset and
 * spring rate is in that phase (asserted in tests). Every position is on the
 * 10 ms step grid.
 */
export const SUSPENSION_CUES: LabCue[] = [
  { id: 'approach', label: 'Approach', progress: at(0.2), params: { road: 'bump' } },
  { id: 'compression', label: 'Compression (bump)', progress: at(0.45), params: { road: 'bump' } },
  { id: 'rebound', label: 'Rebound (extension)', progress: at(0.54), params: { road: 'bump' } },
  { id: 'ripples', label: 'Ripples', progress: at(0.7), params: { road: 'washboard' } },
  { id: 'settle', label: 'Settling', progress: at(1.2), params: { road: 'bump' } },
  // Scenario (event) cues — never returned by deriveCue.
  { id: 'full-bump', label: 'Full bump', progress: at(0.49), params: { road: 'bump', ...defaults } },
  { id: 'airborne', label: 'Tyre off the road', progress: at(0.42), params: { road: 'pothole', ...defaults } },
  { id: 'soft-float', label: 'Damper too soft', progress: at(0.7), params: { road: 'bump', damping: 'soft', springRate: defaults.springRate } },
  { id: 'well-damped', label: 'Damper balanced', progress: at(1.4), params: { road: 'bump', ...defaults } },
  { id: 'stiff-skip', label: 'Damper too stiff', progress: at(0.56), params: { road: 'bump', damping: 'stiff', springRate: defaults.springRate } },
  { id: 'wheel-hop', label: 'Wheel hop', progress: at(0.64), params: { road: 'washboard', damping: 'soft', springRate: defaults.springRate } },
  { id: 'soft-spring', label: 'Soft spring', progress: at(0.49), params: { road: 'bump', damping: 'balanced', springRate: 15 } },
]

/** The live cue: the response phase at this lap position for these settings. */
export function deriveSuspensionCue(progress: number, params: Record<string, LabParamValue>): ResponsePhase {
  return poseAt(responseFor(settingsFromParams(params)), progress).phase
}

/** Timeline readout: simulated time within the lap, e.g. "0.45 s". */
export const formatSuspensionProgress = (progress: number) => `${(Math.min(1, Math.max(0, progress)) * LAP_SECONDS).toFixed(2)} s`

export const suspensionLabConfig = defineLabConfig({
  id: 'suspension',
  cycleDuration: SUSPENSION_CYCLE_SECONDS,
  stepSize: SUSPENSION_STEP,
  speeds: [0.1, 0.25, 0.5, 1, 2],
  loop: true,
  timeline: true,
  cues: SUSPENSION_CUES,
  initialParams: { ...SUSPENSION_PARAMS },
  deriveCue: deriveSuspensionCue,
  formatProgress: formatSuspensionProgress,
})
