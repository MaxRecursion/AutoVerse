import { describe, expect, it } from 'vitest'
import { SPARK_ANGLE, VALVE_TIMING, engineStateAt, progressFromCrankAngle } from './kinematics'
import {
  SPARK_CALLOUT,
  STROKE_SUMMARY,
  describeEngineState,
  engineEventAt,
  formatCamDegrees,
  formatDegrees,
  gasStateLabel,
  pistonMotionLabel,
  strokeRange,
  valveStateLabel,
} from './engineText'

const stateAt = (deg: number) => engineStateAt(progressFromCrankAngle(deg))

describe('engine events', () => {
  it('flags valve overlap exactly while both valves are open', () => {
    for (const deg of [VALVE_TIMING.intake.opens + 1, 715, 0, 5, VALVE_TIMING.exhaust.closes - 1]) expect(engineEventAt(deg)).toBe('overlap')
    expect(engineEventAt(VALVE_TIMING.exhaust.closes + 1)).toBeNull()
    expect(engineEventAt(VALVE_TIMING.intake.opens - 1)).toBeNull()
  })

  it('shows the ignition callout from just before the spark until just after firing TDC', () => {
    expect(SPARK_CALLOUT.from).toBeLessThan(SPARK_ANGLE)
    expect(engineEventAt(SPARK_CALLOUT.from - 1)).toBeNull()
    expect(engineEventAt(SPARK_ANGLE)).toBe('spark')
    expect(engineEventAt(360)).toBe('spark')
    expect(engineEventAt(SPARK_CALLOUT.to)).toBeNull()
  })

  it('reports nothing in the middle of a stroke', () => {
    for (const deg of [90, 180, 270, 450, 540, 630]) expect(engineEventAt(deg)).toBeNull()
  })

  it('wraps crank angles outside 0–720°', () => {
    expect(engineEventAt(720 + 360)).toBe('spark')
    expect(engineEventAt(-5)).toBe('overlap')
  })
})

describe('readout labels', () => {
  it('formats angles without claiming the next degree early', () => {
    expect(formatDegrees(179.9999)).toBe('179°')
    expect(formatDegrees(180)).toBe('180°')
    expect(formatCamDegrees(63.5)).toBe('63.5°')
    expect(formatCamDegrees(63.74)).toBe('63.5°')
  })

  it('names stroke ranges, piston motion and valve states', () => {
    expect(strokeRange('compression')).toBe('180–360°')
    expect(pistonMotionLabel('tdc')).toBe('At top dead centre')
    expect(pistonMotionLabel('down')).toBe('Moving down')
    expect(valveStateLabel(0)).toBe('Closed')
    expect(valveStateLabel(0.001)).toBe('Cracking open')
    expect(valveStateLabel(0.62)).toBe('62% open')
  })

  it('describes the cylinder contents per stroke', () => {
    expect(gasStateLabel(stateAt(90))).toMatch(/fresh charge/i)
    expect(gasStateLabel(stateAt(300))).toMatch(/squeezed/i)
    expect(gasStateLabel(stateAt(400))).toMatch(/burning/i)
    expect(gasStateLabel(stateAt(520))).toMatch(/blow-down/i)
    expect(gasStateLabel(stateAt(620))).toMatch(/pushed out/i)
  })

  it('builds a text alternative of the current pose', () => {
    const text = describeEngineState(stateAt(100))
    expect(text).toMatch(/^Intake stroke, crank 100°/)
    expect(text).toMatch(/piston moving down/)
    expect(text).toMatch(/intake valve \d+% open/)
    expect(text).toMatch(/exhaust valve closed/)
    expect(describeEngineState(stateAt(SPARK_ANGLE))).toMatch(/spark plug firing/)
  })

  it('has a stroke summary for every stroke', () => {
    expect(Object.keys(STROKE_SUMMARY).sort()).toEqual(['compression', 'exhaust', 'intake', 'power'])
  })
})
