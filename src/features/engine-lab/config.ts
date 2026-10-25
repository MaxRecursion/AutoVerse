import { defineLabConfig, type LabCue } from '@/lib/simulation/labStore'
import { SPARK_ANGLE, crankAngleFromProgress, progressFromCrankAngle, strokeAt, strokeLabel } from './kinematics'

/**
 * Engine laboratory timeline (pure — no three.js, eagerly imported by the
 * lab registry). One cycle = 720° of crank = two crankshaft revolutions.
 */

/** Seconds per four-stroke cycle at 1× — roughly 20 rpm, so every event is readable. */
export const ENGINE_CYCLE_SECONDS = 6
/** One manual step = 5° of crank. */
export const ENGINE_STEP_DEG = 5

const at = (deg: number) => progressFromCrankAngle(deg)

/**
 * Stroke cues sit where each stroke is easiest to read (valve near full lift,
 * glow at its brightest), not at the stroke boundaries. Event cues (TDC, BDC,
 * spark, overlap) are seek targets for the deeper lessons; the live cue is
 * always the current stroke (see deriveEngineCue). Every position lies on the
 * 5° step grid so stepping from a cue lands on identical poses.
 */
export const ENGINE_CUES: LabCue[] = [
  { id: 'overlap', label: 'Valve overlap', progress: at(0) },
  { id: 'intake', label: 'Intake', progress: at(100) },
  { id: 'bdc', label: 'Bottom dead centre', progress: at(180) },
  { id: 'compression', label: 'Compression', progress: at(270) },
  { id: 'spark', label: 'Spark', progress: at(SPARK_ANGLE) },
  { id: 'tdc', label: 'Top dead centre (firing)', progress: at(360) },
  { id: 'power', label: 'Power', progress: at(400) },
  { id: 'exhaust', label: 'Exhaust', progress: at(620) },
]

/** The active cue is the stroke the piston is in: intake → compression → power → exhaust. */
export const deriveEngineCue = (progress: number) => strokeAt(crankAngleFromProgress(progress))

/** Timeline readout, e.g. "127° · Intake". */
export function formatEngineProgress(progress: number): string {
  const deg = crankAngleFromProgress(progress)
  // Floor (not round) so the number never disagrees with the stroke name at a boundary.
  return `${Math.floor(deg + 1e-6)}° · ${strokeLabel(strokeAt(deg))}`
}

export const engineLabConfig = defineLabConfig({
  id: 'engine',
  cycleDuration: ENGINE_CYCLE_SECONDS,
  stepSize: ENGINE_STEP_DEG / 720,
  speeds: [0.1, 0.25, 0.5, 1, 2],
  loop: true,
  timeline: true,
  cues: ENGINE_CUES,
  initialParams: {},
  deriveCue: (progress) => deriveEngineCue(progress),
  formatProgress: formatEngineProgress,
})
