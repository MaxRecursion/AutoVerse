/**
 * Manual gearbox mathematics — pure, no three.js. Shared by the 3D scene, the
 * 2D schematic, the readouts, the explanation panel and the tests.
 *
 * The gear set is an ILLUSTRATIVE in-line five-speed with a layshaft
 * (countershaft), not the data of any production gearbox:
 *
 *   input pinion ──(constant-mesh head pair)── layshaft cluster
 *   layshaft gear n ──(speed pair n)── free-running mainshaft gear n
 *   a synchro collar locks one mainshaft gear (or, for 4th, the input
 *   pinion itself) to the mainshaft → output.
 *
 * Every gear ratio is "driven teeth ÷ driver teeth". All head and speed pairs
 * have the same tooth sum, so equal-module gears share one centre distance
 * and the scene can draw every pair in true mesh.
 */

export const GEARS = ['N', '1', '2', '3', '4', '5', 'R'] as const
export type GearId = (typeof GEARS)[number]
/** A gear that drives the output (everything except neutral). */
export type DriveGearId = Exclude<GearId, 'N'>
/** Forward gears that run through the layshaft and a free mainshaft gear. */
export type IndirectGearId = '1' | '2' | '3' | '5'

export const isGearId = (v: unknown): v is GearId => typeof v === 'string' && (GEARS as readonly string[]).includes(v)

/** A driver gear turning a driven gear. */
export interface GearMesh {
  driver: number
  driven: number
}

/** Constant-mesh head pair: the input-shaft pinion drives the layshaft head gear. Always in mesh. */
export const HEAD_PAIR: GearMesh = { driver: 20, driven: 34 }

/** Layshaft gear (driver) → free-running mainshaft gear (driven) for each indirect forward gear. */
export const SPEED_PAIRS: Record<IndirectGearId, GearMesh> = {
  '1': { driver: 17, driven: 37 },
  '2': { driver: 24, driven: 30 },
  '3': { driver: 29, driven: 25 },
  '5': { driver: 37, driven: 17 },
}

/** Reverse: layshaft reverse gear → sliding idler → reverse gear fixed to the mainshaft (straight-cut). */
export const REVERSE_TRAIN = { driver: 16, idler: 18, driven: 33 } as const

/** Teeth per head / speed pair: equal module + equal sum = one shared layshaft–mainshaft centre distance. */
export const TOOTH_SUM = HEAD_PAIR.driver + HEAD_PAIR.driven

/** Illustrative final-drive (differential) reduction after the gearbox. */
export const FINAL_DRIVE_RATIO = 4.1
/** Illustrative rolling radius of the driven tyres, metres (roughly a 16-inch family-car wheel). */
export const WHEEL_RADIUS_M = 0.31
/** Illustrative engine torque fed into the clutch, N·m. */
export const ENGINE_TORQUE_NM = 150
/** Illustrative efficiency of one loaded tooth mesh. */
export const MESH_EFFICIENCY = 0.985
/** Illustrative bearing, seal and oil-churning efficiency applied to any engaged gear. */
export const BEARING_EFFICIENCY = 0.99

export const ENGINE_RPM = { min: 800, max: 6500, step: 50, initial: 2000 } as const

export type GearKind = 'neutral' | 'indirect' | 'direct' | 'reverse'

export const gearKind = (gear: GearId): GearKind =>
  gear === 'N' ? 'neutral' : gear === '4' ? 'direct' : gear === 'R' ? 'reverse' : 'indirect'

/** Ratio of one mesh: driven ÷ driver teeth (speed reduction when > 1). */
export const meshRatio = (m: GearMesh): number => m.driven / m.driver

/** The loaded tooth meshes, in power-flow order, for a gear (empty for neutral and direct drive). */
export function gearTrain(gear: GearId): GearMesh[] {
  switch (gearKind(gear)) {
    case 'neutral':
    case 'direct':
      return []
    case 'reverse':
      return [
        HEAD_PAIR,
        { driver: REVERSE_TRAIN.driver, driven: REVERSE_TRAIN.idler },
        { driver: REVERSE_TRAIN.idler, driven: REVERSE_TRAIN.driven },
      ]
    case 'indirect':
      return [HEAD_PAIR, SPEED_PAIRS[gear as IndirectGearId]]
  }
}

/**
 * Signed gearbox ratio (input speed ÷ output speed). Each external mesh
 * reverses the direction of rotation, so two meshes (head pair + speed pair)
 * give a positive ratio and three (with the reverse idler) a negative one.
 * The idler's own tooth count cancels out of the ratio. Neutral → null.
 */
export function gearRatio(gear: GearId): number | null {
  const kind = gearKind(gear)
  if (kind === 'neutral') return null
  if (kind === 'direct') return 1
  const train = gearTrain(gear)
  const magnitude = train.reduce((r, m) => r * meshRatio(m), 1)
  return train.length % 2 === 0 ? magnitude : -magnitude
}

/** Overall ratio from engine to wheels (gearbox × final drive); null in neutral. */
export function overallRatio(gear: GearId, finalDrive = FINAL_DRIVE_RATIO): number | null {
  const r = gearRatio(gear)
  return r === null ? null : r * finalDrive
}

/** Number of loaded tooth meshes (0 for direct drive and neutral). */
export const meshCount = (gear: GearId): number => gearTrain(gear).length

/** Illustrative mechanical efficiency of the engaged gear; 0 in neutral (nothing is transmitted). */
export function gearEfficiency(gear: GearId): number {
  if (gear === 'N') return 0
  return BEARING_EFFICIENCY * MESH_EFFICIENCY ** meshCount(gear)
}

/* ------------------------------------------------------------------ */
/* Clutch                                                               */
/* ------------------------------------------------------------------ */

/**
 * Illustrative clutch characteristic. Pedal travel 0 = foot off (clamped),
 * 1 = pedal on the floor. The first part of the travel is free play; the
 * clamp load then falls smoothly until the plate fully releases the disc.
 * At full clamp the clutch can carry more torque than the engine makes
 * (capacity margin), so it locks before the pedal is fully up.
 */
export const CLUTCH = {
  freePlay: 0.12,
  fullRelease: 0.7,
  capacityMargin: 1.3,
  /** Pedal position of the "bite point" cue (≈15 % of engine torque passed on). */
  bitePedal: 0.58,
  /** Pedal position of the "slipping" cue (well into the take-up). */
  slipPedal: 0.4,
} as const

export type ClutchState = 'engaged' | 'slipping' | 'biting' | 'disengaged'

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}

/** Clamp-load fraction 0..1 for a pedal position 0..1 (1 = fully clamped). */
export const clutchEngagement = (pedal: number): number => 1 - smoothstep(CLUTCH.freePlay, CLUTCH.fullRelease, clamp01(pedal))

/** Fraction of engine torque the clutch passes on (1 = locked, no slip). */
export const clutchTorqueFraction = (engagement: number): number => clamp01(clamp01(engagement) * CLUTCH.capacityMargin)

/** Torque fraction below which the clutch is described as "biting" rather than slipping. */
export const BITE_THRESHOLD = 0.3

export function clutchState(pedal: number): ClutchState {
  const f = clutchTorqueFraction(clutchEngagement(pedal))
  if (f >= 1) return 'engaged'
  if (f <= 0) return 'disengaged'
  return f < BITE_THRESHOLD ? 'biting' : 'slipping'
}

/* ------------------------------------------------------------------ */
/* Operating point                                                      */
/* ------------------------------------------------------------------ */

export interface DriveInputs {
  gear: GearId
  /** Clutch pedal travel 0..1. */
  pedal: number
  /** Engine (flywheel) speed, rpm. */
  rpm: number
  /** Engine torque, N·m (defaults to the illustrative ENGINE_TORQUE_NM). */
  engineTorqueNm?: number
}

export interface DriveOutputs {
  gear: GearId
  ratio: number | null
  overallRatio: number | null
  clutch: ClutchState
  /** Clamp-load fraction. */
  engagement: number
  /** Fraction of engine torque passed through the clutch. */
  torqueFraction: number
  engineRpm: number
  /** Clutch disc / gearbox input-shaft speed, rpm. */
  inputRpm: number
  /** Mainshaft (output) speed, rpm; negative = reversed; 0 in neutral. */
  outputRpm: number
  /** Torque entering the gearbox, N·m. */
  inputTorqueNm: number
  /** Torque leaving the gearbox, N·m (signed like the ratio). */
  outputTorqueNm: number
  /** |output torque ÷ input torque| = |ratio| × efficiency; 0 in neutral. */
  torqueMultiplication: number
  efficiency: number
  /** Power into the gearbox, kW. */
  inputPowerKw: number
  /** Power at the gearbox output, kW (always ≥ 0: torque and speed share a sign). */
  outputPowerKw: number
  /** Power turned into heat by clutch slip, kW. */
  clutchHeatKw: number
  /** Road speed this output speed corresponds to, km/h (negative = backwards). */
  roadSpeedKmh: number
}

const RPM_TO_RAD_S = (2 * Math.PI) / 60

/** Output speed for an input speed (output = input ÷ ratio); 0 in neutral. */
export const outputSpeed = (inputRpm: number, gear: GearId): number => {
  const r = gearRatio(gear)
  return r === null ? 0 : inputRpm / r
}

/** Output torque for an input torque (input × ratio × efficiency); 0 in neutral. */
export const outputTorque = (inputTorqueNm: number, gear: GearId): number => {
  const r = gearRatio(gear)
  return r === null ? 0 : inputTorqueNm * r * gearEfficiency(gear)
}

/** Road speed (km/h) for a gearbox output speed, through the final drive and tyre radius. */
export function roadSpeedKmh(outputRpm: number, finalDrive = FINAL_DRIVE_RATIO, wheelRadiusM = WHEEL_RADIUS_M): number {
  const wheelRadS = (outputRpm / finalDrive) * RPM_TO_RAD_S
  return wheelRadS * wheelRadiusM * 3.6
}

/**
 * Steady operating point for a gear, pedal position and engine speed.
 *
 * Illustrative clutch model: the torque passed on is the engine torque
 * limited by the clutch's clamp capacity, and while slipping the disc (and
 * so the gearbox input) is taken to turn at the same fraction of engine
 * speed. The power lost to slip appears as clutch heat.
 */
export function driveState({ gear, pedal, rpm, engineTorqueNm = ENGINE_TORQUE_NM }: DriveInputs): DriveOutputs {
  const engagement = clutchEngagement(pedal)
  const torqueFraction = clutchTorqueFraction(engagement)
  const ratio = gearRatio(gear)
  const efficiency = gearEfficiency(gear)
  const inputRpm = rpm * torqueFraction
  // In neutral nothing downstream resists the input shaft, so no torque is transmitted.
  const inputTorqueNm = ratio === null ? 0 : engineTorqueNm * torqueFraction
  const outputRpm = outputSpeed(inputRpm, gear)
  const outputTorqueNm = outputTorque(inputTorqueNm, gear)
  const inputPowerKw = (inputTorqueNm * inputRpm * RPM_TO_RAD_S) / 1000
  const outputPowerKw = (outputTorqueNm * outputRpm * RPM_TO_RAD_S) / 1000
  const clutchHeatKw = (inputTorqueNm * (rpm - inputRpm) * RPM_TO_RAD_S) / 1000
  return {
    gear,
    ratio,
    overallRatio: ratio === null ? null : ratio * FINAL_DRIVE_RATIO,
    clutch: clutchState(pedal),
    engagement,
    torqueFraction,
    engineRpm: rpm,
    inputRpm,
    outputRpm,
    inputTorqueNm,
    outputTorqueNm,
    torqueMultiplication: ratio === null ? 0 : Math.abs(ratio) * efficiency,
    efficiency,
    inputPowerKw,
    outputPowerKw,
    clutchHeatKw,
    roadSpeedKmh: roadSpeedKmh(outputRpm),
  }
}
