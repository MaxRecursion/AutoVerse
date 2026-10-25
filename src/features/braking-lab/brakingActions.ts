import type { LabParamValue, LabStore } from '@/lib/simulation/labStore'
import { planFor, progressAtTime, timeAtProgress, toLabParams, type BrakingParams } from './braking'

/**
 * Store actions for the braking lab's controls (pure functions of the store,
 * no DOM), so the pedal, sliders and scenario buttons behave identically in
 * the 3D view, the 2D fallback and the tests.
 */

/**
 * Change a param while keeping the same moment of the stop: the elapsed time
 * stays put (clamped to the new stop's length), and a finished stop stays
 * finished so the new outcome can be compared at once.
 */
export function setBrakingParam(store: LabStore, key: string, value: LabParamValue): void {
  const s = store.getState()
  if (s.params[key] === value) return
  const finished = s.progress >= 1
  const t = timeAtProgress(planFor(s.params), s.progress)
  s.setParam(key, value)
  const next = store.getState()
  next.seek(finished ? 1 : progressAtTime(planFor(next.params), t))
}

/**
 * Pedal pressed (press-and-hold control): brake from now on. Before the
 * pedal moment, or after a finished stop, the timeline jumps to the instant
 * the pedal goes down; mid-stop it simply resumes. Then it plays.
 */
export function pressPedal(store: LabStore): void {
  const s = store.getState()
  const plan = planFor(s.params)
  const t = timeAtProgress(plan, s.progress)
  if (s.progress >= 1 || t >= plan.tStop || t < plan.tApply) s.seek(progressAtTime(plan, plan.tApply))
  store.getState().play()
}

/**
 * Pedal released: this lab models one continuous stop, so letting go freezes
 * the moment (pauses) rather than inventing a pedal-release model.
 */
export function releasePedal(store: LabStore): void {
  const s = store.getState()
  if (s.playing) s.pause()
}

/** Load a whole scenario and play it from the start. */
export function runScenario(store: LabStore, params: BrakingParams): void {
  const s = store.getState()
  for (const [k, v] of Object.entries(toLabParams(params))) s.setParam(k, v)
  store.getState().seek(0)
  store.getState().play()
}

/** Whether the store's params equal a scenario's. */
export function paramsMatch(params: Readonly<Record<string, LabParamValue>>, scenario: BrakingParams): boolean {
  return Object.entries(toLabParams(scenario)).every(([k, v]) => params[k] === v)
}
