import { describe, expect, it } from 'vitest'
import { MM } from '@/features/engine-lab/engineModel'
import { ENGINE_GEOMETRY, crankPinPosition, strokeAt } from '@/features/engine-lab/kinematics'
import { bankOf, engines, getEngine } from './engines'
import { firingEvents, pairedVIntervals } from './firing'
import { rotationSense } from './animation'
import { CUTAWAY_PITCH, cutawayLayout, cutawayMirror, cutawayState, cutawayToWorld, exhaustSeats, exhaustSeatsKey } from './cutawayMath'

/** Where the exhaust port leaves the side of the Engine Lab head, in a cylinder's own frame. */
const PORT_EXIT = { z: -0.86, y: 2.55 }

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

  it('mirrors bank B of V and boxer engines and the whole of an inline engine, never the single-cylinder view', () => {
    expect(cutawayMirror('v', 'B', false)).toBe(-1)
    expect(cutawayMirror('flat', 'B', false)).toBe(-1)
    expect(cutawayMirror('v', 'A', false)).toBe(1)
    expect(cutawayMirror('inline', 'mid', false)).toBe(-1)
    expect(cutawayMirror('v', 'B', true)).toBe(1)
    expect(cutawayMirror('inline', 'mid', true)).toBe(1)
  })

  it('turns an inline engine’s exhaust towards the camera side (+z)', () => {
    for (const spec of engines.filter((e) => e.layout === 'inline')) {
      const events = firingEvents(spec.intervals, spec.order, bankOf(spec))
      for (const c of cutawayLayout(spec, events, spec.bankAngle, rotationSense(spec, events))) {
        const port = cutawayToWorld(c.side, 0, cutawayMirror(spec.layout, c.side, false), c.x, PORT_EXIT)
        expect(port[2], spec.id).toBeGreaterThan(0.5)
      }
    }
  })

  it('turns every exhaust port outwards: away from the vee, or down under a boxer', () => {
    for (const spec of engines.filter((e) => e.layout !== 'inline' && e.cylinders !== 10)) {
      const events = firingEvents(spec.intervals, spec.order, bankOf(spec))
      for (const c of cutawayLayout(spec, events, spec.bankAngle, rotationSense(spec, events))) {
        const mirror = cutawayMirror(spec.layout, c.side, false)
        const port = cutawayToWorld(c.side, spec.bankAngle, mirror, c.x, PORT_EXIT)
        const bore = cutawayToWorld(c.side, spec.bankAngle, mirror, c.x, { z: 0, y: PORT_EXIT.y })
        if (spec.layout === 'flat') expect(port[1], `${spec.id} ${c.side}`).toBeLessThan(-0.5)
        else {
          expect(Math.sign(port[2]), `${spec.id} ${c.side}`).toBe(Math.sign(bore[2]))
          expect(Math.abs(port[2])).toBeGreaterThan(Math.abs(bore[2]))
        }
      }
    }
  })

  it('keeps a mirrored cylinder’s crankpin, rod and piston exactly where the unmirrored one had them', () => {
    for (const sense of [-1, 1] as const) {
      for (let playhead = 0; playhead < 720; playhead += 17) {
        const plain = cutawayState(playhead, 90, sense, 1)
        const mirrored = cutawayState(playhead, 90, sense, -1)
        const pin = (state: typeof plain, mirror: 1 | -1) => {
          const p = crankPinPosition(state.mechanicalDeg)
          return cutawayToWorld('B', 90, mirror, 0, { z: p.z * MM, y: p.y * MM })
        }
        const a = pin(plain, 1)
        const b = pin(mirrored, -1)
        for (let i = 0; i < 3; i++) expect(b[i]).toBeCloseTo(a[i]!, 9)
        expect(mirrored.pistonY).toBeCloseTo(plain.pistonY, 12)
        expect(mirrored.rodRotation).toBeCloseTo(-plain.rodRotation, 12)
        expect(mirrored.cycleDeg).toBe(plain.cycleDeg)
        // The rod still reaches its pin at constant length inside the mirrored frame.
        const p = crankPinPosition(mirrored.mechanicalDeg)
        expect(Math.hypot(mirrored.pistonY * 100 - p.y, p.z)).toBeCloseTo(ENGINE_GEOMETRY.rodLengthMm, 7)
      }
    }
  })

  it('keys the exhaust by cylinder seat, so bank-angle and crankpin-split steps keep the pipework', () => {
    const spec = getEngine('v6-90-odd')!
    const place = (bankAngle: number, split: number) => {
      const events = firingEvents(pairedVIntervals(spec.cylinders, bankAngle, split, spec.pairedV!.startWithPair), spec.order, bankOf(spec))
      return cutawayLayout(spec, events, bankAngle, rotationSense(spec, events))
    }
    const stock = place(90, 0)
    const key = exhaustSeatsKey(stock, false)
    expect(exhaustSeatsKey(place(60, 30), false)).toBe(key)
    expect(exhaustSeatsKey(place(90, -15), false)).toBe(key)
    expect(exhaustSeats(key)).toEqual(stock.map((cylinder) => ({ index: cylinder.event.index, side: cylinder.side, x: cylinder.x })))
    // The single-cylinder view draws its one cylinder at the origin, and picking another one is a new seat.
    const [first, second] = stock
    expect(exhaustSeats(exhaustSeatsKey([first!], true))).toEqual([{ index: first!.event.index, side: first!.side, x: 0 }])
    expect(exhaustSeatsKey([second!], true)).not.toBe(exhaustSeatsKey([first!], true))
    expect(exhaustSeats('')).toEqual([])
  })

  it('draws one crank per shared-pin pair and separate split/boxer throws', () => {
    for (const [id, cranks] of [['v10-viper', 5], ['v8-cross', 4], ['v10-gallardo-even', 10], ['flat-4', 4]] as const) {
      const spec = getEngine(id)!
      const events = firingEvents(spec.intervals, spec.order, bankOf(spec))
      expect(cutawayLayout(spec, events, spec.bankAngle, rotationSense(spec, events)).filter((c) => c.showCrank)).toHaveLength(cranks)
    }
  })
})
