import { describe, expect, it, vi } from 'vitest'
import {
  absolutePinAngle,
  combustionGlow,
  CRANK_RADIUS,
  crankSections,
  createFrameBus,
  crossedEvents,
  DEG,
  dialAngle,
  ease,
  exhaustPuff,
  mod,
  pistonPinDistance,
  ROD_LENGTH,
  rotationSense,
  ignitionFlash,
  visualStep,
  type EngineFrame,
} from './animation'
import { bankOf, engines, getEngine, type EngineSpec } from './engines'
import { firingEvents } from './firing'

const productionEvents = (spec: EngineSpec) => firingEvents(spec.intervals, spec.order, bankOf(spec))
const drawnAngle = (spec: EngineSpec) => (spec.layout === 'flat' ? 180 : spec.bankAngle)

/** Angle between the two throws of each crank section, 0–359°. */
function pinOffsets(spec: EngineSpec, playhead: number): number[] {
  const events = productionEvents(spec)
  const sense = rotationSense(spec, events)
  return crankSections(spec, events)
    .filter((s) => s.cylinders.length === 2)
    .map(({ cylinders: [a, b] }) => {
      const pinA = absolutePinAngle(a!.side, drawnAngle(spec), sense, playhead, a!.event.angle)
      const pinB = absolutePinAngle(b!.side, drawnAngle(spec), sense, playhead, b!.event.angle)
      return Math.round(mod(pinB - pinA, 360)) % 360
    })
}

describe('slowed crank and firing detection', () => {
  it('turns at a fortieth of engine speed', () => {
    expect(visualStep(6000, 1)).toBe(900)
    expect(visualStep(-50, 1)).toBe(0)
  })
  it('finds the firings passed between frames, in order, across the 720° wrap', () => {
    const events = firingEvents([180, 180, 180, 180], [1, 3, 4, 2], () => 'mid')
    expect(crossedEvents(events, 170, 20)).toEqual([1])
    expect(crossedEvents(events, 700, 200)).toEqual([0, 1])
    expect(crossedEvents(events, 0, 10)).toEqual([])
    expect(crossedEvents(events, 10, 0)).toEqual([])
    expect(crossedEvents(events, 0, 720)).toEqual([0, 1, 2, 3])
  })
  it('eases towards a target and snaps when the time constant is zero', () => {
    expect(ease(0, 100, 0.1, 0.1)).toBeCloseTo(100 * (1 - Math.exp(-1)))
    expect(ease(0, 100, 0.1, 0)).toBe(100)
    expect(ease(Number.NaN, 5, 0.1, 0.2)).toBe(5)
  })
})

describe('crank geometry in the cylinder sections', () => {
  it('keeps the connecting rod one length at every crank angle', () => {
    for (let deg = 0; deg < 360; deg += 15) {
      const d = pistonPinDistance(deg)
      const pin = { x: CRANK_RADIUS * Math.sin(deg * DEG), y: -CRANK_RADIUS * Math.cos(deg * DEG) }
      expect(Math.hypot(pin.x, -d - pin.y)).toBeCloseTo(ROD_LENGTH, 6)
    }
    expect(pistonPinDistance(0)).toBeCloseTo(CRANK_RADIUS + ROD_LENGTH)
    expect(pistonPinDistance(180)).toBeCloseTo(ROD_LENGTH - CRANK_RADIUS)
  })

  it.each([
    ['inline-4', 1],
    ['v8-flat', 1],
    ['v8-cross', -1],
    ['v10-viper', -1],
    ['v10-s85', 1],
    ['v10-carrera-gt', 1],
    ['v6-90-odd', -1],
  ] as const)('turns %s the way its numbering and firing order require', (id, sense) => {
    const spec = getEngine(id)!
    expect(rotationSense(spec, productionEvents(spec))).toBe(sense)
  })

  it.each(['v10-viper', 'v10-magnum', 'v10-s85', 'v10-audi-52', 'v10-lfa', 'v10-carrera-gt', 'v6-90-odd', 'v8-cross', 'v8-flat'])(
    'draws both rods of %s on one shared crankpin',
    (id) => {
      const spec = getEngine(id)!
      for (const playhead of [0, 37, 211, 503]) expect(pinOffsets(spec, playhead).every((o) => o === 0)).toBe(true)
    },
  )

  it.each(['v10-gallardo-even', 'v10-triton', 'v10-tdi'])('shows the 18° split crankpins of %s', (id) => {
    const offsets = pinOffsets(getEngine(id)!, 123)
    expect(offsets.length).toBe(5)
    expect(offsets.every((o) => o === 18 || o === 342)).toBe(true)
  })

  it.each(['flat-4', 'flat-6'])('puts opposed throws 180° apart on the %s', (id) => {
    expect(pinOffsets(getEngine(id)!, 77).every((o) => o === 180)).toBe(true)
  })

  it('offsets the 60° V6’s paired throws by 60° for even firing', () => {
    expect(pinOffsets(getEngine('v6-60')!, 300).every((o) => o === 60 || o === 300)).toBe(true)
  })

  it('places every cylinder of every preset in exactly one section', () => {
    for (const spec of engines) {
      const placed = crankSections(spec, productionEvents(spec)).flatMap((s) => s.cylinders.map((c) => c.event.index))
      expect(placed.sort((a, b) => a - b)).toEqual(Array.from({ length: spec.cylinders }, (_, i) => i))
    }
  })
})

describe('combustion cues', () => {
  it('treats only the VW V10 TDI as a diesel (no spark plug)', () => {
    expect(engines.filter((e) => e.ignition === 'compression').map((e) => e.id)).toEqual(['v10-tdi'])
  })
  it('lights the flame at the firing and puts it out by the end of the power stroke', () => {
    expect(combustionGlow(0)).toBe(1)
    expect(combustionGlow(80)).toBeGreaterThan(0)
    expect(combustionGlow(80)).toBeLessThan(combustionGlow(20))
    expect(combustionGlow(160)).toBe(0)
    expect(combustionGlow(700)).toBe(0)
  })
  it('flashes ignition only at the firing', () => {
    expect(ignitionFlash(0)).toBe(1)
    expect(ignitionFlash(30)).toBe(0)
    expect(ignitionFlash(-1)).toBe(0)
  })
  it('sends the exhaust pulse out between valve opening and the end of the exhaust stroke', () => {
    expect(exhaustPuff(100).strength).toBe(0)
    expect(exhaustPuff(200).strength).toBeGreaterThan(0.5)
    expect(exhaustPuff(400).strength).toBe(0)
    expect(exhaustPuff(300).travel).toBeGreaterThan(exhaustPuff(200).travel)
  })
})

describe('rev counter', () => {
  it('sweeps 240° from zero to full scale and stops just past it', () => {
    expect(dialAngle(0, 8000)).toBe(-120)
    expect(dialAngle(8000, 8000)).toBe(120)
    expect(dialAngle(4000, 8000)).toBe(0)
    expect(dialAngle(20000, 8000)).toBeCloseTo(-120 + 240 * 1.03)
    expect(dialAngle(-5, 8000)).toBe(-120)
  })
})

describe('frame bus', () => {
  const frame = (playhead: number): EngineFrame => ({ playhead, running: true, animate: true, rpm: 1000, limiting: false, bank: 90, fired: [], cycle: null, dt: 0.016, now: 0 })
  it('hands a new subscriber the latest frame, then every frame until it leaves', () => {
    const bus = createFrameBus()
    const early = vi.fn()
    bus.subscribe(early)
    bus.publish(frame(10))
    const late = vi.fn()
    const leave = bus.subscribe(late)
    expect(late).toHaveBeenCalledWith(expect.objectContaining({ playhead: 10 }))
    leave()
    bus.publish(frame(20))
    expect(early).toHaveBeenCalledTimes(2)
    expect(late).toHaveBeenCalledTimes(1)
    expect(bus.last?.playhead).toBe(20)
  })
})
