import { describe, expect, it } from 'vitest'
import { CLUTCH, gearRatio, type GearId } from './gearbox'
import { lockPitch, lockedBase, trainAngles, visualRadPerSecond } from './gearboxModel'
import {
  COAST_SECONDS,
  NEUTRAL_POSE,
  SHIFT_TIMING,
  coastAngle,
  createDriveSim,
  driveFrame,
  engagedGear,
  selectorPoseAt,
  shiftDuration,
  stepDriveSim,
  targetPose,
  type DriveControls,
  type DriveSim,
} from './driveSim'

const DT = 1 / 120
const controls = (over: Partial<DriveControls> = {}): DriveControls => ({ gear: '1', pedal: 0, rpm: 3000, running: true, instant: false, ...over })

function run(sim: DriveSim, seconds: number, c: DriveControls, onStep?: (prev: DriveSim, next: DriveSim) => void): DriveSim {
  let s = sim
  for (let t = 0; t < seconds - 1e-9; t += DT) {
    const next = stepDriveSim(s, DT, c)
    onStep?.(s, next)
    s = next
  }
  return s
}

const wrapPi = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

describe('selector', () => {
  it('maps each gear to one member at full travel', () => {
    expect(engagedGear(targetPose('N'))).toBeNull()
    for (const g of ['1', '2', '3', '4', '5', 'R'] as const) expect(engagedGear(targetPose(g))).toBe(g)
    expect(targetPose('4').h34).toBe(-1)
    expect(targetPose('3').h34).toBe(1)
    expect(targetPose('R').idler).toBe(1)
  })

  it('slides the old collar to neutral before the new one engages (2nd → 3rd)', () => {
    const shift = { from: targetPose('2'), to: '3' as GearId, start: 0 }
    expect(shiftDuration(shift)).toBeCloseTo(SHIFT_TIMING.disengage + SHIFT_TIMING.engage, 12)
    const mid = selectorPoseAt(shift, SHIFT_TIMING.disengage)
    expect(mid).toEqual({ ...NEUTRAL_POSE })
    const half = selectorPoseAt(shift, SHIFT_TIMING.disengage / 2)
    expect(half.h12).toBeLessThan(0)
    expect(half.h12).toBeGreaterThan(-1)
    expect(half.h34).toBe(0)
    expect(engagedGear(selectorPoseAt(shift, shiftDuration(shift)))).toBe('3')
    expect(engagedGear(selectorPoseAt(shift, shiftDuration(shift) - 0.01))).toBeNull()
  })

  it('moves one collar straight through neutral when both gears share it (1st → 2nd)', () => {
    const shift = { from: targetPose('1'), to: '2' as GearId, start: 0 }
    expect(selectorPoseAt(shift, SHIFT_TIMING.disengage).h12).toBe(0)
    expect(selectorPoseAt(shift, shiftDuration(shift)).h12).toBe(-1)
  })

  it('jumps straight to the target when motion is reduced', () => {
    const shift = { from: targetPose('1'), to: '5' as GearId, start: 0 }
    expect(selectorPoseAt(shift, 0, true)).toEqual(targetPose('5'))
  })
})

describe('drive simulation', () => {
  it('derives every gear angle from the one integrated input phase', () => {
    const sim = run(createDriveSim('2'), 1.5, controls({ gear: '2' }))
    const frame = driveFrame(sim, { pedal: 0, instant: false })
    expect(frame.train).toEqual(trainAngles(sim.phase))
    // Locked in 2nd: the mainshaft is the 2nd-gear wheel's angle plus a whole number of dog pitches.
    const k = (frame.output - frame.train.main['2']) / lockPitch('2')
    expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-9)
  })

  it('integrates the input at the clutch-limited visual speed and only while running', () => {
    const sim = run(createDriveSim('1'), 1, controls({ rpm: 3000 }))
    expect(sim.phase).toBeCloseTo(visualRadPerSecond(3000), 6)
    const paused = run(sim, 1, controls({ rpm: 3000, running: false }))
    expect(paused.phase).toBe(sim.phase)
    expect(paused.driveTime).toBe(sim.driveTime)
    expect(paused.selectorTime).toBeGreaterThan(sim.selectorTime)
  })

  it('keeps the flywheel locked to the disc when engaged and lets it run ahead only while slipping', () => {
    const locked = run(createDriveSim('1'), 1, controls())
    expect(locked.slip).toBe(0)
    const slipping = run(locked, 1, controls({ pedal: CLUTCH.slipPedal }))
    expect(slipping.slip).toBeGreaterThan(0)
    expect(slipping.phase - locked.phase).toBeLessThan(visualRadPerSecond(3000))
    const relocked = run(slipping, 1, controls())
    expect(relocked.slip).toBe(slipping.slip)
    const disengaged = run(relocked, 1, controls({ pedal: 1 }))
    expect(disengaged.phase).toBe(relocked.phase) // disc stopped
    expect(disengaged.slip - relocked.slip).toBeCloseTo(visualRadPerSecond(3000), 6) // flywheel keeps turning
  })

  it('turns the mainshaft at input ÷ ratio once a gear is engaged', () => {
    for (const g of ['1', '3', '4', '5', 'R'] as const) {
      const sim = run(createDriveSim(g), 0.5, controls({ gear: g }))
      const a = driveFrame(sim, { pedal: 0, instant: false }).output
      const next = stepDriveSim(sim, DT, controls({ gear: g }))
      const b = driveFrame(next, { pedal: 0, instant: false }).output
      expect((b - a) / DT).toBeCloseTo(visualRadPerSecond(3000) / gearRatio(g)!, 6)
    }
  })

  it('shifts without the mainshaft ever jumping, and locks exactly onto the new gear', () => {
    let sim = run(createDriveSim('2'), 0.7, controls({ gear: '2' }))
    let prevOut = driveFrame(sim, { pedal: 0, instant: false }).output
    const maxSpeed = visualRadPerSecond(3000) / gearRatio('3')!
    let sawNeutral = false
    sim = run(sim, 1.2, controls({ gear: '3' }), (_prev, next) => {
      const f = driveFrame(next, { pedal: 0, instant: false })
      if (f.engaged === null) sawNeutral = true
      // Never moves further in one step than the fastest shaft involved could.
      expect(Math.abs(wrapPi(f.output - prevOut))).toBeLessThan(maxSpeed * DT * 1.5 + 1e-9)
      prevOut = f.output
    })
    expect(sawNeutral).toBe(true)
    expect(sim.lock.mode).toBe('locked')
    const frame = driveFrame(sim, { pedal: 0, instant: false })
    expect(frame.engaged).toBe('3')
    const k = (frame.output - lockedBase('3', frame.train)) / lockPitch('3')
    expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-9)
  })

  it('lets the mainshaft coast down in neutral', () => {
    let sim = run(createDriveSim('1'), 0.5, controls())
    sim = run(sim, SHIFT_TIMING.disengage + 0.05, controls({ gear: 'N' }))
    expect(sim.lock.mode).toBe('free')
    if (sim.lock.mode !== 'free') return
    const coast = sim.lock.coast
    expect(coast.speed).toBeCloseTo(visualRadPerSecond(3000) / gearRatio('1')!, 6)
    const later = coastAngle(coast, coast.since + 20 * COAST_SECONDS)
    expect(later - coast.angle).toBeCloseTo(coast.speed * COAST_SECONDS, 6)
  })

  it('reaches reverse through the sliding idler and turns the output backwards', () => {
    let sim = run(createDriveSim('N'), 0.2, controls({ gear: 'N' }))
    sim = run(sim, 1, controls({ gear: 'R' }))
    const a = driveFrame(sim, { pedal: 0, instant: false })
    expect(a.engaged).toBe('R')
    expect(a.pose.idler).toBe(1)
    const b = driveFrame(stepDriveSim(sim, DT, controls({ gear: 'R' })), { pedal: 0, instant: false })
    expect(b.output - a.output).toBeLessThan(0)
  })

  it('reports the power path only for an engaged gear with torque flowing', () => {
    const inGear = driveFrame(createDriveSim('2'), { pedal: 0, instant: false })
    expect([...inGear.path]).toEqual(['flywheel', 'plate', 'disc', 'input-shaft', 'pinion', 'lay-head', 'layshaft', 'lay-2', 'main-2', 'sync-h12', 'mainshaft'])
    expect(driveFrame(createDriveSim('4'), { pedal: 0, instant: false }).path.has('layshaft')).toBe(false)
    expect(driveFrame(createDriveSim('N'), { pedal: 0, instant: false }).path.size).toBe(0)
    expect(driveFrame(createDriveSim('2'), { pedal: 1, instant: false }).path.size).toBe(0)
  })

  it('locks instantly (within half a pitch) when motion is reduced', () => {
    let sim = run(createDriveSim('1'), 0.5, controls({ instant: true }))
    const before = driveFrame(sim, { pedal: 0, instant: true }).output
    sim = stepDriveSim(sim, DT, controls({ gear: '5', instant: true }))
    expect(sim.lock.mode).toBe('locked')
    const after = driveFrame(sim, { pedal: 0, instant: true }).output
    expect(Math.abs(after - before)).toBeLessThanOrEqual(lockPitch('5') / 2 + visualRadPerSecond(3000) * DT * 2)
  })
})
