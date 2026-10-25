import type { LabState } from '@/lib/simulation/labStore'

/**
 * Lab missions: a short checklist per lab that ticks from what the learner
 * really does. A mission is a pure predicate over evidence collected from the
 * lab store — the learner's actions (`activity`), the cues the timeline has
 * shown (`cues`) and the parameter values that have been in effect (`values`).
 */

export interface MissionContext {
  activity: Readonly<Record<string, true>>
  /** Cue ids the timeline has shown, however it got there. */
  cues: ReadonlySet<string>
  /** Distinct values each param has had (stringified), including its initial value. */
  values: Readonly<Record<string, ReadonlySet<string>>>
}

export interface Mission {
  id: string
  label: string
  /** What to try, in one short sentence. */
  hint: string
  done: (c: MissionContext) => boolean
}

export const emptyContext = (): MissionContext => ({ activity: {}, cues: new Set(), values: {} })

/** Folds the lab's current state into the evidence (returns the same object when nothing is new). */
export function observe(prev: MissionContext, s: Pick<LabState, 'activity' | 'cue' | 'params'>): MissionContext {
  let cues = prev.cues
  if (s.cue && !cues.has(s.cue)) cues = new Set([...cues, s.cue])
  let values = prev.values
  for (const [key, value] of Object.entries(s.params)) {
    const text = String(value)
    if (!values[key]?.has(text)) values = { ...values, [key]: new Set([...(values[key] ?? []), text]) }
  }
  return cues === prev.cues && values === prev.values && s.activity === prev.activity ? prev : { activity: s.activity, cues, values }
}

const has = (c: MissionContext, ...keys: string[]) => keys.every((k) => c.activity[k])
const hasAny = (c: MissionContext, ...keys: string[]) => keys.some((k) => c.activity[k])
const selectedAnything = (c: MissionContext) => Object.keys(c.activity).some((k) => k.startsWith('select:'))
const distinct = (c: MissionContext, key: string) => c.values[key]?.size ?? 0
const sawValue = (c: MissionContext, key: string, ...wanted: string[]) => wanted.every((w) => c.values[key]?.has(w))

export const MISSIONS: Readonly<Record<string, readonly Mission[]>> = {
  engine: [
    {
      id: 'watch-cycle',
      label: 'Watch all four strokes',
      hint: 'Let it run: intake, compression, power, exhaust.',
      done: (c) => ['intake', 'compression', 'power', 'exhaust'].every((k) => c.cues.has(k)),
    },
    { id: 'jump-power', label: 'Jump to the power stroke', hint: 'Use the “Power” stroke button.', done: (c) => has(c, 'cue:power') },
    { id: 'pick-piston', label: 'Select the piston', hint: 'Click it in the scene or in the Parts tab.', done: (c) => has(c, 'select:piston') },
    { id: 'explode', label: 'Explode the engine', hint: 'Use the exploded-view button in the toolbar.', done: (c) => has(c, 'explode') },
  ],
  transmission: [
    { id: 'three-gears', label: 'Try three different gears', hint: 'Pick gears on the shift pattern.', done: (c) => distinct(c, 'gear') >= 3 },
    { id: 'clutch', label: 'Press the clutch pedal', hint: 'Drag the clutch slider and watch the plate lift.', done: (c) => has(c, 'param:clutch') },
    { id: 'reverse', label: 'Engage reverse', hint: 'Select R and watch the idler slide in.', done: (c) => sawValue(c, 'gear', 'R') },
    { id: 'pick-part', label: 'Select a gear or shaft', hint: 'Click any part to see what it does.', done: selectedAnything },
  ],
  braking: [
    { id: 'brake', label: 'Press the brake pedal', hint: 'Hold the pedal and watch the pads close.', done: (c) => hasAny(c, 'play', 'scrub') },
    { id: 'slippery', label: 'Brake on a wet or icy road', hint: 'Change the surface and compare the stop.', done: (c) => c.values.surface?.has('wet') === true || c.values.surface?.has('ice') === true },
    { id: 'abs-off', label: 'Switch ABS off', hint: 'See what happens when a wheel locks.', done: (c) => sawValue(c, 'abs', 'false') },
    { id: 'pick-part', label: 'Select a part', hint: 'Try the caliper or the disc.', done: selectedAnything },
  ],
  suspension: [
    { id: 'bump', label: 'Drive over the bump', hint: 'Watch compression, then rebound.', done: (c) => c.cues.has('compression') && c.cues.has('rebound') },
    { id: 'dampers', label: 'Compare soft and stiff dampers', hint: 'Change the damping preset.', done: (c) => sawValue(c, 'damping', 'soft', 'stiff') },
    { id: 'road', label: 'Try a different road', hint: 'Switch between bump, pothole and washboard.', done: (c) => distinct(c, 'road') >= 2 },
    { id: 'pick-part', label: 'Select the spring or damper', hint: 'Click one in the scene.', done: selectedAnything },
  ],
}

export const getMissions = (labId: string): readonly Mission[] => MISSIONS[labId] ?? []

/** Ids of the missions satisfied by the evidence. */
export const completedMissions = (labId: string, c: MissionContext): string[] => getMissions(labId).filter((m) => m.done(c)).map((m) => m.id)
