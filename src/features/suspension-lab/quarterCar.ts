/**
 * Quarter-car ride model — pure maths, no three.js, no React.
 *
 * Two masses on a vertical line:
 *
 *            ┌──────────┐  sprung mass m_s (a quarter of the body)   z_s ↑
 *            └──┬────┬──┘
 *        spring k   damper c   (+ rubber bump / rebound stops)
 *            ┌──┴────┴──┐  unsprung mass m_u (wheel, hub, knuckle…)  z_u ↑
 *            └────┬─────┘
 *            tyre k_t   (can only push: it lifts off when unloaded)
 *          ───────┴───────  road z_r(x), x = v·t
 *
 * Every displacement is measured from static equilibrium on a flat road
 * (gravity is balanced by the static spring and tyre preloads), so a car
 * standing on a flat road has z_s = z_u = 0. Suspension travel is
 * s = z_u − z_s (positive = compression / "bump", negative = extension /
 * "rebound").
 *
 * The equations are integrated with a fixed-step fourth-order Runge–Kutta
 * scheme. The lab loops one stretch of road, so the response it shows is the
 * periodic steady state ("the same bump every lap"), found by repeating the
 * lap until the state at the start and end of the lap agree — which makes the
 * whole response, and therefore every pose, a pure function of the inputs.
 *
 * All values are ILLUSTRATIVE teaching numbers for a mid-size car, not data
 * for any real vehicle.
 */

export const GRAVITY = 9.81

/* ------------------------------------------------------------------ */
/* Parameters                                                           */
/* ------------------------------------------------------------------ */

export interface QuarterCarParams {
  /** Sprung mass per corner, kg (a quarter of the body and its load). */
  sprungMass: number
  /** Unsprung mass, kg (wheel, tyre, hub, knuckle, brake, part of the arms). */
  unsprungMass: number
  /** Spring rate measured at the wheel (wheel rate), N/m. */
  springRate: number
  /** Low-speed damping coefficient measured at the wheel, N·s/m. */
  damping: number
  /** Travel speed (m/s) above which the damper becomes digressive. */
  damperKnee: number
  /** Slope above the knee as a fraction of `damping` (1 = linear damper). */
  damperHighSpeedFactor: number
  /** Vertical tyre stiffness, N/m. */
  tyreRate: number
  /** Compression at which the rubber bump stop starts to push, m. */
  bumpStopAt: number
  /** Extension at which the damper's rebound stop is reached, m (positive number). */
  reboundStopAt: number
  /** Stiffness of both end stops, N/m. */
  stopRate: number
}

/** Illustrative corner of a 1.2 t hatchback. */
export const BASE_PARAMS: QuarterCarParams = {
  sprungMass: 300,
  unsprungMass: 40,
  springRate: 25_000,
  damping: 0,
  damperKnee: 0.25,
  damperHighSpeedFactor: 0.4,
  tyreRate: 200_000,
  bumpStopAt: 0.058,
  reboundStopAt: 0.085,
  stopRate: 160_000,
}

export type DampingPreset = 'soft' | 'balanced' | 'stiff'

export const DAMPING_PRESETS: readonly { id: DampingPreset; label: string; ratio: number; summary: string }[] = [
  { id: 'soft', label: 'Too soft', ratio: 0.08, summary: 'Worn damper: the body floats and keeps bouncing.' },
  { id: 'balanced', label: 'Balanced', ratio: 0.32, summary: 'Motion dies away within about one bounce.' },
  { id: 'stiff', label: 'Too stiff', ratio: 1.1, summary: 'Damper so firm that bumps are pushed straight into the body.' },
] as const

export const isDampingPreset = (v: unknown): v is DampingPreset => DAMPING_PRESETS.some((p) => p.id === v)

export const dampingRatioOf = (preset: DampingPreset) => DAMPING_PRESETS.find((p) => p.id === preset)?.ratio ?? 0.32

/**
 * Damping coefficient for a damping ratio ζ of the body bounce mode, using
 * the classic single-mass approximation c = 2ζ·√(k·m_s). Presets are ratios,
 * so "balanced" stays balanced whatever spring rate is chosen.
 */
export const dampingFor = (ratio: number, springRate: number, sprungMass = BASE_PARAMS.sprungMass) =>
  2 * ratio * Math.sqrt(springRate * sprungMass)

/** Static tyre squash under the corner's weight, m. */
export const staticTyreDeflection = (p: QuarterCarParams) => ((p.sprungMass + p.unsprungMass) * GRAVITY) / p.tyreRate

/** Static tyre load, N. */
export const staticTyreLoad = (p: QuarterCarParams) => (p.sprungMass + p.unsprungMass) * GRAVITY

/** Ride rate: spring and tyre in series, N/m. */
export const rideRate = (p: QuarterCarParams) => (p.springRate * p.tyreRate) / (p.springRate + p.tyreRate)

/** Body-bounce natural frequency (Hz), approximate: ride rate on the sprung mass. */
export const bodyFrequency = (p: QuarterCarParams) => Math.sqrt(rideRate(p) / p.sprungMass) / (2 * Math.PI)

/** Wheel-hop natural frequency (Hz), approximate: spring + tyre on the unsprung mass. */
export const wheelHopFrequency = (p: QuarterCarParams) => Math.sqrt((p.springRate + p.tyreRate) / p.unsprungMass) / (2 * Math.PI)

/* ------------------------------------------------------------------ */
/* Road profiles                                                        */
/* ------------------------------------------------------------------ */

export type RoadInputId = 'bump' | 'pothole' | 'washboard' | 'flat'

export interface RoadProfile {
  id: RoadInputId | (string & {})
  label: string
  /** Road surface height (m) at distance x (m) along one lap, x ∈ [0, lapLength). */
  height: (x: number) => number
  /** Where the feature begins and ends along the lap (m). */
  start: number
  end: number
}

/** Vehicle speed over the test road, m/s (18 km/h — a speed you would cross a hump at). */
export const ROAD_SPEED = 5
/** Simulated seconds per lap of the test road. */
export const LAP_SECONDS = 2
/** Lap length, m. */
export const LAP_LENGTH = ROAD_SPEED * LAP_SECONDS
/** Every road feature starts here (m), giving 0.4 s of approach. */
export const FEATURE_START = 2

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

export const BUMP = { length: 0.9, height: 0.06 } as const
/** Pothole: the edges are rounded over `edge` m, standing in for the way a tyre envelopes a sharp step. */
export const POTHOLE = { length: 0.6, depth: 0.05, edge: 0.07 } as const
/** Washboard ripples tuned near wheel-hop frequency at ROAD_SPEED. */
export const WASHBOARD = { wavelength: 0.42, amplitude: 0.005, waves: 8 } as const

export const ROAD_PROFILES: Record<RoadInputId, RoadProfile> = {
  flat: { id: 'flat', label: 'Flat road', height: () => 0, start: FEATURE_START, end: FEATURE_START },
  bump: {
    id: 'bump',
    label: 'Single bump',
    start: FEATURE_START,
    end: FEATURE_START + BUMP.length,
    height: (x) => {
      const u = (x - FEATURE_START) / BUMP.length
      return u <= 0 || u >= 1 ? 0 : (BUMP.height / 2) * (1 - Math.cos(2 * Math.PI * u))
    },
  },
  pothole: {
    id: 'pothole',
    label: 'Pothole',
    start: FEATURE_START,
    end: FEATURE_START + POTHOLE.length,
    height: (x) => {
      const a = FEATURE_START
      const b = FEATURE_START + POTHOLE.length
      if (x <= a || x >= b) return 0
      return -POTHOLE.depth * smoothstep(a, a + POTHOLE.edge, x) * (1 - smoothstep(b - POTHOLE.edge, b, x))
    },
  },
  washboard: {
    id: 'washboard',
    label: 'Washboard ripples',
    start: FEATURE_START,
    end: FEATURE_START + WASHBOARD.wavelength * WASHBOARD.waves,
    height: (x) => {
      const u = (x - FEATURE_START) / WASHBOARD.wavelength
      return u <= 0 || u >= WASHBOARD.waves ? 0 : WASHBOARD.amplitude * (1 - Math.cos(2 * Math.PI * u))
    },
  },
}

export const ROAD_INPUTS: readonly { id: Exclude<RoadInputId, 'flat'>; label: string; summary: string }[] = [
  { id: 'bump', label: 'Single bump', summary: `A smooth ${BUMP.height * 1000} mm hump, ${BUMP.length} m long.` },
  { id: 'pothole', label: 'Pothole', summary: `A ${POTHOLE.depth * 1000} mm deep hole, ${POTHOLE.length} m long, with sharp edges.` },
  {
    id: 'washboard',
    label: 'Washboard',
    summary: `${WASHBOARD.waves} ripples ${WASHBOARD.amplitude * 2000} mm high, ${WASHBOARD.wavelength * 100} cm apart — close to the wheel's own hop frequency.`,
  },
] as const

export const isRoadInput = (v: unknown): v is Exclude<RoadInputId, 'flat'> => ROAD_INPUTS.some((r) => r.id === v)

/** Road height at a distance that may lie outside one lap (the road repeats every lap). */
export const roadHeightAt = (road: RoadProfile, x: number) => road.height(((x % LAP_LENGTH) + LAP_LENGTH) % LAP_LENGTH)

/* ------------------------------------------------------------------ */
/* Dynamics                                                             */
/* ------------------------------------------------------------------ */

/** State vector: body and wheel displacement (m) and velocity (m/s). */
export interface QuarterCarState {
  zs: number
  vs: number
  zu: number
  vu: number
}

export const REST: Readonly<QuarterCarState> = { zs: 0, vs: 0, zu: 0, vu: 0 }

/** Force of the rubber bump stop (positive, s > bumpStopAt) or rebound stop (negative, s < −reboundStopAt). */
export function endStopForce(p: QuarterCarParams, travel: number): number {
  if (travel > p.bumpStopAt) return p.stopRate * (travel - p.bumpStopAt)
  if (travel < -p.reboundStopAt) return p.stopRate * (travel + p.reboundStopAt)
  return 0
}

/**
 * Damper force (N, + resists compression). Linear up to the knee speed, then
 * digressive: real dampers open blow-off valves at high piston speed, so the
 * force rises more gently. Always opposes motion, so it can only remove energy.
 */
export function damperForce(p: QuarterCarParams, travelVelocity: number): number {
  const v = Math.abs(travelVelocity)
  const f = v <= p.damperKnee ? p.damping * v : p.damping * (p.damperKnee + p.damperHighSpeedFactor * (v - p.damperKnee))
  return Math.sign(travelVelocity) * f
}

/** Suspension force on the body (upwards) — and on the wheel (downwards). Deviation from the static preload. */
export function suspensionForce(p: QuarterCarParams, travel: number, travelVelocity: number): number {
  return p.springRate * travel + damperForce(p, travelVelocity) + endStopForce(p, travel)
}

/** Total tyre load (N). Zero when the tyre has lifted off the road — a tyre cannot pull the wheel down. */
export function tyreForce(p: QuarterCarParams, roadZ: number, wheelZ: number): number {
  return Math.max(0, staticTyreLoad(p) + p.tyreRate * (roadZ - wheelZ))
}

type Derivative = [number, number, number, number]

function derivative(p: QuarterCarParams, s: QuarterCarState, roadZ: number): Derivative {
  const fs = suspensionForce(p, s.zu - s.zs, s.vu - s.vs)
  const ft = tyreForce(p, roadZ, s.zu)
  return [s.vs, fs / p.sprungMass, s.vu, (ft - staticTyreLoad(p) - fs) / p.unsprungMass]
}

/**
 * One fixed RK4 step of length h starting at time t. `roadAt(t)` gives the
 * road height under the tyre at time t.
 */
export function rk4Step(p: QuarterCarParams, s: QuarterCarState, t: number, h: number, roadAt: (t: number) => number): QuarterCarState {
  const add = (k: Derivative, f: number): QuarterCarState => ({ zs: s.zs + k[0] * f, vs: s.vs + k[1] * f, zu: s.zu + k[2] * f, vu: s.vu + k[3] * f })
  const rMid = roadAt(t + h / 2)
  const k1 = derivative(p, s, roadAt(t))
  const k2 = derivative(p, add(k1, h / 2), rMid)
  const k3 = derivative(p, add(k2, h / 2), rMid)
  const k4 = derivative(p, add(k3, h), roadAt(t + h))
  return {
    zs: s.zs + (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]),
    vs: s.vs + (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]),
    zu: s.zu + (h / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]),
    vu: s.vu + (h / 6) * (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3]),
  }
}

/**
 * Mechanical energy relative to static equilibrium (J): kinetic energy of
 * both masses plus the strain energy of spring and tyre deviations. Exact for
 * the linear regime (tyre in contact, end stops not touched), where gravity
 * cancels against the static preloads.
 */
export function mechanicalEnergy(p: QuarterCarParams, s: QuarterCarState, roadZ = 0): number {
  const travel = s.zu - s.zs
  return (
    0.5 * p.sprungMass * s.vs * s.vs +
    0.5 * p.unsprungMass * s.vu * s.vu +
    0.5 * p.springRate * travel * travel +
    0.5 * p.tyreRate * (roadZ - s.zu) * (roadZ - s.zu)
  )
}

/* ------------------------------------------------------------------ */
/* Sampled response                                                     */
/* ------------------------------------------------------------------ */

/** Integration step (s). Wheel hop is ~12 Hz, so this is > 150 steps per hop period. */
export const STEP_SECONDS = 1 / 2000
/** Store every n-th integration step (400 samples per simulated second). */
export const SAMPLE_EVERY = 5
export const SAMPLE_SECONDS = STEP_SECONDS * SAMPLE_EVERY

export type ResponsePhase = 'approach' | 'compression' | 'rebound' | 'ripples' | 'settle'
const PHASES: readonly ResponsePhase[] = ['approach', 'compression', 'rebound', 'ripples', 'settle']

export interface QuarterCarResponse {
  params: QuarterCarParams
  road: RoadProfile
  /** Simulated duration of one lap (s). */
  duration: number
  /** Number of samples (first at t = 0, last at t = duration). */
  count: number
  time: Float64Array
  /** Road height under the tyre (m). */
  roadZ: Float64Array
  /** Body (sprung mass) displacement from static ride height (m). */
  body: Float64Array
  /** Wheel (unsprung mass) displacement from static (m). */
  wheel: Float64Array
  /** Suspension travel z_u − z_s (m), + = compression. */
  travel: Float64Array
  /** Rate of change of travel (m/s), + = compressing. */
  travelVelocity: Float64Array
  /** Body vertical acceleration (m/s²) — what the occupants feel. */
  bodyAccel: Float64Array
  /** Total tyre load (N). */
  tyreForce: Float64Array
  /** 1 while the tyre touches the road, 0 while it is airborne. */
  contact: Uint8Array
  /** Index into PHASES for each sample. */
  phase: Uint8Array
  /** Number of laps simulated before the response repeated (1 = a single lap from rest). */
  laps: number
  stats: ResponseStats
}

export interface ResponseStats {
  maxBody: number
  minBody: number
  maxWheel: number
  minWheel: number
  maxTravel: number
  minTravel: number
  maxTyreForce: number
  minTyreForce: number
  /** Peak |body acceleration| (m/s²). */
  peakBodyAccel: number
  /** Total time the tyre spent off the road during the lap (s). */
  airborneSeconds: number
  contactLost: boolean
  /** Whether the bump or rebound stop was reached. */
  stopHit: boolean
}

export interface SimulateOptions {
  /** Find the periodic (looping) response — default true. False = one lap starting from `initial`. */
  periodic?: boolean
  initial?: QuarterCarState
  /** Lap duration (s). */
  duration?: number
  speed?: number
  /** Upper bound on laps when searching for the periodic response. */
  maxLaps?: number
}

const PERIODIC_TOLERANCE = 1e-6

function stateDistance(a: QuarterCarState, b: QuarterCarState) {
  return Math.max(Math.abs(a.zs - b.zs), Math.abs(a.zu - b.zu), Math.abs(a.vs - b.vs) * 0.05, Math.abs(a.vu - b.vu) * 0.05)
}

/** Integrate one lap from `initial`; returns only the end state (cheap pass used while seeking the periodic orbit). */
function integrateLap(p: QuarterCarParams, initial: QuarterCarState, steps: number, roadAt: (t: number) => number): QuarterCarState {
  let s = initial
  for (let i = 0; i < steps; i++) s = rk4Step(p, s, i * STEP_SECONDS, STEP_SECONDS, roadAt)
  return s
}

/**
 * Simulate the quarter car over one lap of `road` and return a sampled
 * response. Pure: identical inputs give bit-identical arrays.
 */
export function simulateQuarterCar(params: QuarterCarParams, road: RoadProfile, options: SimulateOptions = {}): QuarterCarResponse {
  const { periodic = true, initial = REST, duration = LAP_SECONDS, speed = ROAD_SPEED, maxLaps = 16 } = options
  const steps = Math.round(duration / STEP_SECONDS)
  const lap = speed * duration
  const roadAt = (t: number) => road.height((((speed * t) % lap) + lap) % lap)

  let start: QuarterCarState = { ...initial }
  let laps = 1
  if (periodic) {
    for (; laps < maxLaps; laps++) {
      const end = integrateLap(params, start, steps, roadAt)
      const settled = stateDistance(end, start) < PERIODIC_TOLERANCE
      start = end
      if (settled) break
    }
  }

  const count = Math.floor(steps / SAMPLE_EVERY) + 1
  const time = new Float64Array(count)
  const roadZ = new Float64Array(count)
  const body = new Float64Array(count)
  const wheel = new Float64Array(count)
  const travel = new Float64Array(count)
  const travelVelocity = new Float64Array(count)
  const bodyAccel = new Float64Array(count)
  const force = new Float64Array(count)
  const contact = new Uint8Array(count)

  let s = start
  const record = (i: number, t: number) => {
    const r = roadAt(t)
    const tr = s.zu - s.zs
    const tv = s.vu - s.vs
    time[i] = t
    roadZ[i] = r
    body[i] = s.zs
    wheel[i] = s.zu
    travel[i] = tr
    travelVelocity[i] = tv
    bodyAccel[i] = suspensionForce(params, tr, tv) / params.sprungMass
    force[i] = tyreForce(params, r, s.zu)
    contact[i] = force[i] > 0 ? 1 : 0
  }
  record(0, 0)
  for (let i = 0; i < steps; i++) {
    s = rk4Step(params, s, i * STEP_SECONDS, STEP_SECONDS, roadAt)
    if ((i + 1) % SAMPLE_EVERY === 0) record((i + 1) / SAMPLE_EVERY, (i + 1) * STEP_SECONDS)
  }

  const response: Omit<QuarterCarResponse, 'phase' | 'stats'> = {
    params,
    road,
    duration,
    count,
    time,
    roadZ,
    body,
    wheel,
    travel,
    travelVelocity,
    bodyAccel,
    tyreForce: force,
    contact,
    laps,
  }
  return { ...response, phase: classifyPhases(response, speed), stats: computeStats(response) }
}

function computeStats(r: Omit<QuarterCarResponse, 'phase' | 'stats'>): ResponseStats {
  let airborne = 0
  let peakAccel = 0
  let stopHit = false
  for (let i = 0; i < r.count; i++) {
    if (!r.contact[i] && i > 0) airborne += r.time[i] - r.time[i - 1]
    peakAccel = Math.max(peakAccel, Math.abs(r.bodyAccel[i]))
    if (endStopForce(r.params, r.travel[i]) !== 0) stopHit = true
  }
  const max = (a: Float64Array) => a.reduce((m, v) => (v > m ? v : m), -Infinity)
  const min = (a: Float64Array) => a.reduce((m, v) => (v < m ? v : m), Infinity)
  return {
    maxBody: max(r.body),
    minBody: min(r.body),
    maxWheel: max(r.wheel),
    minWheel: min(r.wheel),
    maxTravel: max(r.travel),
    minTravel: min(r.travel),
    maxTyreForce: max(r.tyreForce),
    minTyreForce: min(r.tyreForce),
    peakBodyAccel: peakAccel,
    airborneSeconds: airborne,
    contactLost: r.contact.includes(0),
    stopHit,
  }
}

/* ------------------------------------------------------------------ */
/* Phases (lab cues)                                                    */
/* ------------------------------------------------------------------ */

/** Travel speed (m/s) below which the phase label holds its previous value. */
const PHASE_DEADBAND = 0.02
/** Shortest stretch (s) a compression / rebound label is allowed to last, so wheel-hop jitter cannot flicker the label. */
const PHASE_MIN_DWELL = 0.06
/** After the feature, this long (s) with the suspension nearly still counts as settled. */
const PHASE_QUIET = 0.08
/** After the feature, the narration moves on to `settle` at the latest after this long (s). */
const PHASE_MAX_TAIL = 0.45

/**
 * Label every sample with a phase of the ride over the road feature:
 * - `approach` before the road under the tyre starts to change;
 * - then the direction the road moves first (up → `compression`, down →
 *   `rebound`), after which `compression` / `rebound` follow the sign of the
 *   travel velocity, with a dead band and a minimum dwell so wheel-hop
 *   jitter cannot make the label chatter;
 * - `ripples` while the tyre runs over the washboard (too fast to narrate
 *   stroke by stroke), straight into `settle` afterwards;
 * - `settle` once the first rebound after the feature has finished, the
 *   suspension has gone quiet, or PHASE_MAX_TAIL has passed.
 * Computed once per response, so the live cue is a pure lookup.
 */
function classifyPhases(r: Omit<QuarterCarResponse, 'phase' | 'stats'>, speed: number): Uint8Array {
  const out = new Uint8Array(r.count)
  const featureStart = r.road.start / speed
  const featureEnd = r.road.end / speed
  const flat = r.road.end <= r.road.start
  const dt = r.time[1] - r.time[0]
  const minDwell = Math.round(PHASE_MIN_DWELL / dt)
  const quietLimit = Math.round(PHASE_QUIET / dt)
  let current: ResponsePhase = 'approach'
  let since = 0
  let quiet = 0
  let reboundAfterFeature = false
  for (let i = 0; i < r.count; i++) {
    const t = r.time[i]
    const v = r.travelVelocity[i]
    let next: ResponsePhase = current
    if (flat || t < featureStart) next = 'approach'
    else if (current === 'settle') next = 'settle'
    else if (r.road.id === 'washboard') next = t < featureEnd ? 'ripples' : 'settle'
    else if (current === 'approach') {
      const slope = (r.roadZ[Math.min(i + 1, r.count - 1)] - r.roadZ[i]) / dt
      if (Math.abs(slope) > 1e-4) next = slope > 0 ? 'compression' : 'rebound'
    } else {
      const moving = Math.abs(v) > PHASE_DEADBAND
      if (moving) next = v > 0 ? 'compression' : 'rebound'
      if (next !== current && i - since < minDwell) next = current
      if (t >= featureEnd) {
        quiet = moving ? 0 : quiet + 1
        if (current === 'rebound') reboundAfterFeature = true
        if ((reboundAfterFeature && next === 'compression') || quiet >= quietLimit || t >= featureEnd + PHASE_MAX_TAIL) next = 'settle'
      }
    }
    if (next !== current) {
      current = next
      since = i
    }
    out[i] = PHASES.indexOf(current)
  }
  return out
}

/* ------------------------------------------------------------------ */
/* Sampling at a progress value                                         */
/* ------------------------------------------------------------------ */

export interface QuarterCarPose {
  /** Simulated time within the lap (s). */
  time: number
  /** Distance travelled along the lap (m). */
  distance: number
  roadZ: number
  body: number
  wheel: number
  travel: number
  travelVelocity: number
  bodyAccel: number
  tyreForce: number
  /** Tyre load relative to static (1 = static weight). */
  loadFactor: number
  contact: boolean
  phase: ResponsePhase
}

/**
 * The pose at a normalised lap position (0 ≤ progress ≤ 1): continuous values
 * are linearly interpolated between samples; discrete ones (contact, phase)
 * come from the sample at or before the position. Deterministic for scrub and
 * step.
 */
export function poseAt(r: QuarterCarResponse, progress: number): QuarterCarPose {
  const p = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0))
  const f = p * (r.count - 1)
  const i = Math.min(r.count - 2, Math.floor(f + 1e-9))
  const u = Math.min(1, Math.max(0, f - i))
  const lerp = (a: Float64Array) => a[i] + (a[i + 1] - a[i]) * u
  const k = u > 1 - 1e-9 ? i + 1 : i
  const force = lerp(r.tyreForce)
  return {
    time: p * r.duration,
    distance: p * r.duration * ROAD_SPEED,
    roadZ: lerp(r.roadZ),
    body: lerp(r.body),
    wheel: lerp(r.wheel),
    travel: lerp(r.travel),
    travelVelocity: lerp(r.travelVelocity),
    bodyAccel: lerp(r.bodyAccel),
    tyreForce: force,
    loadFactor: force / staticTyreLoad(r.params),
    contact: r.contact[k] === 1,
    phase: PHASES[r.phase[k]] ?? 'approach',
  }
}

/* ------------------------------------------------------------------ */
/* Lab parameters → model (memoised)                                    */
/* ------------------------------------------------------------------ */

/** Spring-rate slider range (N/mm at the wheel). */
export const SPRING_RATE_RANGE = { min: 15, max: 60, step: 1, initial: 25 } as const

export interface SuspensionSettings {
  road: Exclude<RoadInputId, 'flat'>
  damping: DampingPreset
  /** Wheel rate, N/mm. */
  springRate: number
}

export const DEFAULT_SETTINGS: SuspensionSettings = { road: 'bump', damping: 'balanced', springRate: SPRING_RATE_RANGE.initial }

/** Normalise loosely typed lab params into valid settings (unknown values fall back to defaults). */
export function settingsFromParams(params: Record<string, unknown>): SuspensionSettings {
  const rate = Number(params.springRate)
  return {
    road: isRoadInput(params.road) ? params.road : DEFAULT_SETTINGS.road,
    damping: isDampingPreset(params.damping) ? params.damping : DEFAULT_SETTINGS.damping,
    springRate: Number.isFinite(rate)
      ? Math.min(SPRING_RATE_RANGE.max, Math.max(SPRING_RATE_RANGE.min, Math.round(rate)))
      : DEFAULT_SETTINGS.springRate,
  }
}

export function modelParams(settings: SuspensionSettings): QuarterCarParams {
  const springRate = settings.springRate * 1000
  return { ...BASE_PARAMS, springRate, damping: dampingFor(dampingRatioOf(settings.damping), springRate) }
}

const cache = new Map<string, QuarterCarResponse>()
const CACHE_LIMIT = 48

/**
 * The (memoised) periodic response for a set of lab settings. Re-running the
 * same settings returns the same object, so per-frame lookups are cheap.
 */
export function responseFor(settings: SuspensionSettings): QuarterCarResponse {
  const key = `${settings.road}|${settings.damping}|${settings.springRate}`
  const hit = cache.get(key)
  if (hit) {
    // Refresh recency.
    cache.delete(key)
    cache.set(key, hit)
    return hit
  }
  const r = simulateQuarterCar(modelParams(settings), ROAD_PROFILES[settings.road])
  cache.set(key, r)
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string)
  return r
}
