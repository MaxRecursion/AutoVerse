import { describe, expect, it } from 'vitest'
import { ENGINE_GEOMETRY, crankPinPosition, strokeAt } from '@/features/engine-lab/kinematics'
import { bankOf, engines, getEngine } from './engines'
import { firingEvents } from './firing'
import { rotationSense } from './animation'
import { CUTAWAY_PITCH, cutawayLayout, cutawayState } from './cutawayMath'

describe('multi-cylinder cutaway phasing', () => {
  it('starts at power TDC and follows power, exhaust, intake, compression in both rotation directions', () => {
    for (const sense of [-1, 1] as const) {
      expect([0, 180, 360, 540].map((phase) => strokeAt(cutawayState(phase + 72, 72, sense).cycleDeg))).toEqual(['power', 'exhaust', 'intake', 'compression'])
    }
  })

  it('keeps the detailed connecting rod attached to its crankpin at constant length', () => {
    for (const sense of [-1, 1] as const) {
      for (let phase = 0; phase < 720; phase += 13) {
        const state = cutawayState(phase, 0, sense)
        const pin = crankPinPosition(state.mechanicalDeg)
        const rodMm = Math.hypot(state.pistonY * 100 - pin.y, pin.z)
        expect(rodMm).toBeCloseTo(ENGINE_GEOMETRY.rodLengthMm, 7)
      }
    }
  })

  it('positions every production cylinder once and spaces consecutive journals evenly', () => {
    for (const spec of engines) {
      const events = firingEvents(spec.intervals, spec.order, bankOf(spec))
      const placed = cutawayLayout(spec, events, spec.bankAngle, rotationSense(spec, events))
      expect(placed.map((c) => c.event.index).sort((a, b) => a - b)).toEqual(events.map((e) => e.index))
      const journals = [...new Set(placed.map((c) => c.x))].sort((a, b) => a - b)
      for (let i = 1; i < journals.length; i++) expect(journals[i]! - journals[i - 1]!).toBeCloseTo(CUTAWAY_PITCH)
    }
  })

  it('draws one crank per shared-pin pair and separate split/boxer throws', () => {
    for (const [id, cranks] of [['v10-viper', 5], ['v8-cross', 4], ['v10-gallardo-even', 10], ['flat-4', 4]] as const) {
      const spec = getEngine(id)!
      const events = firingEvents(spec.intervals, spec.order, bankOf(spec))
      expect(cutawayLayout(spec, events, spec.bankAngle, rotationSense(spec, events)).filter((c) => c.showCrank)).toHaveLength(cranks)
    }
  })
})
