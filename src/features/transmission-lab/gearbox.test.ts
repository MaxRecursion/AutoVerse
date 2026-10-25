import { describe, expect, it } from 'vitest'
import {
  CLUTCH,
  ENGINE_TORQUE_NM,
  FINAL_DRIVE_RATIO,
  GEARS,
  HEAD_PAIR,
  REVERSE_TRAIN,
  SPEED_PAIRS,
  TOOTH_SUM,
  WHEEL_RADIUS_M,
  clutchEngagement,
  clutchState,
  clutchTorqueFraction,
  driveState,
  gearEfficiency,
  gearRatio,
  gearTrain,
  isGearId,
  meshCount,
  outputSpeed,
  outputTorque,
  overallRatio,
  roadSpeedKmh,
  type GearId,
} from './gearbox'

const DRIVE_GEARS = GEARS.filter((g) => g !== 'N')

describe('gear ratios from tooth counts', () => {
  it('computes each ratio as driven ÷ driver teeth through the head pair and speed pair', () => {
    const head = HEAD_PAIR.driven / HEAD_PAIR.driver
    expect(head).toBeCloseTo(1.7, 12)
    expect(gearRatio('1')).toBeCloseTo(head * (37 / 17), 12)
    expect(gearRatio('2')).toBeCloseTo(head * (30 / 24), 12)
    expect(gearRatio('3')).toBeCloseTo(head * (25 / 29), 12)
    expect(gearRatio('5')).toBeCloseTo(head * (17 / 37), 12)
    // Rounded values a reader sees in the lab.
    expect(gearRatio('1')?.toFixed(2)).toBe('3.70')
    expect(gearRatio('2')?.toFixed(3)).toBe('2.125')
    expect(gearRatio('3')?.toFixed(2)).toBe('1.47')
    expect(gearRatio('5')?.toFixed(2)).toBe('0.78')
  })

  it('makes 4th direct drive (1 : 1, no tooth mesh) and 5th an overdrive', () => {
    expect(gearRatio('4')).toBe(1)
    expect(gearTrain('4')).toEqual([])
    expect(meshCount('4')).toBe(0)
    expect(gearRatio('5')!).toBeLessThan(1)
  })

  it('orders the forward ratios from tallest reduction to overdrive', () => {
    const forward = (['1', '2', '3', '4', '5'] as const).map((g) => gearRatio(g)!)
    for (let i = 1; i < forward.length; i++) expect(forward[i]).toBeLessThan(forward[i - 1])
  })

  it('gives every head and speed pair the same tooth sum, so they share one centre distance', () => {
    expect(TOOTH_SUM).toBe(54)
    for (const pair of Object.values(SPEED_PAIRS)) expect(pair.driver + pair.driven).toBe(TOOTH_SUM)
  })

  it('reverses the output through the idler, whose own tooth count cancels out', () => {
    const r = gearRatio('R')!
    expect(r).toBeLessThan(0)
    expect(meshCount('R')).toBe(3)
    expect(Math.abs(r)).toBeCloseTo((HEAD_PAIR.driven / HEAD_PAIR.driver) * (REVERSE_TRAIN.driven / REVERSE_TRAIN.driver), 12)
    expect(outputSpeed(2000, 'R')).toBeLessThan(0)
    expect(roadSpeedKmh(outputSpeed(2000, 'R'))).toBeLessThan(0)
  })

  it('includes the final drive in the overall ratio', () => {
    expect(overallRatio('4')).toBeCloseTo(FINAL_DRIVE_RATIO, 12)
    expect(overallRatio('2')).toBeCloseTo(gearRatio('2')! * FINAL_DRIVE_RATIO, 12)
    expect(overallRatio('N')).toBeNull()
  })

  it('recognises valid gear ids only', () => {
    expect(GEARS.every(isGearId)).toBe(true)
    expect(isGearId('6')).toBe(false)
    expect(isGearId(1)).toBe(false)
  })
})

describe('speed, torque and power', () => {
  it('divides speed and multiplies torque by the ratio (with illustrative losses)', () => {
    for (const g of DRIVE_GEARS) {
      const r = gearRatio(g)!
      expect(outputSpeed(3000, g)).toBeCloseTo(3000 / r, 9)
      expect(outputTorque(100, g)).toBeCloseTo(100 * r * gearEfficiency(g), 9)
    }
  })

  it('conserves power apart from the illustrative efficiency, in every gear including reverse', () => {
    for (const g of DRIVE_GEARS) {
      const d = driveState({ gear: g, pedal: 0, rpm: 3000 })
      expect(d.outputPowerKw).toBeGreaterThan(0)
      expect(d.outputPowerKw).toBeCloseTo(d.inputPowerKw * d.efficiency, 9)
      // Torque × speed is invariant through the ratio: (T·r·η)·(n/r) = η·T·n.
      expect(d.outputTorqueNm * d.outputRpm).toBeCloseTo(d.inputTorqueNm * d.inputRpm * d.efficiency, 6)
    }
  })

  it('loses a little more through each loaded mesh', () => {
    expect(gearEfficiency('4')).toBeGreaterThan(gearEfficiency('2'))
    expect(gearEfficiency('2')).toBeGreaterThan(gearEfficiency('R'))
    for (const g of DRIVE_GEARS) {
      expect(gearEfficiency(g)).toBeGreaterThan(0.9)
      expect(gearEfficiency(g)).toBeLessThan(1)
    }
  })

  it('delivers no output speed, torque or power in neutral', () => {
    const d = driveState({ gear: 'N', pedal: 0, rpm: 3000 })
    expect(d.ratio).toBeNull()
    expect(d.inputRpm).toBe(3000) // the input shaft still spins with the engine
    expect(d.outputRpm).toBe(0)
    expect(d.outputTorqueNm).toBe(0)
    expect(d.outputPowerKw).toBe(0)
    expect(d.torqueMultiplication).toBe(0)
    expect(d.roadSpeedKmh).toBe(0)
  })

  it('converts output speed to road speed through the final drive and tyre radius', () => {
    const wheelRpm = 1000 / FINAL_DRIVE_RATIO
    expect(roadSpeedKmh(1000)).toBeCloseTo(((wheelRpm * 2 * Math.PI) / 60) * WHEEL_RADIUS_M * 3.6, 9)
    // 2000 rpm in 4th (direct) is a plausible town-to-main-road speed with these illustrative numbers.
    const kmh = driveState({ gear: '4', pedal: 0, rpm: 2000 }).roadSpeedKmh
    expect(kmh).toBeGreaterThan(50)
    expect(kmh).toBeLessThan(65)
  })

  it('multiplies torque most in 1st and least in 5th', () => {
    const m = (g: GearId) => driveState({ gear: g, pedal: 0, rpm: 2000 }).torqueMultiplication
    expect(m('1')).toBeGreaterThan(3.5)
    expect(m('4')).toBeCloseTo(gearEfficiency('4'), 12)
    expect(m('5')).toBeLessThan(1)
    expect(driveState({ gear: '1', pedal: 0, rpm: 2000 }).outputTorqueNm).toBeCloseTo(ENGINE_TORQUE_NM * gearRatio('1')! * gearEfficiency('1'), 9)
  })
})

describe('clutch', () => {
  it('is fully clamped through the free play and fully released at the end of the take-up', () => {
    expect(clutchEngagement(0)).toBe(1)
    expect(clutchEngagement(CLUTCH.freePlay)).toBe(1)
    expect(clutchEngagement(CLUTCH.fullRelease)).toBe(0)
    expect(clutchEngagement(1)).toBe(0)
  })

  it('loses clamp load monotonically as the pedal goes down', () => {
    let prev = 2
    for (let p = 0; p <= 1.0001; p += 0.01) {
      const e = clutchEngagement(p)
      expect(e).toBeLessThanOrEqual(prev)
      prev = e
    }
  })

  it('locks before the pedal is fully up because of the capacity margin', () => {
    expect(clutchTorqueFraction(1)).toBe(1)
    expect(clutchTorqueFraction(1 / CLUTCH.capacityMargin)).toBeCloseTo(1, 12)
    expect(clutchState(0.25)).toBe('engaged')
    expect(clutchTorqueFraction(0.5)).toBeCloseTo(0.5 * CLUTCH.capacityMargin, 12)
  })

  it('classifies the cue pedal positions', () => {
    expect(clutchState(0)).toBe('engaged')
    expect(clutchState(CLUTCH.slipPedal)).toBe('slipping')
    expect(clutchState(CLUTCH.bitePedal)).toBe('biting')
    expect(clutchState(1)).toBe('disengaged')
  })

  it('passes on only part of the torque and speed while slipping, turning the difference into heat', () => {
    const locked = driveState({ gear: '1', pedal: 0, rpm: 2000 })
    const slipping = driveState({ gear: '1', pedal: CLUTCH.slipPedal, rpm: 2000 })
    expect(locked.clutchHeatKw).toBe(0)
    expect(slipping.torqueFraction).toBeGreaterThan(0)
    expect(slipping.torqueFraction).toBeLessThan(1)
    expect(slipping.inputRpm).toBeCloseTo(2000 * slipping.torqueFraction, 9)
    expect(slipping.inputTorqueNm).toBeCloseTo(ENGINE_TORQUE_NM * slipping.torqueFraction, 9)
    expect(slipping.clutchHeatKw).toBeGreaterThan(0)
    // Engine power = power into the gearbox + clutch heat.
    const enginePower = (slipping.inputTorqueNm * 2000 * 2 * Math.PI) / 60 / 1000
    expect(slipping.inputPowerKw + slipping.clutchHeatKw).toBeCloseTo(enginePower, 9)
  })

  it('transmits nothing with the pedal down, even in gear', () => {
    const d = driveState({ gear: '2', pedal: 1, rpm: 3000 })
    expect(d.clutch).toBe('disengaged')
    expect(d.inputRpm).toBe(0)
    expect(d.outputRpm).toBe(0)
    expect(d.outputTorqueNm).toBe(0)
  })
})
