import { describe, expect, it } from 'vitest'
import {
  CLEARANCE_CC,
  CRANK_RADIUS_MM,
  DISPLACEMENT_CC,
  ENGINE_GEOMETRY,
  SPARK_ANGLE,
  VALVE_TIMING,
  animationRpm,
  burnFraction,
  camAngle,
  camLobeAngle,
  combustionIntensity,
  crankAngleFromProgress,
  crankPinPosition,
  engineStateAt,
  formatSlowdown,
  illustrativePressure,
  inOverlap,
  normalisedVolume,
  pistonMotion,
  pistonPinHeight,
  pistonTravel,
  progressFromCrankAngle,
  rodAngle,
  slowdownVsIdle,
  sparkIntensity,
  strokeAt,
  strokeFraction,
  valveLift,
  valveOpenFraction,
  valvePeakAngle,
} from './kinematics'

const r = CRANK_RADIUS_MM
const l = ENGINE_GEOMETRY.rodLengthMm

describe('crank and cam angles', () => {
  it('maps progress to 720° of crank with TDC of intake at 0', () => {
    expect(crankAngleFromProgress(0)).toBe(0)
    expect(crankAngleFromProgress(0.25)).toBe(180)
    expect(crankAngleFromProgress(0.5)).toBe(360)
    expect(crankAngleFromProgress(0.75)).toBe(540)
    expect(crankAngleFromProgress(1)).toBe(0)
    expect(progressFromCrankAngle(360)).toBe(0.5)
    expect(progressFromCrankAngle(-90)).toBeCloseTo(630 / 720)
  })

  it('turns the camshaft at exactly half crank speed', () => {
    for (let deg = 0; deg < 720; deg += 7) expect(camAngle(deg)).toBeCloseTo(deg / 2, 10)
    expect(camAngle(720)).toBe(0)
  })

  it('phases each cam lobe so the nose faces the follower at peak lift', () => {
    for (const valve of ['intake', 'exhaust'] as const) {
      const peak = valvePeakAngle(VALVE_TIMING[valve])
      expect(camLobeAngle(valve, peak)).toBeCloseTo(0, 10)
      // 90° of crank later the lobe has turned 45° of cam.
      expect(camLobeAngle(valve, peak + 90)).toBeCloseTo(45, 10)
    }
  })
})

describe('slider-crank', () => {
  it('puts the piston at the top at TDC and at the bottom at BDC', () => {
    expect(pistonPinHeight(0)).toBeCloseTo(r + l, 9)
    expect(pistonPinHeight(360)).toBeCloseTo(r + l, 9)
    expect(pistonPinHeight(180)).toBeCloseTo(l - r, 9)
    expect(pistonPinHeight(540)).toBeCloseTo(l - r, 9)
    expect(pistonTravel(0)).toBeCloseTo(0, 9)
    expect(pistonTravel(180)).toBeCloseTo(1, 9)
  })

  it('follows x = r·cosθ + √(l² − r²·sin²θ) and keeps the rod length constant', () => {
    for (let deg = 0; deg < 720; deg += 13) {
      const t = (deg * Math.PI) / 180
      const x = pistonPinHeight(deg)
      expect(x).toBeCloseTo(r * Math.cos(t) + Math.sqrt(l * l - r * r * Math.sin(t) ** 2), 9)
      const pin = crankPinPosition(deg)
      expect(Math.hypot(x - pin.y, pin.z)).toBeCloseTo(l, 9)
      // Rod angle agrees with the geometry: sinφ = z_pin / l.
      expect(Math.sin(rodAngle(deg))).toBeCloseTo(pin.z / l, 9)
    }
  })

  it('stays within the stroke and is past half travel at 90° (rod angularity)', () => {
    for (let deg = 0; deg < 720; deg += 1) {
      const x = pistonPinHeight(deg)
      expect(x).toBeLessThanOrEqual(r + l + 1e-9)
      expect(x).toBeGreaterThanOrEqual(l - r - 1e-9)
    }
    expect(pistonTravel(90)).toBeGreaterThan(0.5)
  })

  it('reports piston direction', () => {
    expect(pistonMotion(0)).toBe('tdc')
    expect(pistonMotion(360)).toBe('tdc')
    expect(pistonMotion(180)).toBe('bdc')
    expect(pistonMotion(90)).toBe('down')
    expect(pistonMotion(270)).toBe('up')
    expect(pistonMotion(450)).toBe('down')
    expect(pistonMotion(630)).toBe('up')
  })
})

describe('strokes', () => {
  it('maps crank angle to the four strokes', () => {
    expect(strokeAt(0)).toBe('intake')
    expect(strokeAt(179.9)).toBe('intake')
    expect(strokeAt(180)).toBe('compression')
    expect(strokeAt(359.9)).toBe('compression')
    expect(strokeAt(360)).toBe('power')
    expect(strokeAt(540)).toBe('exhaust')
    expect(strokeAt(719.9)).toBe('exhaust')
    expect(strokeAt(720)).toBe('intake')
    // Floating-point noise at a boundary still lands in the right stroke.
    expect(strokeAt(0.25 * 720)).toBe('compression')
    expect(strokeFraction(90)).toBeCloseTo(0.5)
    expect(strokeFraction(540)).toBe(0)
  })
})

describe('valves', () => {
  it('keeps both valves shut from intake closing to exhaust opening (compression, firing TDC, power)', () => {
    for (let deg = VALVE_TIMING.intake.closes; deg <= VALVE_TIMING.exhaust.opens; deg += 1) {
      expect(valveLift('intake', deg)).toBe(0)
      expect(valveLift('exhaust', deg)).toBe(0)
    }
    expect(valveLift('intake', 360)).toBe(0)
    expect(valveLift('exhaust', 360)).toBe(0)
  })

  it('uses the documented illustrative timing', () => {
    expect(VALVE_TIMING.intake.opens).toBe(720 - 10) // IVO 10° BTDC
    expect(VALVE_TIMING.intake.closes).toBe(180 + 40) // IVC 40° ABDC
    expect(VALVE_TIMING.exhaust.opens).toBe(540 - 40) // EVO 40° BBDC
    expect(VALVE_TIMING.exhaust.closes).toBe(10) // EVC 10° ATDC
  })

  it('opens the intake valve during intake and the exhaust valve during exhaust', () => {
    expect(valveOpenFraction('intake', 100)).toBeGreaterThan(0.9)
    expect(valveLift('exhaust', 100)).toBe(0)
    expect(valveOpenFraction('exhaust', 620)).toBeGreaterThan(0.9)
    expect(valveLift('intake', 620)).toBe(0)
  })

  it('reaches full lift at the centre of each event and is smooth at the seat', () => {
    for (const valve of ['intake', 'exhaust'] as const) {
      const ev = VALVE_TIMING[valve]
      expect(valveLift(valve, valvePeakAngle(ev))).toBeCloseTo(ev.maxLiftMm, 9)
      expect(valveLift(valve, ev.opens)).toBe(0)
      expect(valveLift(valve, ev.closes)).toBe(0)
      // sin² ramps: lift grows quadratically off the seat (zero seating velocity).
      expect(valveLift(valve, ev.opens + 1)).toBeLessThan(0.01 * ev.maxLiftMm)
    }
  })

  it('overlaps both valves only around exhaust/intake TDC', () => {
    expect(inOverlap(0)).toBe(true)
    expect(inOverlap(715)).toBe(true)
    expect(inOverlap(5)).toBe(true)
    expect(inOverlap(12)).toBe(false)
    expect(inOverlap(705)).toBe(false)
    expect(inOverlap(360)).toBe(false)
    const overlapDegrees = Array.from({ length: 7200 }, (_, i) => i / 10).filter(inOverlap).length / 10
    expect(overlapDegrees).toBeCloseTo(20, 0)
  })
})

describe('spark, combustion, volume and pressure', () => {
  it('fires the spark 15° before firing TDC, briefly', () => {
    expect(SPARK_ANGLE).toBe(345)
    expect(sparkIntensity(345)).toBe(1)
    expect(sparkIntensity(340)).toBe(0)
    expect(sparkIntensity(380)).toBe(0)
    expect(sparkIntensity(0)).toBe(0)
  })

  it('only burns after the spark, glowing in the power stroke and gone by exhaust', () => {
    expect(burnFraction(300)).toBe(0)
    expect(burnFraction(440)).toBeGreaterThan(0.99)
    expect(combustionIntensity(200)).toBe(0)
    expect(combustionIntensity(344)).toBe(0)
    expect(combustionIntensity(380)).toBeGreaterThan(0.5)
    expect(combustionIntensity(560)).toBe(0)
    const peakAt = Array.from({ length: 720 }, (_, d) => d).reduce((best, d) => (combustionIntensity(d) > combustionIntensity(best) ? d : best), 0)
    expect(peakAt).toBeGreaterThan(360)
    expect(peakAt).toBeLessThan(420)
  })

  it('normalises volume to 1 at BDC and 1/CR at TDC', () => {
    expect(normalisedVolume(180)).toBeCloseTo(1, 9)
    expect(normalisedVolume(360)).toBeCloseTo(1 / ENGINE_GEOMETRY.compressionRatio, 9)
    expect((DISPLACEMENT_CC + CLEARANCE_CC) / CLEARANCE_CC).toBeCloseTo(ENGINE_GEOMETRY.compressionRatio, 9)
  })

  it('produces an illustrative pressure trace that peaks just after firing TDC', () => {
    const peakAt = Array.from({ length: 720 }, (_, d) => d).reduce((best, d) => (illustrativePressure(d) > illustrativePressure(best) ? d : best), 0)
    expect(peakAt).toBeGreaterThan(360)
    expect(peakAt).toBeLessThan(400)
    expect(illustrativePressure(100)).toBeLessThan(1.05)
    // Continuous across the cycle wrap.
    expect(Math.abs(illustrativePressure(719.99) - illustrativePressure(0))).toBeLessThan(0.01)
  })
})

describe('engineStateAt', () => {
  it('is a pure function of progress', () => {
    const a = engineStateAt(0.3721)
    const b = engineStateAt(0.3721)
    expect(a).toEqual(b)
    expect(a.camDeg).toBeCloseTo(a.crankDeg / 2, 10)
  })
})

describe('playback speed context', () => {
  it('reports how much slower than idle the animation runs', () => {
    expect(animationRpm(6, 1)).toBe(20)
    expect(slowdownVsIdle(6, 1)).toBe(40)
    expect(slowdownVsIdle(6, 0.1)).toBeCloseTo(400)
    expect(formatSlowdown(400)).toBe('400')
    expect(formatSlowdown(17.4)).toBe('17')
  })
})
