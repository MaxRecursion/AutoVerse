/**
 * Gearbox laboratory — drive simulation (pure, no three.js).
 *
 * Contract: the ONLY integrated rotation is `phase`, the input-shaft angle.
 * Every gear, the layshaft, the idler and (while a gear is engaged) the
 * mainshaft are derived from it through tooth ratios (gearboxModel
 * `trainAngles` / `lockedBase`), so meshing teeth can never drift.
 *
 * Two things are not tooth-locked, by nature, and are handled explicitly:
 *
 * - Clutch slip. The flywheel and pressure plate turn at engine speed and the
 *   disc at input speed; while the clutch slips they genuinely move relative
 *   to each other. `slip` (engine-side lead over the disc) advances only while
 *   the clutch is slipping, so whenever it is locked the engine side is
 *   rigidly `phase + slip` — no drift.
 * - The mainshaft in neutral. With no gear engaged it is free and coasts down
 *   (a pure function of time since it was released). When a collar engages,
 *   the shaft is locked at `lockedBase + k × lockPitch`, with k chosen once so
 *   the lock lands next to where the shaft already is; the synchroniser blends
 *   it onto that lock over the last part of the collar's travel.
 *
 * Collar and idler slides are pure functions of time since the shift began.
 */
import { clutchEngagement, clutchTorqueFraction, gearRatio, type DriveGearId, type GearId } from './gearbox'
import { clutchPose, lockPitch, lockedBase, trainAngles, visualRadPerSecond, type ClutchPose, type TrainAngles } from './gearboxModel'
import { powerPathKeys, type HubId, type PathKey } from './powerPath'

/* ------------------------------------------------------------------ */
/* Selector                                                             */
/* ------------------------------------------------------------------ */

export type SelectorMember = HubId | 'idler'

/** Collar positions (−1..1, 0 = neutral) and idler slide (0 = out, 1 = in mesh). */
export type SelectorPose = Record<SelectorMember, number>

export const SELECTOR_MEMBERS: readonly SelectorMember[] = ['h34', 'h12', 'h5', 'idler']

export const NEUTRAL_POSE: Readonly<SelectorPose> = { h34: 0, h12: 0, h5: 0, idler: 0 }

/** Selector member and direction that engage each gear (−1 = collar slides towards the engine). */
export const SELECTOR: Record<DriveGearId, { member: SelectorMember; dir: 1 | -1 }> = {
  '4': { member: 'h34', dir: -1 },
  '3': { member: 'h34', dir: 1 },
  '2': { member: 'h12', dir: -1 },
  '1': { member: 'h12', dir: 1 },
  '5': { member: 'h5', dir: -1 },
  R: { member: 'idler', dir: 1 },
}

export const SHIFT_TIMING = {
  /** Seconds for a member to slide one full travel back to neutral. */
  disengage: 0.24,
  /** Seconds for the selected member to slide from neutral to full engagement. */
  engage: 0.46,
  /** Fraction of the engaging travel at which the synchro cone starts matching speeds. */
  syncFrom: 0.5,
} as const

/** Coast-down time constant of the free mainshaft, seconds (drive time). */
export const COAST_SECONDS = 0.6

export function targetPose(gear: GearId): SelectorPose {
  const pose = { ...NEUTRAL_POSE }
  if (gear !== 'N') pose[SELECTOR[gear].member] = SELECTOR[gear].dir
  return pose
}

/** The gear whose member is at full travel, or null (neutral / mid-shift). */
export function engagedGear(pose: SelectorPose): DriveGearId | null {
  for (const gear of Object.keys(SELECTOR) as DriveGearId[]) {
    const { member, dir } = SELECTOR[gear]
    if (pose[member] * dir >= 1 - 1e-9) return gear
  }
  return null
}

export interface Shift {
  from: SelectorPose
  to: GearId
  /** Selector-clock time the shift began. */
  start: number
}

const ease = (t: number) => {
  const u = Math.min(1, Math.max(0, t))
  return u * u * (3 - 2 * u)
}

interface ShiftPlan {
  mid: SelectorPose
  target: SelectorPose
  member: SelectorMember | null
  out: number
  in: number
}

function planShift(shift: Shift): ShiftPlan {
  const target = targetPose(shift.to)
  const mid = { ...shift.from }
  let outTravel = 0
  for (const m of SELECTOR_MEMBERS) {
    const v = shift.from[m]
    const goal = target[m]
    // A member moves back to neutral first if it must end at zero or change direction.
    if (v !== 0 && (goal === 0 || Math.sign(v) !== Math.sign(goal))) {
      mid[m] = 0
      outTravel = Math.max(outTravel, Math.abs(v))
    }
  }
  const member = shift.to === 'N' ? null : SELECTOR[shift.to].member
  const inTravel = member ? Math.abs(target[member] - mid[member]) : 0
  return { mid, target, member, out: SHIFT_TIMING.disengage * outTravel, in: SHIFT_TIMING.engage * inTravel }
}

/** Total duration of a shift, seconds. */
export function shiftDuration(shift: Shift): number {
  const plan = planShift(shift)
  return plan.out + plan.in
}

/**
 * Selector pose at selector-clock time `t`: members that must disengage
 * slide back to neutral first, then the selected member slides home.
 */
export function selectorPoseAt(shift: Shift, t: number, instant = false): SelectorPose {
  const plan = planShift(shift)
  if (instant) return plan.target
  const elapsed = t - shift.start
  if (elapsed < plan.out) {
    const u = ease(elapsed / plan.out)
    const pose = { ...shift.from }
    for (const m of SELECTOR_MEMBERS) pose[m] = shift.from[m] + (plan.mid[m] - shift.from[m]) * u
    return pose
  }
  const pose = { ...plan.mid }
  if (plan.member) {
    const u = plan.in > 0 ? ease((elapsed - plan.out) / plan.in) : 1
    const m = plan.member
    pose[m] = u >= 1 ? plan.target[m] : plan.mid[m] + (plan.target[m] - plan.mid[m]) * u
  }
  return pose
}

/** How far the selected member has travelled towards engagement (0..1). */
export function engageProgress(pose: SelectorPose, gear: GearId): number {
  if (gear === 'N') return 0
  const { member, dir } = SELECTOR[gear]
  return Math.max(0, pose[member] * dir)
}

/* ------------------------------------------------------------------ */
/* Mainshaft lock                                                       */
/* ------------------------------------------------------------------ */

/** Free mainshaft coasting from `angle` at `speed` (rad/s) since drive time `since`. */
export interface Coast {
  angle: number
  speed: number
  since: number
}

export type OutputLock =
  | { mode: 'free'; coast: Coast }
  | { mode: 'sync'; gear: DriveGearId; k: number; coast: Coast }
  | { mode: 'locked'; gear: DriveGearId; k: number }

export const coastAngle = (c: Coast, driveTime: number) =>
  c.angle + c.speed * COAST_SECONDS * (1 - Math.exp(-Math.max(0, driveTime - c.since) / COAST_SECONDS))

export const coastSpeed = (c: Coast, driveTime: number) => c.speed * Math.exp(-Math.max(0, driveTime - c.since) / COAST_SECONDS)

export const lockedAngle = (gear: DriveGearId, k: number, train: TrainAngles) => lockedBase(gear, train) + k * lockPitch(gear)

/** Visual mainshaft speed (rad/s) when locked in a gear, for a visual input speed. */
export const lockedSpeed = (gear: DriveGearId, inputSpeed: number) => inputSpeed / (gearRatio(gear) ?? Infinity)

/** Synchroniser blend weight from the engaging member's travel. */
export const syncWeight = (progress: number) => ease((progress - SHIFT_TIMING.syncFrom) / (1 - SHIFT_TIMING.syncFrom))

/* ------------------------------------------------------------------ */
/* Simulation state                                                     */
/* ------------------------------------------------------------------ */

export interface DriveControls {
  gear: GearId
  pedal: number
  rpm: number
  running: boolean
  /** Reduced motion: collars jump to their positions instead of sliding. */
  instant: boolean
}

export interface DriveSim {
  /** Seconds; always advances (selector slides still animate while rotation is paused). */
  selectorTime: number
  /** Seconds; advances only while rotation runs. */
  driveTime: number
  /** Input-shaft angle, rad — the single integrated gear-train phase. */
  phase: number
  /** Flywheel lead over the clutch disc, rad — advances only while the clutch slips. */
  slip: number
  /** Last visual input-shaft speed, rad/s. */
  inputSpeed: number
  shift: Shift
  lock: OutputLock
}

export function createDriveSim(gear: GearId): DriveSim {
  const pose = targetPose(gear)
  const engaged = engagedGear(pose)
  return {
    selectorTime: 0,
    driveTime: 0,
    phase: 0,
    slip: 0,
    inputSpeed: 0,
    shift: { from: pose, to: gear, start: 0 },
    lock: engaged ? { mode: 'locked', gear: engaged, k: 0 } : { mode: 'free', coast: { angle: 0, speed: 0, since: 0 } },
  }
}

/** Mainshaft angle for a lock state. */
export function outputAngle(lock: OutputLock, train: TrainAngles, driveTime: number, progress: number): number {
  switch (lock.mode) {
    case 'locked':
      return lockedAngle(lock.gear, lock.k, train)
    case 'free':
      return coastAngle(lock.coast, driveTime)
    case 'sync': {
      const w = syncWeight(progress)
      const free = coastAngle(lock.coast, driveTime)
      return free + (lockedAngle(lock.gear, lock.k, train) - free) * w
    }
  }
}

function outputSpeedNow(lock: OutputLock, inputSpeed: number, driveTime: number, progress: number): number {
  switch (lock.mode) {
    case 'locked':
      return lockedSpeed(lock.gear, inputSpeed)
    case 'free':
      return coastSpeed(lock.coast, driveTime)
    case 'sync': {
      const w = syncWeight(progress)
      return coastSpeed(lock.coast, driveTime) * (1 - w) + lockedSpeed(lock.gear, inputSpeed) * w
    }
  }
}

/** Resolve lock transitions for the current pose (release, start synchronising, lock). */
function resolveLock(sim: DriveSim, pose: SelectorPose, train: TrainAngles): OutputLock {
  let lock = sim.lock
  const engaged = engagedGear(pose)
  const target = sim.shift.to
  const progress = engageProgress(pose, target)
  for (let i = 0; i < 4; i++) {
    const angle = outputAngle(lock, train, sim.driveTime, lock.mode === 'sync' ? engageProgress(pose, lock.gear) : progress)
    if (lock.mode === 'locked' && engaged !== lock.gear) {
      lock = { mode: 'free', coast: { angle, speed: lockedSpeed(lock.gear, sim.inputSpeed), since: sim.driveTime } }
      continue
    }
    if (lock.mode === 'sync' && lock.gear !== target) {
      const speed = outputSpeedNow(lock, sim.inputSpeed, sim.driveTime, engageProgress(pose, lock.gear))
      lock = { mode: 'free', coast: { angle, speed, since: sim.driveTime } }
      continue
    }
    if (lock.mode === 'free' && target !== 'N' && progress >= SHIFT_TIMING.syncFrom) {
      const pitch = lockPitch(target)
      const k = Math.round((angle - lockedBase(target, train)) / pitch)
      lock = { mode: 'sync', gear: target, k, coast: lock.coast }
      continue
    }
    if (lock.mode === 'sync' && engaged === lock.gear) {
      lock = { mode: 'locked', gear: lock.gear, k: lock.k }
      continue
    }
    break
  }
  return lock
}

/** Advance the simulation by `dt` seconds. Returns a new state. */
export function stepDriveSim(sim: DriveSim, dt: number, c: DriveControls): DriveSim {
  const step = Math.max(0, dt)
  const selectorTime = sim.selectorTime + step
  let shift = sim.shift
  if (c.gear !== shift.to) {
    // Redirected mid-shift: start from wherever the selector is now.
    shift = { from: selectorPoseAt(sim.shift, sim.selectorTime, c.instant), to: c.gear, start: sim.selectorTime }
  }

  const torqueFraction = clutchTorqueFraction(clutchEngagement(c.pedal))
  const engineSpeed = c.running ? visualRadPerSecond(c.rpm) : 0
  const inputSpeed = engineSpeed * torqueFraction
  const driveStep = c.running ? step : 0
  const next: DriveSim = {
    selectorTime,
    driveTime: sim.driveTime + driveStep,
    phase: sim.phase + inputSpeed * driveStep,
    // Only a slipping clutch lets the flywheel run ahead of the disc.
    slip: torqueFraction < 1 ? sim.slip + (engineSpeed - inputSpeed) * driveStep : sim.slip,
    inputSpeed,
    shift,
    lock: sim.lock,
  }
  const pose = selectorPoseAt(shift, selectorTime, c.instant)
  next.lock = resolveLock(next, pose, trainAngles(next.phase))
  return next
}

/* ------------------------------------------------------------------ */
/* Frame (everything the scene draws)                                   */
/* ------------------------------------------------------------------ */

export interface DriveFrame {
  /** Flywheel, pressure plate, cover and diaphragm. */
  engine: number
  train: TrainAngles
  /** Mainshaft, its hubs, collars and fixed reverse gear. */
  output: number
  pose: SelectorPose
  engaged: DriveGearId | null
  torqueFraction: number
  clutch: ClutchPose
  path: ReadonlySet<PathKey>
}

export function driveFrame(sim: DriveSim, c: Pick<DriveControls, 'pedal' | 'instant'>): DriveFrame {
  const pose = selectorPoseAt(sim.shift, sim.selectorTime, c.instant)
  const engaged = engagedGear(pose)
  const engagement = clutchEngagement(c.pedal)
  const torqueFraction = clutchTorqueFraction(engagement)
  const train = trainAngles(sim.phase)
  const progress = sim.lock.mode === 'sync' ? engageProgress(pose, sim.lock.gear) : 0
  return {
    engine: sim.phase + sim.slip,
    train,
    output: outputAngle(sim.lock, train, sim.driveTime, progress),
    pose,
    engaged,
    torqueFraction,
    clutch: clutchPose(c.pedal, engagement),
    path: new Set(powerPathKeys(engaged, torqueFraction)),
  }
}
