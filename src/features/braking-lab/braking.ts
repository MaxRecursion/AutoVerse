/**
 * Disc-brake laboratory — pure physics (no three.js, no React).
 *
 * One braking event of an ILLUSTRATIVE quarter-car (one wheel carrying a
 * quarter of a 1,600 kg car) is computed in closed form from the lab params:
 *
 *   pedal force → pedal lever → servo → master-cylinder pressure
 *   → caliper clamp force → pad friction → brake torque → tyre force
 *   → deceleration (capped by tyre grip μ·g) → stopping time / distance
 *   → kinetic energy ½mv² converted to heat → disc temperature rise.
 *
 * Everything the scene, readouts, charts and 2D diagram show is a pure
 * function of (params, time) — there is no per-frame integration — so play,
 * pause, scrub and step always agree. The ABS part is CONCEPTUAL: a stylised
 * hold / release / reapply cycle that keeps wheel slip in an illustrative
 * 10–20 % band. It is not a vehicle-dynamics or tyre model.
 */
import type { LabParamValue } from '@/lib/simulation/labStore'

/* ------------------------------------------------------------------ */
/* Units and helpers                                                    */
/* ------------------------------------------------------------------ */

export const G = 9.81
/** Multiply km/h by this to get m/s. */
export const KMH = 1 / 3.6
export const BAR = 1e5

const clamp01 = (v: number) => (v <= 0 ? 0 : v >= 1 ? 1 : v)
const lerp = (a: number, b: number, k: number) => a + (b - a) * k
/** Floating-point mod that is always in [0, m). */
const mod = (v: number, m: number) => ((v % m) + m) % m

/** Area of a circle from its diameter in millimetres, in m². */
export const boreArea = (diameterMm: number) => Math.PI * (diameterMm / 2000) ** 2

/* ------------------------------------------------------------------ */
/* Illustrative vehicle, brake and surface data                         */
/* ------------------------------------------------------------------ */

export type SurfaceId = 'dry' | 'wet' | 'ice'

export interface SurfaceSpec {
  id: SurfaceId
  label: string
  /** Peak tyre–road friction coefficient (best braking, around 10–20 % slip). */
  muPeak: number
  /** Friction coefficient of a fully locked, sliding tyre. */
  muSlide: number
}

export const SURFACE_IDS = ['dry', 'wet', 'ice'] as const satisfies readonly SurfaceId[]

/** Illustrative road surfaces — real values vary with tyre, temperature, water depth and road texture. */
export const SURFACES: Record<SurfaceId, SurfaceSpec> = {
  dry: { id: 'dry', label: 'Dry asphalt', muPeak: 1.0, muSlide: 0.75 },
  wet: { id: 'wet', label: 'Wet asphalt', muPeak: 0.7, muSlide: 0.5 },
  ice: { id: 'ice', label: 'Ice', muPeak: 0.15, muSlide: 0.08 },
}

export interface BrakeSpec {
  /** Pedal lever ratio (pushrod force ÷ foot force). */
  pedalRatio: number
  /** Servo (brake booster) output ÷ input force. */
  servoGain: number
  masterBoreMm: number
  caliperBoreMm: number
  /** Pad-to-disc friction coefficient. */
  padMu: number
  /** Friction faces per caliper (inner + outer pad). */
  padFaces: number
  /** Radius at which the pad friction acts on the disc. */
  effectiveRadiusM: number
  tyreRadiusM: number
  /** Quarter-car mass carried by this wheel. */
  cornerMassKg: number
  discMassKg: number
  /** Specific heat of grey cast iron, J/(kg·K). */
  discSpecificHeat: number
  /** Disc temperature at the start of the stop. */
  startTempC: number
}

/** Illustrative values for a mid-size family car's front corner (not data for any real vehicle). */
export const BRAKE_SPEC: BrakeSpec = {
  pedalRatio: 3.5,
  servoGain: 3,
  masterBoreMm: 22.2,
  caliperBoreMm: 57,
  padMu: 0.4,
  padFaces: 2,
  effectiveRadiusM: 0.12,
  tyreRadiusM: 0.31,
  cornerMassKg: 400,
  discMassKg: 7.5,
  discSpecificHeat: 460,
  startTempC: 30,
}

/* ------------------------------------------------------------------ */
/* Lab parameters                                                       */
/* ------------------------------------------------------------------ */

export interface BrakingParams {
  /** Driver's foot force on the pedal, N. */
  pedalN: number
  /** Speed when the brakes are applied, km/h. */
  speedKmh: number
  surface: SurfaceId
  abs: boolean
}

/** Keys of the lab store's params. */
export const PARAM = { pedal: 'pedal', speed: 'speed', surface: 'surface', abs: 'abs' } as const

export const PEDAL_RANGE = { min: 30, max: 300, step: 10 } as const
export const SPEED_RANGE = { min: 30, max: 140, step: 10 } as const

export const DEFAULT_PARAMS: BrakingParams = { pedalN: 120, speedKmh: 80, surface: 'dry', abs: true }

const isSurface = (v: unknown): v is SurfaceId => typeof v === 'string' && (SURFACE_IDS as readonly string[]).includes(v)
const numberIn = (v: unknown, range: { min: number; max: number }, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(range.max, Math.max(range.min, v)) : fallback

/** Typed, range-checked params from the lab store's loose param record. */
export function readParams(raw: Readonly<Record<string, LabParamValue>>): BrakingParams {
  const surface = raw[PARAM.surface]
  const abs = raw[PARAM.abs]
  return {
    pedalN: numberIn(raw[PARAM.pedal], PEDAL_RANGE, DEFAULT_PARAMS.pedalN),
    speedKmh: numberIn(raw[PARAM.speed], SPEED_RANGE, DEFAULT_PARAMS.speedKmh),
    surface: isSurface(surface) ? surface : DEFAULT_PARAMS.surface,
    abs: typeof abs === 'boolean' ? abs : DEFAULT_PARAMS.abs,
  }
}

/** The lab-store param record for typed params. */
export function toLabParams(p: BrakingParams): Record<string, LabParamValue> {
  return { [PARAM.pedal]: p.pedalN, [PARAM.speed]: p.speedKmh, [PARAM.surface]: p.surface, [PARAM.abs]: p.abs }
}

/* ------------------------------------------------------------------ */
/* Hydraulics: force multiplication                                     */
/* ------------------------------------------------------------------ */

export interface WheelForces {
  /** Caliper pressure, Pa. */
  pressurePa: number
  /** Force of the caliper piston on the pads (the clamp), N. */
  clampN: number
  /** Total friction force of both pads on the disc while they slip, N. */
  frictionN: number
  /** Brake torque on the disc, N·m. */
  torqueNm: number
  /** Braking force the torque asks of the tyre at the road, N. */
  tyreForceN: number
  /** Deceleration that tyre force would give the quarter-car, m/s² (before any grip limit). */
  decel: number
}

/** Forces at the wheel for a given caliper pressure. */
export function forcesAtPressure(pressurePa: number, spec: BrakeSpec = BRAKE_SPEC): WheelForces {
  const clampN = pressurePa * boreArea(spec.caliperBoreMm)
  const frictionN = spec.padFaces * spec.padMu * clampN
  const torqueNm = frictionN * spec.effectiveRadiusM
  const tyreForceN = torqueNm / spec.tyreRadiusM
  return { pressurePa, clampN, frictionN, torqueNm, tyreForceN, decel: tyreForceN / spec.cornerMassKg }
}

export interface HydraulicChain extends WheelForces {
  pedalN: number
  /** Force on the servo input pushrod after the pedal lever, N. */
  pushrodN: number
  /** Force on the master-cylinder piston after servo assistance, N. */
  masterForceN: number
}

/** Follow a foot force through lever, servo and master cylinder to the wheel. */
export function hydraulicChain(pedalN: number, spec: BrakeSpec = BRAKE_SPEC): HydraulicChain {
  const pushrodN = pedalN * spec.pedalRatio
  const masterForceN = pushrodN * spec.servoGain
  const pressurePa = masterForceN / boreArea(spec.masterBoreMm)
  return { pedalN, pushrodN, masterForceN, ...forcesAtPressure(pressurePa, spec) }
}

/** Overall foot-force → clamp-force multiplication (lever × servo × piston-area ratio). */
export function clampMultiplication(spec: BrakeSpec = BRAKE_SPEC): number {
  return spec.pedalRatio * spec.servoGain * (boreArea(spec.caliperBoreMm) / boreArea(spec.masterBoreMm))
}

/** Highest master-cylinder pressure the pedal slider can make — the scale for pressure colours and gauges. */
export const PRESSURE_SCALE_PA = hydraulicChain(PEDAL_RANGE.max).pressurePa

/* ------------------------------------------------------------------ */
/* Energy and heat                                                      */
/* ------------------------------------------------------------------ */

export const kineticEnergy = (massKg: number, speed: number) => 0.5 * massKg * speed * speed

/** Bulk disc temperature rise if all of `energyJ` went into the disc (no cooling, pads take none): ΔT = E / (m·c). */
export const discTemperatureRise = (energyJ: number, spec: BrakeSpec = BRAKE_SPEC) => energyJ / (spec.discMassKg * spec.discSpecificHeat)

/* ------------------------------------------------------------------ */
/* Event timing and the conceptual ABS cycle                            */
/* ------------------------------------------------------------------ */

export interface EventTiming {
  /** Rolling with the pedal up before the brakes are applied, s. */
  leadIn: number
  /** Time for pressure to rise from zero to the driver's full pressure, s. */
  applyTime: number
  /** Standstill shown after the stop, s. */
  holdAfterStop: number
  /** Upper bound on how long a locking wheel takes to spin down, s. */
  lockUpTime: number
  /** Slip rise between the grip limit and ABS's first hold, s. */
  absOnset: number
  /** One stylised hold → release → hold → reapply cycle, s. */
  absPeriod: number
  /** Share of peak grip the stylised ABS achieves while cycling. */
  absEfficiency: number
}

export const EVENT_TIMING: EventTiming = {
  leadIn: 0.4,
  applyTime: 0.25,
  holdAfterStop: 0.6,
  lockUpTime: 0.12,
  absOnset: 0.05,
  absPeriod: 0.16,
  absEfficiency: 0.92,
}

/** Illustrative slip band the conceptual ABS holds the tyre in. */
export const ABS_SLIP_BAND = { low: 0.1, high: 0.2 } as const

export type AbsValveState = 'inactive' | 'hold' | 'release' | 'reapply'

/**
 * One stylised ABS cycle, as fractions of the period:
 *   hold (inlet closed) → release (outlet opens, pressure falls)
 *   → hold (wheel recovers) → reapply (inlet opens, pressure climbs).
 * Slip lags pressure: it peaks during the first hold and bottoms out in the second.
 */
const CYCLE = {
  phases: [
    { state: 'hold', end: 0.1 },
    { state: 'release', end: 0.35 },
    { state: 'hold', end: 0.5 },
    { state: 'reapply', end: 1 },
  ] as const satisfies readonly { state: AbsValveState; end: number }[],
  /** Piecewise-linear knots [phase, slip]. */
  slip: [
    [0, 0.185],
    [0.1, 0.2],
    [0.35, 0.14],
    [0.5, 0.1],
    [1, 0.185],
  ] as const,
  /** Piecewise-linear knots [phase, 0 = low pressure … 1 = high pressure]. */
  pressure: [
    [0, 1],
    [0.1, 1],
    [0.35, 0],
    [0.5, 0],
    [1, 1],
  ] as const,
} as const

/** ABS caliper pressure band, as multiples of the pressure at which the tyre reaches its grip limit. */
export const ABS_PRESSURE_BAND = { low: 0.6, high: 1.05 } as const

type Knots = readonly (readonly [number, number])[]

function knotValue(knots: Knots, x: number): number {
  for (let i = 1; i < knots.length; i++) {
    const [x1, y1] = knots[i]
    const [x0, y0] = knots[i - 1]
    if (x <= x1) return x1 === x0 ? y1 : lerp(y0, y1, (x - x0) / (x1 - x0))
  }
  return knots[knots.length - 1][1]
}

/** Valve state at a cycle phase φ ∈ [0, 1). */
export function absValveAtPhase(phi: number): AbsValveState {
  const p = mod(phi, 1)
  return CYCLE.phases.find((ph) => p < ph.end)?.state ?? 'reapply'
}

/** Stylised wheel slip at a cycle phase. */
export const absSlipAtPhase = (phi: number) => knotValue(CYCLE.slip, mod(phi, 1))

/** Stylised pressure level (0 = band low, 1 = band high) at a cycle phase. */
export const absPressureLevelAtPhase = (phi: number) => knotValue(CYCLE.pressure, mod(phi, 1))

/** Slip at the start of each cycle (the onset ramps up to it). */
const CYCLE_START_SLIP = CYCLE.slip[0][1]

/**
 * ∫ (vStart − a·u)·s(u) du for u from 0 to `upTo` within one cycle of period T.
 * The integrand is quadratic on each linear slip piece, so Simpson's rule is exact.
 */
function cycleSlipIntegral(vStart: number, a: number, period: number, upTo: number): number {
  let sum = 0
  for (let i = 1; i < CYCLE.slip.length; i++) {
    const u0 = CYCLE.slip[i - 1][0] * period
    const u1 = Math.min(CYCLE.slip[i][0] * period, upTo)
    if (u1 <= u0) break
    const f = (u: number) => (vStart - a * u) * absSlipAtPhase(u / period)
    const m = (u0 + u1) / 2
    sum += ((u1 - u0) / 6) * (f(u0) + 4 * f(m) + f(u1))
  }
  return sum
}

/* ------------------------------------------------------------------ */
/* Vehicle kinematics: piecewise constant jerk                          */
/* ------------------------------------------------------------------ */

interface Segment {
  t0: number
  t1: number
  /** Deceleration at t0 (positive = slowing), m/s². */
  a0: number
  /** Rate of change of deceleration, m/s³. */
  jerk: number
  v0: number
  x0: number
}

interface Kinematics {
  v: number
  x: number
  /** Deceleration, m/s². */
  a: number
}

const segV = (s: Segment, u: number) => s.v0 - s.a0 * u - 0.5 * s.jerk * u * u
const segX = (s: Segment, u: number) => s.x0 + s.v0 * u - 0.5 * s.a0 * u * u - (s.jerk * u * u * u) / 6

/** Time into a segment at which the speed reaches zero, or Infinity. */
function segStopTime(s: Segment): number {
  if (s.v0 <= 0) return 0
  if (Math.abs(s.jerk) < 1e-12) return s.a0 > 0 ? s.v0 / s.a0 : Infinity
  // ½ j u² + a0 u − v0 = 0
  const disc = s.a0 * s.a0 + 2 * s.jerk * s.v0
  if (disc < 0) return Infinity
  const u = (-s.a0 + Math.sqrt(disc)) / s.jerk
  return u >= 0 ? u : Infinity
}

/**
 * Chain deceleration pieces (duration, starting decel, jerk) from an initial
 * speed, stopping at the first instant the speed reaches zero.
 */
function buildSegments(pieces: { duration: number; a0: number; jerk: number }[], v0: number): { segments: Segment[]; tStop: number } {
  const segments: Segment[] = []
  let t = 0
  let v = v0
  let x = 0
  for (const piece of pieces) {
    const seg: Segment = { t0: t, t1: t + piece.duration, a0: piece.a0, jerk: piece.jerk, v0: v, x0: x }
    const uStop = segStopTime(seg)
    if (uStop <= piece.duration) {
      seg.t1 = t + uStop
      segments.push(seg)
      return { segments, tStop: seg.t1 }
    }
    segments.push(seg)
    if (!Number.isFinite(piece.duration)) break
    v = segV(seg, piece.duration)
    x = segX(seg, piece.duration)
    t += piece.duration
  }
  return { segments, tStop: Infinity }
}

function kinematicsAt(segments: Segment[], tStop: number, t: number): Kinematics {
  if (t >= tStop) {
    const last = segments[segments.length - 1]
    return { v: 0, x: segX(last, last.t1 - last.t0), a: 0 }
  }
  const seg = segments.find((s) => t < s.t1) ?? segments[segments.length - 1]
  const u = Math.max(0, t - seg.t0)
  return { v: Math.max(0, segV(seg, u)), x: segX(seg, u), a: seg.a0 + seg.jerk * u }
}

/* ------------------------------------------------------------------ */
/* The stop plan                                                        */
/* ------------------------------------------------------------------ */

/**
 * - `within-grip`: the brakes never ask more of the tyre than it can give; the wheel keeps rolling.
 * - `lock`: no ABS and the brake demand exceeds grip — the wheel locks and the tyre slides.
 * - `abs`: ABS on and the demand exceeds grip — the stylised ABS cycle holds slip in its band.
 */
export type StopMode = 'within-grip' | 'lock' | 'abs'

export type BrakingPhase = 'rolling' | 'apply' | 'braking' | 'wheel-lock' | 'abs-active' | 'stopped'

export interface StopPlan {
  params: BrakingParams
  spec: BrakeSpec
  timing: EventTiming
  surface: SurfaceSpec
  /** Speed at pedal application, m/s. */
  v0: number
  /** The hydraulic chain at the driver's full pedal force. */
  chain: HydraulicChain
  /** Deceleration the brakes ask for at full pressure, m/s². */
  demandDecel: number
  /** Most deceleration the tyre can give (μ_peak·g), m/s². */
  gripDecel: number
  mode: StopMode
  /** Deceleration once the pressure ramp ends (within grip) or the grip limit is reached (lock / ABS), m/s². */
  limitedDecel: number
  /** Pedal application, s. */
  tApply: number
  /** End of the pressure ramp, s. */
  tRampEnd: number
  /** Instant the brake demand reaches the grip limit (Infinity when it never does), s. */
  tLimit: number
  /** Caliper pressure at which the demand equals the grip limit, Pa (Infinity when never reached). */
  limitPressurePa: number
  /** Start of the first ABS cycle, s. */
  tAbsCycles: number
  tStop: number
  /** Length of the whole timeline (stop + standstill), s. */
  duration: number
  /** Vehicle speed and road travel at tLimit. */
  atLimit: { v: number; x: number }
  /** Wheel spin-down rate while locking, m/s² of tyre surface speed. */
  wheelSpinDown: number
  segments: Segment[]
}

/** Build the closed-form plan for one stop. `timing` and `spec` are injectable for tests. */
export function planStop(params: BrakingParams, timing: EventTiming = EVENT_TIMING, spec: BrakeSpec = BRAKE_SPEC): StopPlan {
  if (!(params.pedalN > 0) || !(params.speedKmh > 0)) throw new RangeError('planStop needs a positive pedal force and speed')
  const surface = SURFACES[params.surface]
  const v0 = params.speedKmh * KMH
  const chain = hydraulicChain(params.pedalN, spec)
  const demandDecel = chain.decel
  const gripDecel = surface.muPeak * G
  const limited = demandDecel > gripDecel
  const mode: StopMode = !limited ? 'within-grip' : params.abs ? 'abs' : 'lock'
  const limitedDecel = mode === 'within-grip' ? demandDecel : mode === 'lock' ? surface.muSlide * G : timing.absEfficiency * gripDecel

  const tApply = timing.leadIn
  const ramp = timing.applyTime
  const tRampEnd = tApply + ramp
  // While the pressure ramps, deceleration rises linearly with it (demand below grip).
  const rampFractionAtLimit = limited ? gripDecel / demandDecel : 1
  const tLimit = limited ? tApply + ramp * rampFractionAtLimit : Infinity
  const rampDuration = ramp * rampFractionAtLimit
  const jerk = ramp > 0 ? demandDecel / ramp : 0

  const pieces = [{ duration: tApply, a0: 0, jerk: 0 }]
  if (rampDuration > 0) pieces.push({ duration: rampDuration, a0: 0, jerk })
  pieces.push({ duration: Infinity, a0: limitedDecel, jerk: 0 })
  const { segments, tStop } = buildSegments(pieces, v0)

  const limitKin = limited ? kinematicsAt(segments, tStop, tLimit) : { v: 0, x: 0 }
  const vLimit = limited && tLimit < tStop ? limitKin.v : 0
  return {
    params,
    spec,
    timing,
    surface,
    v0,
    chain,
    demandDecel,
    gripDecel,
    mode,
    limitedDecel,
    tApply,
    tRampEnd,
    tLimit,
    limitPressurePa: limited ? chain.pressurePa * rampFractionAtLimit : Infinity,
    tAbsCycles: tLimit + timing.absOnset,
    tStop,
    duration: tStop + timing.holdAfterStop,
    atLimit: { v: vLimit, x: limitKin.x },
    // Never slower than the car decelerates, so the wheel's surface speed can't exceed the car's.
    wheelSpinDown: Math.max(vLimit / Math.max(timing.lockUpTime, 1e-6), 2 * limitedDecel),
    segments,
  }
}

/* ------------------------------------------------------------------ */
/* State at an instant                                                  */
/* ------------------------------------------------------------------ */

export interface BrakingState {
  /** Time since the start of the timeline, s. */
  t: number
  phase: BrakingPhase
  /** Vehicle (quarter-car) speed, m/s. */
  vehicleSpeed: number
  /** Tyre surface speed (wheel angular speed × rolling radius), m/s. */
  wheelSpeed: number
  /** Longitudinal slip (v − v_wheel) / v, 0…1 (0 when stopped). */
  slip: number
  /** Vehicle deceleration, m/s². */
  decel: number
  /** Road travelled since the start of the timeline, m. */
  travel: number
  /** Road travelled since the pedal was applied, m. */
  brakingDistance: number
  /** Angle the wheel has turned since the start, rad (positive = rolling forwards). */
  wheelAngle: number
  masterPressurePa: number
  caliperPressurePa: number
  clampN: number
  /** Pad friction force while the pads slip on the disc, N. */
  frictionN: number
  torqueNm: number
  /** Kinetic energy converted so far, J (= ½m(v0² − v²)). */
  energyTotal: number
  /** Share converted by the brake (disc and pads), J. */
  energyBrake: number
  /** Share converted where the tyre slides on the road, J. */
  energyTyre: number
  /** Illustrative bulk disc temperature, °C. */
  discTempC: number
  /** 0 = pads at rest clearance … 1 = pads clamped on the disc. */
  padContact: number
  /** 0 = pedal up … 1 = pedal fully travelled (visual). */
  pedalTravel: number
  absValve: AbsValveState
  /** True while the wheel is not turning but the car still moves. */
  wheelLocked: boolean
}

const STANDSTILL = 1e-3

/** Phase of the stop at time t (the live lab cue). */
export function phaseAt(plan: StopPlan, t: number): BrakingPhase {
  if (t < plan.tApply) return 'rolling'
  if (t >= plan.tStop) return 'stopped'
  if (plan.mode === 'within-grip') return t < plan.tRampEnd ? 'apply' : 'braking'
  if (t < plan.tLimit) return 'apply'
  return plan.mode === 'lock' ? 'wheel-lock' : 'abs-active'
}

/** Caliper pressure smoothing back to the master-cylinder pressure once ABS stops cycling at standstill, s. */
const ABS_STANDSTILL_BLEND = 0.15

/** ∫ v·s dt from the grip limit to min(t, tStop) under ABS (closed form for whole cycles). */
function absSlipTravel(plan: StopPlan, t: number): number {
  const end = Math.min(t, plan.tStop)
  if (end <= plan.tLimit) return 0
  const a = plan.limitedDecel
  const { absOnset: onset, absPeriod: T } = plan.timing
  const vL = plan.atLimit.v
  // Onset: slip ramps linearly from 0 to the cycle's starting slip; product of two linear functions → Simpson exact.
  const onsetEnd = Math.min(end, plan.tAbsCycles)
  const U = onsetEnd - plan.tLimit
  const fOn = (u: number) => (vL - a * u) * (onset > 0 ? (CYCLE_START_SLIP * u) / onset : CYCLE_START_SLIP)
  let sum = (U / 6) * (fOn(0) + 4 * fOn(U / 2) + fOn(U))
  if (end <= plan.tAbsCycles) return sum
  // Whole cycles: Σ_k [(vC − a·k·T)·S0 − a·S1]
  const vC = vL - a * onset
  const elapsed = end - plan.tAbsCycles
  const n = Math.floor(elapsed / T)
  const S0 = cycleSlipIntegral(1, 0, T, T)
  // ∫ u·s(u) du = ∫ s du − ∫ (1 − u)·s du
  const S1 = S0 - cycleSlipIntegral(1, 1, T, T)
  sum += n * vC * S0 - a * T * S0 * ((n * (n - 1)) / 2) - n * a * S1
  // Partial cycle.
  sum += cycleSlipIntegral(vC - a * n * T, a, T, elapsed - n * T)
  return sum
}

/** Wheel slip at time t (before the car stops). */
function slipAt(plan: StopPlan, t: number): number {
  if (plan.mode === 'within-grip' || t <= plan.tLimit) return 0
  if (plan.mode === 'lock') return 1 // refined by the caller from the spin-down
  if (t < plan.tAbsCycles) return plan.timing.absOnset > 0 ? (CYCLE_START_SLIP * (t - plan.tLimit)) / plan.timing.absOnset : CYCLE_START_SLIP
  return absSlipAtPhase((t - plan.tAbsCycles) / plan.timing.absPeriod)
}

function absCaliperPressure(plan: StopPlan, t: number, masterPa: number): number {
  const hi = Math.min(masterPa, plan.limitPressurePa * ABS_PRESSURE_BAND.high)
  if (t < plan.tAbsCycles) return hi
  const lo = plan.limitPressurePa * ABS_PRESSURE_BAND.low
  const highCap = plan.limitPressurePa * ABS_PRESSURE_BAND.high
  return lerp(lo, highCap, absPressureLevelAtPhase((t - plan.tAbsCycles) / plan.timing.absPeriod))
}

function absValveAt(plan: StopPlan, t: number): AbsValveState {
  if (plan.mode !== 'abs' || t < plan.tAbsCycles || t >= plan.tStop) return 'inactive'
  return absValveAtPhase((t - plan.tAbsCycles) / plan.timing.absPeriod)
}

/** Everything the lab shows at time t of a stop. */
export function brakingStateAt(plan: StopPlan, tRaw: number): BrakingState {
  const t = Math.max(0, Math.min(tRaw, plan.duration))
  const { spec, timing } = plan
  const kin = kinematicsAt(plan.segments, plan.tStop, t)
  const xApply = kinematicsAt(plan.segments, plan.tStop, plan.tApply).x
  const ramp = timing.applyTime > 0 ? clamp01((t - plan.tApply) / timing.applyTime) : t >= plan.tApply ? 1 : 0
  const masterPa = plan.chain.pressurePa * ramp

  // Wheel: tyre surface speed and travel.
  let wheelSpeed = kin.v
  let wheelTravel = kin.x
  let energyTyre = 0
  if (plan.mode === 'lock' && t > plan.tLimit) {
    const vL = plan.atLimit.v
    const spinDownEnd = vL / plan.wheelSpinDown
    const u = Math.min(t - plan.tLimit, spinDownEnd)
    wheelSpeed = t >= plan.tStop ? 0 : Math.max(0, vL - plan.wheelSpinDown * (t - plan.tLimit))
    wheelTravel = plan.atLimit.x + vL * u - 0.5 * plan.wheelSpinDown * u * u
    energyTyre = spec.cornerMassKg * plan.limitedDecel * (kin.x - wheelTravel)
  } else if (plan.mode === 'abs' && t > plan.tLimit) {
    const slipTravel = absSlipTravel(plan, t)
    wheelTravel = kin.x - slipTravel
    wheelSpeed = t >= plan.tStop ? 0 : kin.v * (1 - slipAt(plan, t))
    energyTyre = spec.cornerMassKg * plan.limitedDecel * slipTravel
  }

  let caliperPa = masterPa
  if (plan.mode === 'abs' && t > plan.tLimit) {
    if (t < plan.tStop) caliperPa = absCaliperPressure(plan, t, masterPa)
    else {
      const atStop = absCaliperPressure(plan, plan.tStop, plan.chain.pressurePa)
      caliperPa = lerp(atStop, masterPa, clamp01((t - plan.tStop) / ABS_STANDSTILL_BLEND))
    }
  }
  const forces = forcesAtPressure(caliperPa, spec)
  const energyTotal = kineticEnergy(spec.cornerMassKg, plan.v0) - kineticEnergy(spec.cornerMassKg, kin.v)
  const energyBrake = Math.max(0, energyTotal - energyTyre)
  const moving = kin.v > STANDSTILL

  return {
    t,
    phase: phaseAt(plan, t),
    vehicleSpeed: kin.v,
    wheelSpeed,
    slip: moving ? clamp01((kin.v - wheelSpeed) / kin.v) : 0,
    decel: kin.a,
    travel: kin.x,
    brakingDistance: Math.max(0, kin.x - xApply),
    wheelAngle: wheelTravel / spec.tyreRadiusM,
    masterPressurePa: masterPa,
    caliperPressurePa: caliperPa,
    clampN: forces.clampN,
    frictionN: forces.frictionN,
    torqueNm: forces.torqueNm,
    energyTotal,
    energyBrake,
    energyTyre,
    discTempC: spec.startTempC + discTemperatureRise(energyBrake, spec),
    // Running clearance is taken up early in the ramp; pressure then builds with the pads touching.
    padContact: smoothstep(0, 0.3, ramp),
    pedalTravel: clamp01(0.35 * smoothstep(0, 0.3, ramp) + 0.65 * (masterPa / PRESSURE_SCALE_PA)),
    absValve: absValveAt(plan, t),
    wheelLocked: moving && wheelSpeed <= STANDSTILL,
  }
}

function smoothstep(e0: number, e1: number, x: number): number {
  const k = clamp01((x - e0) / (e1 - e0))
  return k * k * (3 - 2 * k)
}

/* ------------------------------------------------------------------ */
/* Summary                                                              */
/* ------------------------------------------------------------------ */

export interface StopSummary {
  mode: StopMode
  /** From pedal application to standstill, s. */
  stopTime: number
  /** From pedal application to standstill, m. */
  stopDistance: number
  /** Highest vehicle deceleration, m/s². */
  peakDecel: number
  energyTotal: number
  energyBrake: number
  energyTyre: number
  discRiseK: number
  finalDiscTempC: number
}

export function summarizeStop(plan: StopPlan): StopSummary {
  const end = brakingStateAt(plan, plan.duration)
  return {
    mode: plan.mode,
    stopTime: plan.tStop - plan.tApply,
    stopDistance: end.brakingDistance,
    // Limited stops touch the grip limit at the end of the pressure ramp, then settle lower.
    peakDecel: plan.mode === 'within-grip' ? plan.demandDecel : plan.gripDecel,
    energyTotal: end.energyTotal,
    energyBrake: end.energyBrake,
    energyTyre: end.energyTyre,
    discRiseK: end.discTempC - plan.spec.startTempC,
    finalDiscTempC: end.discTempC,
  }
}

/* ------------------------------------------------------------------ */
/* Store-facing helpers (memoised: called every frame)                  */
/* ------------------------------------------------------------------ */

const planCache = new Map<string, StopPlan>()
const PLAN_CACHE_SIZE = 24

const paramsKey = (p: BrakingParams) => `${p.pedalN}|${p.speedKmh}|${p.surface}|${p.abs ? 1 : 0}`

/** The (memoised) plan for typed params. */
export function planForParams(p: BrakingParams): StopPlan {
  const key = paramsKey(p)
  let plan = planCache.get(key)
  if (!plan) {
    plan = planStop(p)
    if (planCache.size >= PLAN_CACHE_SIZE) planCache.delete(planCache.keys().next().value as string)
    planCache.set(key, plan)
  }
  return plan
}

/** The (memoised) plan for the lab store's raw params. */
export const planFor = (raw: Readonly<Record<string, LabParamValue>>) => planForParams(readParams(raw))

export const timeAtProgress = (plan: StopPlan, progress: number) => Math.min(1, Math.max(0, progress)) * plan.duration
export const progressAtTime = (plan: StopPlan, t: number) => (plan.duration > 0 ? Math.min(1, Math.max(0, t / plan.duration)) : 0)

let lastState: { params: Readonly<Record<string, LabParamValue>>; progress: number; state: BrakingState } | null = null

/**
 * State for the store's params and progress. Cached on (params object, progress)
 * so the many scene parts that ask in the same frame share one evaluation.
 */
export function stateFor(params: Readonly<Record<string, LabParamValue>>, progress: number): BrakingState {
  if (lastState && lastState.params === params && lastState.progress === progress) return lastState.state
  const plan = planFor(params)
  const state = brakingStateAt(plan, timeAtProgress(plan, progress))
  lastState = { params, progress, state }
  return state
}

/** Simulated seconds per real second when the timeline plays at 1× over `cycleSeconds`. */
export const playbackRate = (plan: StopPlan, cycleSeconds: number) => plan.duration / cycleSeconds

/* ------------------------------------------------------------------ */
/* Sampling for charts                                                  */
/* ------------------------------------------------------------------ */

export interface StopSample {
  t: number
  vehicleSpeed: number
  wheelSpeed: number
  caliperPressurePa: number
  masterPressurePa: number
}

/** Evenly spaced samples of the stop, dense enough to resolve every ABS cycle. */
export function sampleStop(plan: StopPlan, minSamples = 240, maxSamples = 2400): StopSample[] {
  const perCycle = plan.mode === 'abs' ? Math.ceil((plan.duration / plan.timing.absPeriod) * 8) : 0
  const n = Math.min(maxSamples, Math.max(minSamples, perCycle))
  const out: StopSample[] = []
  for (let i = 0; i <= n; i++) {
    const s = brakingStateAt(plan, (i / n) * plan.duration)
    out.push({ t: s.t, vehicleSpeed: s.vehicleSpeed, wheelSpeed: s.wheelSpeed, caliperPressurePa: s.caliperPressurePa, masterPressurePa: s.masterPressurePa })
  }
  return out
}
