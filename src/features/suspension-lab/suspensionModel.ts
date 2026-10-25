/**
 * One place that turns lab state (progress + params) into everything the 3D
 * scene, the 2D diagram and the readouts draw: the quarter-car pose, the
 * solved linkage, how far the car has rolled and the wheel's spin angle.
 * Pure — no three.js, no React.
 */
import type { LabParamValue } from '@/lib/simulation/labStore'
import { HARDPOINTS, TYRE, solveLinkage, type LinkagePose } from './linkage'
import {
  BASE_PARAMS,
  LAP_LENGTH,
  ROAD_PROFILES,
  poseAt,
  responseFor,
  settingsFromParams,
  staticTyreDeflection,
  type QuarterCarPose,
  type QuarterCarResponse,
  type RoadProfile,
  type SuspensionSettings,
} from './quarterCar'

/** Static tyre squash under the corner's weight (m). */
export const STATIC_TYRE_DEFLECTION = staticTyreDeflection(BASE_PARAMS)
/** Height of the wheel centre above a flat road at rest (m). */
export const LOADED_RADIUS = TYRE.freeRadius - STATIC_TYRE_DEFLECTION
/** Spokes on the road wheel. */
export const WHEEL_SPOKES = 5
/**
 * Rolling radius for the spin animation: close to a real tyre's effective
 * rolling radius (free radius minus about a third of the squash), rounded so
 * one lap turns the wheel a whole number of spoke pitches — the loop is
 * seamless.
 */
export const ROLL_RADIUS = (() => {
  const pitch = (2 * Math.PI) / WHEEL_SPOKES
  const ideal = TYRE.freeRadius - STATIC_TYRE_DEFLECTION / 3
  return LAP_LENGTH / (pitch * Math.round(LAP_LENGTH / ideal / pitch))
})()

export interface SuspensionFrame {
  progress: number
  settings: SuspensionSettings
  road: RoadProfile
  response: QuarterCarResponse
  pose: QuarterCarPose
  link: LinkagePose
  /** Distance rolled since the start of the lap (m). */
  distance: number
  /** Wheel spin about its axle (rad), + = rolling forward. */
  wheelSpin: number
  /** Wheel-centre height above the static ground (m), world frame. */
  wheelCentreY: number
}

export function suspensionFrameAt(progress: number, params: Record<string, LabParamValue>): SuspensionFrame {
  const settings = settingsFromParams(params)
  const response = responseFor(settings)
  const pose = poseAt(response, progress)
  const link = solveLinkage(pose.travel, LOADED_RADIUS)
  return {
    progress,
    settings,
    road: ROAD_PROFILES[settings.road],
    response,
    pose,
    link,
    distance: pose.distance,
    wheelSpin: pose.distance / ROLL_RADIUS,
    wheelCentreY: link.wheelCentre.y + pose.body,
  }
}

/**
 * A one-entry cache keyed on (progress, params object): several scene
 * components ask for the same frame every render tick, and the lab store
 * replaces `params` whenever a parameter changes.
 */
export function createFrameCache(): (progress: number, params: Record<string, LabParamValue>) => SuspensionFrame {
  let last: SuspensionFrame | null = null
  let lastParams: Record<string, LabParamValue> | null = null
  return (progress, params) => {
    if (last && lastParams === params && last.progress === progress) return last
    last = suspensionFrameAt(progress, params)
    lastParams = params
    return last
  }
}

/** Static layout numbers shared by the 3D scene and the 2D diagram. */
export const LAYOUT = {
  wheelCentreX: HARDPOINTS.wheelCentreX,
  loadedRadius: LOADED_RADIUS,
} as const

/* ------------------------------------------------------------------ */
/* Coil-over (spring + damper) layout along its own axis                */
/* ------------------------------------------------------------------ */

/** Length of the rubber bump stop hanging under the top mount (m). */
const BUMP_STOP_LENGTH = 0.07

/**
 * Coil-over dimensions measured along its axis from the lower eye (on the
 * lower wishbone) towards the top mount. The damper body is sized so its top
 * meets the bump stop exactly when the model's bump stop starts to push.
 */
export const COILOVER = {
  eyeRadius: 0.024,
  tubeRadius: 0.025,
  rodRadius: 0.009,
  /** Rod length from the top mount down into the damper body. */
  rodLength: 0.3,
  bumpStopLength: BUMP_STOP_LENGTH,
  bumpStopRadius: 0.021,
  tubeLength: coiloverLength(BASE_PARAMS.bumpStopAt) - BUMP_STOP_LENGTH,
  /** Lower spring seat position on the damper body. */
  lowerSeat: 0.16,
  /** Upper spring seat sits this far below the top mount. */
  upperSeatGap: 0.03,
  seatRadius: 0.06,
  coilRadius: 0.047,
  wireRadius: 0.0072,
  turns: 7,
  /** Closed turns at each end of the spring. */
  deadTurns: 0.75,
} as const

function coiloverLength(travel: number) {
  return solveLinkage(travel, LOADED_RADIUS).coiloverLength
}

export interface CoiloverState {
  /** Eye-to-top-mount length (m). */
  length: number
  /** Spring length between seats (m). */
  springLength: number
  /** Exposed damper rod between the body top and the top mount (m). */
  rodExposed: number
  /** Bump-stop length now (m) — shorter than free when the damper body squeezes it. */
  bumpStopLength: number
}

export function coiloverState(link: LinkagePose): CoiloverState {
  const length = link.coiloverLength
  return {
    length,
    springLength: length - COILOVER.lowerSeat - COILOVER.upperSeatGap,
    rodExposed: length - COILOVER.tubeLength,
    bumpStopLength: Math.max(0.2 * COILOVER.bumpStopLength, Math.min(COILOVER.bumpStopLength, length - COILOVER.tubeLength)),
  }
}
