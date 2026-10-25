import { defineLabConfig, type LabCue, type LabParamValue } from '@/lib/simulation/labStore'
import { CLUTCH, ENGINE_RPM, GEARS, clutchState, isGearId, type GearId } from './gearbox'

/**
 * Gearbox laboratory configuration (pure — no three.js, eagerly imported by
 * the lab registry). A param-driven lab: no timeline; the state is the
 * selected gear, clutch pedal travel, engine speed and whether the shafts
 * are animated. Lesson steps drive it through cue params.
 */

export const PARAM = { gear: 'gear', clutch: 'clutch', rpm: 'rpm', running: 'running' } as const

export interface TransmissionParams {
  gear: GearId
  /** Clutch pedal travel 0 (foot off) .. 1 (floor). */
  clutch: number
  rpm: number
  /** Whether the shafts turn (play / pause). */
  running: boolean
}

export const INITIAL_PARAMS: TransmissionParams = { gear: '1', clutch: 0, rpm: ENGINE_RPM.initial, running: true }

const finite = (v: LabParamValue | undefined, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)

/** Typed, sanitised view of the store's params (unknown values fall back to the defaults). */
export function readParams(params: Record<string, LabParamValue>): TransmissionParams {
  const gear = params[PARAM.gear]
  const running = params[PARAM.running]
  return {
    gear: isGearId(gear) ? gear : INITIAL_PARAMS.gear,
    clutch: Math.min(1, Math.max(0, finite(params[PARAM.clutch], INITIAL_PARAMS.clutch))),
    rpm: Math.min(ENGINE_RPM.max, Math.max(ENGINE_RPM.min, finite(params[PARAM.rpm], INITIAL_PARAMS.rpm))),
    running: typeof running === 'boolean' ? running : INITIAL_PARAMS.running,
  }
}

/** Cue id for each gear (with the clutch fully engaged). */
export const GEAR_CUE: Record<GearId, string> = {
  N: 'neutral',
  '1': 'first',
  '2': 'second',
  '3': 'third',
  '4': 'fourth',
  '5': 'fifth',
  R: 'reverse',
}

const GEAR_CUE_LABEL: Record<GearId, string> = {
  N: 'Neutral',
  '1': '1st gear',
  '2': '2nd gear',
  '3': '3rd gear',
  '4': '4th gear · direct drive',
  '5': '5th gear · overdrive',
  R: 'Reverse',
}

/** Clutch cues, all in 1st gear (pulling away). */
export const CLUTCH_CUES = {
  engaged: 'clutch-engaged',
  down: 'clutch-down',
  bite: 'clutch-bite',
  slip: 'clutch-slip',
} as const

export const TRANSMISSION_CUES: LabCue[] = [
  ...GEARS.map((g) => ({ id: GEAR_CUE[g], label: GEAR_CUE_LABEL[g], params: { [PARAM.gear]: g, [PARAM.clutch]: 0 } })),
  { id: CLUTCH_CUES.engaged, label: 'Clutch engaged', params: { [PARAM.gear]: '1', [PARAM.clutch]: 0 } },
  { id: CLUTCH_CUES.down, label: 'Clutch disengaged', params: { [PARAM.gear]: '1', [PARAM.clutch]: 1 } },
  { id: CLUTCH_CUES.bite, label: 'Bite point', params: { [PARAM.gear]: '1', [PARAM.clutch]: CLUTCH.bitePedal } },
  { id: CLUTCH_CUES.slip, label: 'Clutch slipping', params: { [PARAM.gear]: '1', [PARAM.clutch]: CLUTCH.slipPedal } },
]

/**
 * Live cue: the clutch state while the clutch is not locked (pressed,
 * biting or slipping), otherwise the selected gear.
 */
export function deriveTransmissionCue(params: Record<string, LabParamValue>): string {
  const p = readParams(params)
  switch (clutchState(p.clutch)) {
    case 'disengaged':
      return CLUTCH_CUES.down
    case 'biting':
      return CLUTCH_CUES.bite
    case 'slipping':
      return CLUTCH_CUES.slip
    case 'engaged':
      return GEAR_CUE[p.gear]
  }
}

export const transmissionLabConfig = defineLabConfig({
  id: 'transmission',
  timeline: false,
  loop: true,
  cues: TRANSMISSION_CUES,
  initialParams: { ...INITIAL_PARAMS },
  deriveCue: (_progress, params) => deriveTransmissionCue(params),
})
