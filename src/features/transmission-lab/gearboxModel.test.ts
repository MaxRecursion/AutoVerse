import { describe, expect, it } from 'vitest'
import { CLUTCH, HEAD_PAIR, REVERSE_TRAIN, SPEED_PAIRS, gearRatio, type IndirectGearId } from './gearbox'
import {
  CENTRE_DISTANCE,
  CLUTCH_GEO,
  CLUTCH_X,
  COLLAR_TRAVEL,
  DOG_WIDTH,
  FACE_WIDTH,
  HUB_WIDTH,
  IDLER,
  IDLER_CENTRE,
  LAY_REVERSE,
  LAY_Y,
  MAIN_Y,
  MESH_DIRECTIONS,
  MODULE,
  STATION,
  clutchPose,
  lockedBase,
  meshPhase,
  pitchRadius,
  tipRadius,
  toothIndexAt,
  trainAngles,
  visualRadPerSecond,
} from './gearboxModel'

/** Distance of x from the nearest integer + ½ (0 = a gap is exactly centred). */
const offHalf = (x: number) => Math.abs(x - Math.floor(x) - 0.5)
const TWO_PI = 2 * Math.PI

describe('gear geometry', () => {
  it('sizes gears from tooth counts so every speed pair spans the centre distance', () => {
    expect(pitchRadius(HEAD_PAIR.driver) + pitchRadius(HEAD_PAIR.driven)).toBeCloseTo(CENTRE_DISTANCE, 12)
    for (const pair of Object.values(SPEED_PAIRS)) expect(pitchRadius(pair.driver) + pitchRadius(pair.driven)).toBeCloseTo(CENTRE_DISTANCE, 12)
    expect(MAIN_Y - LAY_Y).toBeCloseTo(CENTRE_DISTANCE, 12)
  })

  it('places the reverse idler in mesh with both reverse gears', () => {
    const dLay = Math.hypot(IDLER_CENTRE.y - LAY_Y, IDLER_CENTRE.z)
    const dMain = Math.hypot(IDLER_CENTRE.y - MAIN_Y, IDLER_CENTRE.z)
    expect(dLay).toBeCloseTo(pitchRadius(REVERSE_TRAIN.driver) + pitchRadius(REVERSE_TRAIN.idler), 12)
    expect(dMain).toBeCloseTo(pitchRadius(REVERSE_TRAIN.driven) + pitchRadius(REVERSE_TRAIN.idler), 12)
    expect(IDLER_CENTRE.z).toBeGreaterThan(0) // towards the camera
    // The two reverse gears themselves do not touch: the idler is needed.
    expect(tipRadius(REVERSE_TRAIN.driver) + tipRadius(REVERSE_TRAIN.driven)).toBeLessThan(CENTRE_DISTANCE)
  })

  it('keeps the idler on the wide layshaft gear at both ends of its slide, and clear of the mainshaft gear when out', () => {
    const half = IDLER.width / 2
    for (const x of [IDLER.engagedX, IDLER.disengagedX]) {
      expect(x - half).toBeGreaterThanOrEqual(LAY_REVERSE.x - LAY_REVERSE.width / 2)
      expect(x + half).toBeLessThanOrEqual(LAY_REVERSE.x + LAY_REVERSE.width / 2)
    }
    expect(IDLER.disengagedX - half).toBeGreaterThan(STATION.reverse + FACE_WIDTH / 2)
  })

  it('lets each collar slide over its gear’s dog ring without reaching the gear face', () => {
    const gap = 0.06
    for (const hub of [STATION.hub34, STATION.hub12, STATION.hub5]) {
      const reach = HUB_WIDTH / 2 + COLLAR_TRAVEL
      // The dog ring starts one blocker-ring gap beyond the hub face and is DOG_WIDTH wide.
      expect(reach).toBeGreaterThan(HUB_WIDTH / 2 + gap + DOG_WIDTH / 2)
      expect(reach).toBeLessThan(HUB_WIDTH / 2 + gap + DOG_WIDTH)
      expect(hub).toBeTypeOf('number')
    }
  })
})

describe('meshing phases (no drift)', () => {
  const samples = [0, 0.37, 1.9, -2.6, 13.7, 123.456, 1e4 + 0.1]

  it('keeps a tooth of one gear centred in a gap of its partner for any driver angle', () => {
    for (const [zA, zB, alpha] of [
      [20, 34, Math.PI],
      [17, 37, 0],
      [16, 18, 1.1],
      [18, 33, -0.66],
    ] as const) {
      for (const phiA of samples) {
        const phiB = meshPhase(phiA, zA, zB, alpha)
        const sum = toothIndexAt(phiA, zA, alpha) + toothIndexAt(phiB, zB, alpha + Math.PI)
        expect(offHalf(sum)).toBeLessThan(1e-6)
      }
    }
  })

  it('rolls the partner the opposite way at the tooth ratio', () => {
    const a = meshPhase(0, 20, 34, Math.PI)
    const b = meshPhase(1, 20, 34, Math.PI)
    expect(b - a).toBeCloseTo(-20 / 34, 12)
  })

  it('derives every train angle from the input angle with the right speed ratios', () => {
    const t0 = trainAngles(0)
    const t1 = trainAngles(1)
    expect(t1.layshaft - t0.layshaft).toBeCloseTo(-HEAD_PAIR.driver / HEAD_PAIR.driven, 12)
    for (const g of Object.keys(SPEED_PAIRS) as IndirectGearId[]) {
      // Each free mainshaft gear turns at input ÷ ratio, the same direction as the input.
      expect(t1.main[g] - t0.main[g]).toBeCloseTo(1 / gearRatio(g)!, 12)
    }
    expect(t1.reverse - t0.reverse).toBeCloseTo(1 / gearRatio('R')!, 12)
    expect(lockedBase('4', t1) - lockedBase('4', t0)).toBe(1)
  })

  it('keeps every mesh in the train exact at arbitrary input angles', () => {
    for (const input of samples) {
      const t = trainAngles(input)
      const check = (phiA: number, zA: number, phiB: number, zB: number, alpha: number) =>
        expect(offHalf(toothIndexAt(phiA, zA, alpha) + toothIndexAt(phiB, zB, alpha + Math.PI))).toBeLessThan(1e-6)
      check(t.input, HEAD_PAIR.driver, t.layshaft, HEAD_PAIR.driven, MESH_DIRECTIONS.down)
      for (const g of Object.keys(SPEED_PAIRS) as IndirectGearId[]) {
        check(t.layshaft, SPEED_PAIRS[g].driver, t.main[g], SPEED_PAIRS[g].driven, MESH_DIRECTIONS.up)
      }
      check(t.layshaft, REVERSE_TRAIN.driver, t.idler, REVERSE_TRAIN.idler, MESH_DIRECTIONS.layToIdler)
      check(t.idler, REVERSE_TRAIN.idler, t.reverse, REVERSE_TRAIN.driven, MESH_DIRECTIONS.idlerToMain)
    }
  })
})

describe('clutch pose', () => {
  it('clamps the plate on the disc when engaged and lifts it at full release', () => {
    const on = clutchPose(0, 1)
    expect(on.plateRetract).toBe(0)
    expect(on.diaphragmScale).toBe(1)
    const off = clutchPose(1, 0)
    expect(off.plateRetract).toBeCloseTo(CLUTCH_GEO.plateGap, 12)
    expect(off.discFloat).toBeCloseTo(CLUTCH_GEO.plateGap / 2, 12)
    // The diaphragm never flattens completely (no degenerate scale).
    expect(off.diaphragmScale).toBeGreaterThan(0.2)
  })

  it('moves the release bearing towards the flywheel as the pedal goes down, closing the free-play gap first', () => {
    const up = clutchPose(0, 1)
    const takenUp = clutchPose(CLUTCH.freePlay, 1)
    const down = clutchPose(1, 0)
    expect(up.bearingX - takenUp.bearingX).toBeCloseTo(CLUTCH_GEO.bearingFreeGap, 12)
    expect(down.bearingX).toBeLessThan(takenUp.bearingX)
    expect(takenUp.bearingX).toBeGreaterThan(CLUTCH_X.fulcrum)
  })
})

describe('visual speed', () => {
  it('slows real shaft speeds down 100×', () => {
    expect(visualRadPerSecond(6000)).toBeCloseTo(TWO_PI, 12) // 6000 rpm → one turn per second on screen
    expect(MODULE).toBeGreaterThan(0)
  })
})
