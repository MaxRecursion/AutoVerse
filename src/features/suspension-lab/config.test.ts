import { describe, expect, it } from 'vitest'
import { createLabStore } from '@/lib/simulation/labStore'
import { PHASE_CUE_IDS, SCENARIO_CUE_IDS, SUSPENSION_CUES, SUSPENSION_STEP, deriveSuspensionCue, formatSuspensionProgress, suspensionLabConfig } from './config'
import { DAMPING_PRESETS, SPRING_RATE_RANGE, poseAt, responseFor, settingsFromParams } from './quarterCar'

const cue = (id: string) => SUSPENSION_CUES.find((c) => c.id === id)!

describe('suspension lab config', () => {
  it('defines every phase and scenario cue once, on the step grid', () => {
    const ids = SUSPENSION_CUES.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual(expect.arrayContaining([...PHASE_CUE_IDS, ...SCENARIO_CUE_IDS]))
    for (const c of SUSPENSION_CUES) {
      const steps = c.progress! / SUSPENSION_STEP
      expect(Math.abs(steps - Math.round(steps)), c.id).toBeLessThan(1e-9)
    }
  })

  it('lands on each phase cue whatever damper and spring the reader has chosen', () => {
    const rates = [SPRING_RATE_RANGE.min, SPRING_RATE_RANGE.initial, 40, SPRING_RATE_RANGE.max]
    for (const id of PHASE_CUE_IDS) {
      const c = cue(id)
      for (const preset of DAMPING_PRESETS)
        for (const springRate of rates) {
          const params = { ...suspensionLabConfig.initialParams, ...c.params, damping: preset.id, springRate }
          expect(deriveSuspensionCue(c.progress!, params), `${id} / ${preset.id} / ${springRate}`).toBe(id)
        }
    }
  })

  it('pauses each scenario cue on the moment its lesson describes', () => {
    const poseFor = (id: string) => {
      const c = cue(id)
      return poseAt(responseFor(settingsFromParams(c.params!)), c.progress!)
    }
    expect(poseFor('airborne').contact).toBe(false)
    expect(poseFor('wheel-hop').contact).toBe(false)
    expect(poseFor('stiff-skip').contact).toBe(false)
    // Full bump: close to the most compressed point of the lap.
    const full = cue('full-bump')
    const r = responseFor(settingsFromParams(full.params!))
    expect(poseFor('full-bump').travel).toBeGreaterThan(r.stats.maxTravel * 0.97)
    // Soft spring: deep enough to touch the bump stop.
    const soft = cue('soft-spring')
    const rs = responseFor(settingsFromParams(soft.params!))
    expect(poseFor('soft-spring').travel).toBeGreaterThan(rs.params.bumpStopAt)
    // Damper too soft: the body is flung well above its ride height after the bump.
    expect(poseFor('soft-float').body).toBeGreaterThan(0.04)
    // Balanced damper: nearly back at ride height while a soft damper would still be bouncing.
    const wd = cue('well-damped')
    expect(Math.abs(poseFor('well-damped').body)).toBeLessThan(0.01)
    expect(Math.abs(poseAt(responseFor(settingsFromParams({ ...wd.params!, damping: 'soft' })), wd.progress!).body)).toBeGreaterThan(0.03)
  })

  it('drives a lab store: params change the response, cues apply their params', () => {
    const store = createLabStore(suspensionLabConfig)
    expect(store.getState().cue).toBe('approach')
    store.getState().seekCue('wheel-hop')
    expect(store.getState().params).toMatchObject({ road: 'washboard', damping: 'soft', springRate: 25 })
    expect(store.getState().cue).toBe('ripples')
    store.getState().setParam('damping', 'stiff')
    store.getState().seekCue('compression')
    // Phase cues keep the reader's damper choice.
    expect(store.getState().params).toMatchObject({ road: 'bump', damping: 'stiff' })
    expect(store.getState().cue).toBe('compression')
  })

  it('formats the timeline as simulated seconds', () => {
    expect(formatSuspensionProgress(0)).toBe('0.00 s')
    expect(formatSuspensionProgress(0.225)).toBe('0.45 s')
    expect(formatSuspensionProgress(1)).toBe('2.00 s')
  })
})
