import { describe, expect, it } from 'vitest'
import { bankOf, engines, getEngine } from './engines'
import { activeEventIndex, bankGaps, describeIntervals, evenFiringSplit, firingEvents, firingFrequency, gapPattern, isEvenFiring, pairedVIntervals } from './firing'

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

describe('paired-crankpin V intervals', () => {
  it('gives a 90° V10 with shared pins 90° and 54° gaps (Viper, S85, Audi 5.2)', () => {
    expect(gapPattern(pairedVIntervals(10, 90))).toEqual([90, 54])
  })
  it('makes a 90° V10 even with an 18° split (Gallardo 5.0, Triton)', () => {
    expect(isEvenFiring(pairedVIntervals(10, 90, -18))).toBe(true)
    expect(pairedVIntervals(10, 90, -18)[0]).toBe(72)
  })
  it('fires a 72° V10 evenly and a 68° V10 at 68° and 76° (LFA, Carrera GT)', () => {
    expect(isEvenFiring(pairedVIntervals(10, 72))).toBe(true)
    expect(gapPattern(pairedVIntervals(10, 68))).toEqual([68, 76])
  })
  it('gives the odd-fire 90° V6 90° and 150° gaps, and a 30° split makes it even', () => {
    expect(gapPattern(pairedVIntervals(6, 90))).toEqual([90, 150])
    expect(evenFiringSplit(6, 90)).toBe(30)
    expect(isEvenFiring(pairedVIntervals(6, 90, 30))).toBe(true)
  })
  it('never lets a gap collapse to zero and always fills 720°', () => {
    for (const bank of [10, 45, 90, 140, 200]) {
      const gaps = pairedVIntervals(10, bank, 40)
      expect(Math.min(...gaps)).toBeGreaterThan(0)
      expect(sum(gaps)).toBeCloseTo(720)
    }
  })
  it('rejects odd cylinder counts', () => {
    expect(() => pairedVIntervals(5, 72)).toThrow()
  })
})

describe('per-bank rhythm', () => {
  it('shows the cross-plane V8 as even overall but uneven on each bank', () => {
    const v8 = getEngine('v8-cross')!
    const events = firingEvents(v8.intervals, v8.order, bankOf(v8))
    expect(isEvenFiring(v8.intervals)).toBe(true)
    expect(new Set(bankGaps(events, 'A')).size).toBeGreaterThan(1)
    expect(new Set(bankGaps(events, 'B')).size).toBeGreaterThan(1)
  })
  it('shows the flat-plane V8 alternating banks evenly', () => {
    const v8 = getEngine('v8-flat')!
    const events = firingEvents(v8.intervals, v8.order, bankOf(v8))
    expect(bankGaps(events, 'A')).toEqual([180, 180, 180, 180])
    expect(bankGaps(events, 'B')).toEqual([180, 180, 180, 180])
  })
})

describe('helpers', () => {
  it('counts firing pulses per second', () => {
    expect(firingFrequency(8, 6000)).toBe(400)
    expect(firingFrequency(3, 1200)).toBe(30)
  })
  it('describes even and alternating patterns', () => {
    expect(describeIntervals(pairedVIntervals(10, 72))).toBe('even, every 72°')
    expect(describeIntervals(pairedVIntervals(10, 90, 0, false))).toBe('alternating 54° and 90°')
  })
  it('finds the latest firing at the playhead', () => {
    const events = firingEvents([180, 180, 180, 180], [1, 3, 4, 2], () => 'mid')
    expect(activeEventIndex(events, 0)).toBe(0)
    expect(activeEventIndex(events, 400)).toBe(2)
  })
})

describe('engine catalogue', () => {
  it('covers three to ten cylinders', () => {
    expect(new Set(engines.map((e) => e.cylinders))).toEqual(new Set([3, 4, 5, 6, 8, 10]))
  })
  it.each(engines.map((e) => [e.id, e]))('%s is internally consistent', (_id, e) => {
    expect(e.intervals).toHaveLength(e.cylinders)
    expect(sum(e.intervals)).toBeCloseTo(720)
    expect(e.idleRpm).toBeLessThan(e.redlineRpm)
    expect(e.cars.length).toBeGreaterThan(0)
    if (e.order) {
      expect([...e.order].sort((a, b) => a - b)).toEqual(Array.from({ length: e.cylinders }, (_, i) => i + 1))
    }
    if (e.layout !== 'inline' && e.order) {
      expect([...e.bankA, ...e.bankB].sort((a, b) => a - b)).toEqual(Array.from({ length: e.cylinders }, (_, i) => i + 1))
    }
    if (e.pairedV) expect(e.pairedV.bankAngle).toBe(e.bankAngle)
  })
  it('uses unique ids', () => {
    expect(new Set(engines.map((e) => e.id)).size).toBe(engines.length)
  })
  it('matches the published gaps of the V10s in the reference set', () => {
    const pattern = (id: string) => gapPattern(getEngine(id)!.intervals).sort((a, b) => a - b)
    expect(pattern('v10-viper')).toEqual([54, 90])
    expect(pattern('v10-s85')).toEqual([54, 90])
    expect(pattern('v10-audi-52')).toEqual([54, 90])
    expect(pattern('v10-gallardo-even')).toEqual([72])
    expect(pattern('v10-triton')).toEqual([72])
    expect(pattern('v10-tdi')).toEqual([72])
    expect(pattern('v10-magnum')).toEqual([54, 90])
    expect(pattern('v10-lfa')).toEqual([72])
    expect(pattern('v10-carrera-gt')).toEqual([68, 76])
  })
  it('alternates banks in the V10 firing orders, as shared-pin V10s must', () => {
    for (const id of ['v10-viper', 'v10-s85', 'v10-audi-52', 'v10-carrera-gt', 'v10-magnum', 'v10-tdi']) {
      const e = getEngine(id)!
      const banks = firingEvents(e.intervals, e.order, bankOf(e)).map((ev) => ev.bank)
      banks.forEach((b, i) => expect(b).not.toBe(banks[(i + 1) % banks.length]))
    }
  })
})
