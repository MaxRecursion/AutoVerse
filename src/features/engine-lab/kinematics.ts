/**
 * Pure four-stroke engine kinematics — no three.js, no React.
 *
 * Every pose in the engine laboratory (3D scene, 2D section, timing diagram,
 * readouts and explanation text) is derived from the lab's single time
 * parameter `progress` ∈ [0, 1) through the functions below, so playing,
 * pausing, scrubbing and stepping always produce identical, synchronised
 * results and the maths can be unit-tested.
 *
 * Conventions
 * - Crank angle θ (degrees) = 720° × progress. θ = 0 is top dead centre (TDC)
 *   at the start of the intake stroke; θ = 360° is TDC at the end of
 *   compression ("firing TDC").
 * - Lengths are millimetres, measured from the crankshaft axis along the
 *   cylinder axis (+y up). The crank pin sits at (y, z) = (r·cosθ, r·sinθ).
 * - All dimensions, timings and the pressure model are ILLUSTRATIVE teaching
 *   values chosen to be typical of a small petrol engine. They are not data
 *   for any particular engine and the pressure curve is modelled, not measured.
 */

export type StrokeId = 'intake' | 'compression' | 'power' | 'exhaust'
export type PistonMotion = 'up' | 'down' | 'tdc' | 'bdc'
export type ValveId = 'intake' | 'exhaust'

export const STROKES: readonly { id: StrokeId; label: string; start: number; end: number }[] = [
  { id: 'intake', label: 'Intake', start: 0, end: 180 },
  { id: 'compression', label: 'Compression', start: 180, end: 360 },
  { id: 'power', label: 'Power', start: 360, end: 540 },
  { id: 'exhaust', label: 'Exhaust', start: 540, end: 720 },
] as const

/** Illustrative single-cylinder geometry (mm). Bore × stroke 84 × 90 mm ≈ 499 cm³. */
export const ENGINE_GEOMETRY = {
  boreMm: 84,
  strokeMm: 90,
  /** Centre-to-centre connecting-rod length. Rod ratio l/r ≈ 3.2. */
  rodLengthMm: 145,
  /** Wrist-pin axis to piston crown. */
  compressionHeightMm: 30,
  /** Gap between the crown at TDC and the cylinder-head face. */
  deckClearanceMm: 1,
  compressionRatio: 10.5,
} as const

export const CRANK_RADIUS_MM = ENGINE_GEOMETRY.strokeMm / 2
/** Crank axis → top of the block (head face). */
export const DECK_HEIGHT_MM =
  CRANK_RADIUS_MM + ENGINE_GEOMETRY.rodLengthMm + ENGINE_GEOMETRY.compressionHeightMm + ENGINE_GEOMETRY.deckClearanceMm

export interface ValveEvent {
  /** Crank angle the valve starts to lift (degrees, 0–720). */
  opens: number
  /** Crank angle the valve is back on its seat (degrees, 0–720). */
  closes: number
  maxLiftMm: number
}

/**
 * Illustrative valve timing (crank degrees):
 * IVO 10° BTDC, IVC 40° ABDC, EVO 40° BBDC, EVC 10° ATDC — giving 20° of
 * overlap around the exhaust/intake TDC at 0°/720°.
 */
export const VALVE_TIMING: Record<ValveId, ValveEvent> = {
  intake: { opens: 710, closes: 220, maxLiftMm: 9 },
  exhaust: { opens: 500, closes: 10, maxLiftMm: 8.5 },
}

/** Spark fires 15° before firing TDC. */
export const SPARK_ANGLE = 345
/** Length of the visual spark flash (crank degrees). */
export const SPARK_FLASH_DEG = 12
/** Reference idle speed used for the "slowed down" readout. */
export const IDLE_RPM = 800

const DEG = Math.PI / 180

/** Positive modulo. */
export const mod = (v: number, m: number) => ((v % m) + m) % m

/** Removes floating-point noise (e.g. 179.99999999 → 180) so boundaries are exact. */
const snap = (deg: number) => Math.round(deg * 1e6) / 1e6

/** Crank angle in degrees ∈ [0, 720) for a normalised cycle position. */
export function crankAngleFromProgress(progress: number): number {
  return mod(snap(progress * 720), 720)
}

export const progressFromCrankAngle = (deg: number) => mod(deg, 720) / 720

/** Camshafts are driven at half crank speed: 720° of crank = 360° of cam. */
export const camAngle = (crankDeg: number) => mod(crankDeg, 720) / 2

export function strokeAt(crankDeg: number): StrokeId {
  const t = mod(snap(crankDeg), 720)
  return STROKES[Math.min(3, Math.floor(t / 180))].id
}

export const strokeLabel = (id: StrokeId) => STROKES.find((s) => s.id === id)?.label ?? id

/** 0-based stroke number (intake 0 … exhaust 3). */
export const strokeIndex = (id: StrokeId) => STROKES.findIndex((s) => s.id === id)

/** How far through its current stroke the piston is, 0 … 1. */
export function strokeFraction(crankDeg: number): number {
  const t = mod(snap(crankDeg), 720)
  return (t - Math.floor(t / 180) * 180) / 180
}

/* ------------------------------------------------------------------ */
/* Slider-crank                                                         */
/* ------------------------------------------------------------------ */

const r = CRANK_RADIUS_MM
const l = ENGINE_GEOMETRY.rodLengthMm

/**
 * Distance from the crank axis to the wrist-pin centre:
 * x(θ) = r·cosθ + √(l² − r²·sin²θ).
 * Maximum r + l at TDC (θ = 0°, 360°), minimum l − r at BDC (180°, 540°).
 */
export function pistonPinHeight(crankDeg: number): number {
  const t = crankDeg * DEG
  const s = Math.sin(t)
  return r * Math.cos(t) + Math.sqrt(l * l - r * r * s * s)
}

/** Piston crown height above the crank axis. */
export const pistonCrownHeight = (crankDeg: number) => pistonPinHeight(crankDeg) + ENGINE_GEOMETRY.compressionHeightMm

/** Piston travel below TDC, 0 at TDC … 1 at BDC. */
export const pistonTravel = (crankDeg: number) => (r + l - pistonPinHeight(crankDeg)) / (2 * r)

/** Crank-pin centre in the cylinder plane: y along the bore axis, z sideways. */
export function crankPinPosition(crankDeg: number): { y: number; z: number } {
  const t = crankDeg * DEG
  return { y: r * Math.cos(t), z: r * Math.sin(t) }
}

/**
 * Connecting-rod angle from the cylinder axis (radians). Positive when the big
 * end is displaced towards +z. sinφ = r·sinθ / l.
 */
export const rodAngle = (crankDeg: number) => Math.asin((r * Math.sin(crankDeg * DEG)) / l)

/** dx/dθ in mm per crank radian (negative = piston moving down). */
export function pistonVelocity(crankDeg: number): number {
  const t = crankDeg * DEG
  const s = Math.sin(t)
  return -r * s - (r * r * s * Math.cos(t)) / Math.sqrt(l * l - r * r * s * s)
}

/** Piston direction with a ±2° dwell band reported as TDC / BDC. */
export function pistonMotion(crankDeg: number): PistonMotion {
  const t = mod(snap(crankDeg), 360)
  if (t <= 2 || t >= 358) return 'tdc'
  if (Math.abs(t - 180) <= 2) return 'bdc'
  return pistonVelocity(crankDeg) < 0 ? 'down' : 'up'
}

/* ------------------------------------------------------------------ */
/* Volume and illustrative pressure                                     */
/* ------------------------------------------------------------------ */

const BORE_AREA_MM2 = (Math.PI / 4) * ENGINE_GEOMETRY.boreMm ** 2
/** Swept volume per cylinder (cm³). */
export const DISPLACEMENT_CC = (BORE_AREA_MM2 * ENGINE_GEOMETRY.strokeMm) / 1000
/** Clearance volume left at TDC (cm³) for the chosen compression ratio. */
export const CLEARANCE_CC = DISPLACEMENT_CC / (ENGINE_GEOMETRY.compressionRatio - 1)

/** Gas volume above the piston (cm³). */
export const cylinderVolume = (crankDeg: number) => CLEARANCE_CC + (BORE_AREA_MM2 * (r + l - pistonPinHeight(crankDeg))) / 1000

/** Volume normalised to the maximum (1 at BDC, 1/CR at TDC). */
export const normalisedVolume = (crankDeg: number) => cylinderVolume(crankDeg) / (CLEARANCE_CC + DISPLACEMENT_CC)

const smoothstep = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Conceptual burn duration after the spark (crank degrees). */
const BURN_DURATION = 60

/** Wiebe-style mass-fraction-burned curve: 0 before the spark, → 1 once combustion is complete. */
export function burnFraction(crankDeg: number): number {
  const t = mod(snap(crankDeg), 720)
  if (t < SPARK_ANGLE) return 0
  const u = (t - SPARK_ANGLE) / BURN_DURATION
  if (u >= 1.5) return 1
  return 1 - Math.exp(-5 * u ** 3)
}

function rawCombustionGlow(t: number): number {
  if (t < SPARK_ANGLE || t >= 540) return 0
  const xb = burnFraction(t)
  const afterglow = Math.exp(-Math.max(0, t - 380) / 60)
  return xb * afterglow * (1 - smoothstep(500, 540, t))
}

const GLOW_PEAK = (() => {
  let max = 0
  for (let t = SPARK_ANGLE; t < 540; t += 0.5) max = Math.max(max, rawCombustionGlow(t))
  return max || 1
})()

/**
 * CONCEPTUAL combustion intensity 0–1 used only to drive the amber glow:
 * rises after the spark, peaks shortly after firing TDC, fades through the
 * power stroke and is gone once the exhaust valve has released the gas.
 */
export const combustionIntensity = (crankDeg: number) => Math.min(1, rawCombustionGlow(mod(snap(crankDeg), 720)) / GLOW_PEAK)

/** Spark flash 0–1: full at the spark event, decaying over SPARK_FLASH_DEG. */
export function sparkIntensity(crankDeg: number): number {
  const d = mod(snap(crankDeg) - SPARK_ANGLE, 720)
  return d < SPARK_FLASH_DEG ? (1 - d / SPARK_FLASH_DEG) ** 2 : 0
}

const P_INTAKE = 0.95
const P_EXHAUST = 1.1
const POLYTROPIC_N = 1.32
/** Ratio of fired to motored pressure once combustion is complete (illustrative). */
const FIRING_PRESSURE_RATIO = 4.5
const EXHAUST_BLOWDOWN_DEG = 14

function compressionExpansionPressure(t: number): number {
  const vIvc = cylinderVolume(VALVE_TIMING.intake.closes)
  const motored = P_INTAKE * (vIvc / cylinderVolume(t)) ** POLYTROPIC_N
  return motored * (1 + (FIRING_PRESSURE_RATIO - 1) * burnFraction(t))
}

/**
 * ILLUSTRATIVE cylinder pressure (bar, absolute) — a simple polytropic +
 * Wiebe model for teaching the shape of the curve. Not measured data.
 */
export function illustrativePressure(crankDeg: number): number {
  const t = mod(snap(crankDeg), 720)
  const ivc = VALVE_TIMING.intake.closes
  const evo = VALVE_TIMING.exhaust.opens
  if (t < ivc) return 1 - (1 - P_INTAKE) * smoothstep(0, 40, t)
  if (t <= evo) return compressionExpansionPressure(t)
  const pEvo = compressionExpansionPressure(evo)
  const blowdown = (deg: number) => P_EXHAUST + (pEvo - P_EXHAUST) * Math.exp(-(deg - evo) / EXHAUST_BLOWDOWN_DEG)
  if (t < 700) return blowdown(t)
  return blowdown(700) + (1 - blowdown(700)) * smoothstep(700, 720, t)
}

/* ------------------------------------------------------------------ */
/* Valves                                                               */
/* ------------------------------------------------------------------ */

/** Duration a valve is off its seat (crank degrees). */
export const valveDuration = (ev: ValveEvent) => mod(ev.closes - ev.opens, 720)

/** Crank angle of maximum lift (centre of the event). */
export const valvePeakAngle = (ev: ValveEvent) => mod(ev.opens + valveDuration(ev) / 2, 720)

/**
 * Valve lift (mm) — a smooth sin² profile: zero lift and zero velocity at
 * opening and closing, maximum at the centre of the event.
 */
export function valveLiftFor(ev: ValveEvent, crankDeg: number): number {
  const d = mod(snap(crankDeg) - ev.opens, 720)
  const dur = valveDuration(ev)
  if (d >= dur) return 0
  const s = Math.sin((Math.PI * d) / dur)
  return ev.maxLiftMm * s * s
}

export const valveLift = (valve: ValveId, crankDeg: number) => valveLiftFor(VALVE_TIMING[valve], crankDeg)

/** 0–1 fraction of maximum lift. */
export const valveOpenFraction = (valve: ValveId, crankDeg: number) => valveLift(valve, crankDeg) / VALVE_TIMING[valve].maxLiftMm

/**
 * Camshaft rotation of a valve's lobe relative to "nose pointing at the
 * follower" (cam degrees). Zero at the valve's peak lift; the camshaft turns
 * at half crank speed, so 720° of crank sweeps the lobe through one full turn.
 * Used to phase the 3D lobes so lobe contact always matches valveLift().
 */
export const camLobeAngle = (valve: ValveId, crankDeg: number) => (crankDeg - valvePeakAngle(VALVE_TIMING[valve])) / 2

/** True while both valves are off their seats (overlap around exhaust/intake TDC). */
export const inOverlap = (crankDeg: number) => valveLift('intake', crankDeg) > 0 && valveLift('exhaust', crankDeg) > 0

/* ------------------------------------------------------------------ */
/* Full state snapshot                                                  */
/* ------------------------------------------------------------------ */

export interface EngineState {
  progress: number
  crankDeg: number
  camDeg: number
  stroke: StrokeId
  /** Crank axis → wrist pin (mm). */
  pinHeight: number
  /** Crank axis → crown (mm). */
  crownHeight: number
  /** 0 at TDC … 1 at BDC. */
  travel: number
  motion: PistonMotion
  /** Connecting-rod angle (rad). */
  rodAngle: number
  crankPin: { y: number; z: number }
  intakeLift: number
  exhaustLift: number
  intakeOpen: number
  exhaustOpen: number
  overlap: boolean
  spark: number
  combustion: number
  burn: number
  /** 1 at BDC … 1/CR at TDC. */
  volume: number
  pressureBar: number
}

export function engineStateAt(progress: number): EngineState {
  const crankDeg = crankAngleFromProgress(progress)
  const pinHeight = pistonPinHeight(crankDeg)
  const intakeLift = valveLift('intake', crankDeg)
  const exhaustLift = valveLift('exhaust', crankDeg)
  return {
    progress,
    crankDeg,
    camDeg: camAngle(crankDeg),
    stroke: strokeAt(crankDeg),
    pinHeight,
    crownHeight: pinHeight + ENGINE_GEOMETRY.compressionHeightMm,
    travel: (r + l - pinHeight) / (2 * r),
    motion: pistonMotion(crankDeg),
    rodAngle: rodAngle(crankDeg),
    crankPin: crankPinPosition(crankDeg),
    intakeLift,
    exhaustLift,
    intakeOpen: intakeLift / VALVE_TIMING.intake.maxLiftMm,
    exhaustOpen: exhaustLift / VALVE_TIMING.exhaust.maxLiftMm,
    overlap: intakeLift > 0 && exhaustLift > 0,
    spark: sparkIntensity(crankDeg),
    combustion: combustionIntensity(crankDeg),
    burn: burnFraction(crankDeg),
    volume: normalisedVolume(crankDeg),
    pressureBar: illustrativePressure(crankDeg),
  }
}

/* ------------------------------------------------------------------ */
/* Playback speed context                                               */
/* ------------------------------------------------------------------ */

/** Equivalent crankshaft speed of the animation (rpm): 2 revolutions per cycle. */
export const animationRpm = (cycleSeconds: number, speed: number) => (2 * 60 * speed) / cycleSeconds

/** How many times slower than a typical idle the animation runs. */
export const slowdownVsIdle = (cycleSeconds: number, speed: number) => IDLE_RPM / animationRpm(cycleSeconds, speed)

/** Readable rounding for the slowdown note, e.g. 40, 160, 400. */
export function formatSlowdown(factor: number): string {
  if (factor >= 100) return String(Math.round(factor / 10) * 10)
  return String(Math.round(factor))
}
