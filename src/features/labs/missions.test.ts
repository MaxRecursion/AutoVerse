import { describe, expect, it } from 'vitest'
import { createLabStore } from '@/lib/simulation/labStore'
import { engineLabConfig } from '@/features/engine-lab/config'
import { transmissionLabConfig } from '@/features/transmission-lab/config'
import { brakingLabConfig } from '@/features/braking-lab/config'
import { suspensionLabConfig } from '@/features/suspension-lab/config'
import { getMissions, completedMissions, emptyContext, observe, MISSIONS } from './missions'

const watch = (config: Parameters<typeof createLabStore>[0]) => {
  const store = createLabStore(config)
  let ctx = observe(emptyContext(), store.getState())
  store.subscribe((s) => (ctx = observe(ctx, s)))
  return { store, ctx: () => ctx }
}
const done = (labId: string, ctx: ReturnType<typeof emptyContext>) => completedMissions(labId, ctx)

describe('lab missions', () => {
  it('defines 3–4 missions for every lab, each with a hint', () => {
    for (const [labId, list] of Object.entries(MISSIONS)) {
      expect(list.length, labId).toBeGreaterThanOrEqual(3)
      expect(new Set(list.map((m) => m.id)).size).toBe(list.length)
      list.forEach((m) => expect(m.hint.length).toBeGreaterThan(5))
    }
    expect(getMissions('unknown-lab')).toEqual([])
  })

  it('starts with nothing done — the initial state is not an achievement', () => {
    for (const [id, config] of Object.entries({ engine: engineLabConfig, transmission: transmissionLabConfig, braking: brakingLabConfig, suspension: suspensionLabConfig })) {
      expect(done(id, watch(config).ctx()), id).toEqual([])
    }
  })

  it('engine: ticks from watching, jumping, selecting and exploding', () => {
    const { store, ctx } = watch(engineLabConfig)
    for (const cue of ['intake', 'compression', 'power', 'exhaust']) store.getState().seekCue(cue)
    expect(done('engine', ctx())).toEqual(['watch-cycle', 'jump-power'])
    store.getState().select('piston')
    store.getState().setExploded(true)
    expect(done('engine', ctx())).toEqual(['watch-cycle', 'jump-power', 'pick-piston', 'explode'])
  })

  it('transmission: needs three distinct gears, a clutch move and reverse', () => {
    const { store, ctx } = watch(transmissionLabConfig)
    store.getState().setParam('gear', '2')
    expect(done('transmission', ctx())).toEqual([])
    store.getState().setParam('gear', '3')
    expect(done('transmission', ctx())).toEqual(['three-gears'])
    store.getState().setParam('clutch', 0.8)
    store.getState().setParam('gear', 'R')
    expect(done('transmission', ctx())).toEqual(['three-gears', 'clutch', 'reverse'])
  })

  it('braking: slippery surfaces and ABS-off are read from the values that were in effect', () => {
    const { store, ctx } = watch(brakingLabConfig)
    store.getState().setParam('surface', 'ice')
    store.getState().setParam('abs', false)
    expect(done('braking', ctx())).toEqual(['slippery', 'abs-off'])
  })

  it('suspension: soft AND stiff dampers, and two roads', () => {
    const { store, ctx } = watch(suspensionLabConfig)
    store.getState().setParam('damping', 'soft')
    expect(done('suspension', ctx())).not.toContain('dampers')
    store.getState().setParam('damping', 'stiff')
    store.getState().setParam('road', 'pothole')
    expect(done('suspension', ctx())).toEqual(expect.arrayContaining(['dampers', 'road']))
  })

  it('observe returns the same object when nothing changed (no needless re-renders)', () => {
    const { store, ctx } = watch(engineLabConfig)
    const before = ctx()
    expect(observe(before, store.getState())).toBe(before)
  })
})
