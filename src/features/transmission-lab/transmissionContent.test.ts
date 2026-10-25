import { describe, expect, it } from 'vitest'
import components from '@/content/components/transmission.json'
import { getComponent, getTopic } from '@/lib/content'
import { createLabStore } from '@/lib/simulation/labStore'
import { CLUTCH_CUES, GEAR_CUE, INITIAL_PARAMS, PARAM, TRANSMISSION_CUES, deriveTransmissionCue, readParams, transmissionLabConfig } from './config'
import { CLUTCH, GEARS, driveState, gearRatio } from './gearbox'
import { formatRatio } from './gearboxText'
import { TRANSMISSION_PART_IDS } from './transmissionParts'

const TOPIC_IDS = ['manual-gearbox', 'clutch', 'gear-ratios'] as const
const cueIds = new Set(TRANSMISSION_CUES.map((c) => c.id))

describe('transmission lab config', () => {
  it('has one cue per gear plus the clutch cues, all unique', () => {
    expect(cueIds.size).toBe(TRANSMISSION_CUES.length)
    for (const g of GEARS) expect(cueIds.has(GEAR_CUE[g])).toBe(true)
    for (const id of Object.values(CLUTCH_CUES)) expect(cueIds.has(id)).toBe(true)
  })

  it('derives the live cue from the selected gear, or the clutch state while the pedal is down', () => {
    expect(deriveTransmissionCue({ ...INITIAL_PARAMS })).toBe('first')
    expect(deriveTransmissionCue({ gear: '4', clutch: 0 })).toBe('fourth')
    expect(deriveTransmissionCue({ gear: '4', clutch: 1 })).toBe('clutch-down')
    expect(deriveTransmissionCue({ gear: '2', clutch: CLUTCH.bitePedal })).toBe('clutch-bite')
    expect(deriveTransmissionCue({ gear: '2', clutch: CLUTCH.slipPedal })).toBe('clutch-slip')
  })

  it('sanitises unknown or out-of-range params', () => {
    expect(readParams({ gear: '7', clutch: 4, rpm: -10, running: 'yes' })).toEqual({ gear: INITIAL_PARAMS.gear, clutch: 1, rpm: 800, running: true })
  })

  it('applies a cue’s params and lands on that cue', () => {
    const store = createLabStore(transmissionLabConfig)
    for (const cue of TRANSMISSION_CUES) {
      store.getState().seekCue(cue.id)
      for (const [k, v] of Object.entries(cue.params ?? {})) expect(store.getState().params[k]).toBe(v)
      // clutch-engaged shares 1st gear's params, so the live cue reads "first".
      expect(store.getState().cue).toBe(cue.id === CLUTCH_CUES.engaged ? 'first' : cue.id)
    }
    // The last cue left the clutch slipping, so the clutch state wins until the pedal comes up.
    store.getState().setParam(PARAM.gear, 'R')
    expect(store.getState().cue).toBe('clutch-slip')
    store.getState().setParam(PARAM.clutch, 0)
    expect(store.getState().cue).toBe('reverse')
  })
})

describe('transmission content', () => {
  it('describes every scene part in the transmission components file', () => {
    const ids = components.map((c) => c.id)
    expect(new Set(ids)).toEqual(new Set(TRANSMISSION_PART_IDS))
    for (const id of TRANSMISSION_PART_IDS) expect(getComponent(id)?.systemId).toBe('transmission')
  })

  it('quotes the same ratios in the component notes as the gearbox maths', () => {
    const note = (id: string) => getComponent(id)?.annotations.find((a) => a.label === 'Ratio')?.text ?? ''
    expect(note('first-gear')).toContain(formatRatio(gearRatio('1')))
    expect(note('second-gear')).toContain(formatRatio(gearRatio('2')))
    expect(note('third-gear')).toContain(formatRatio(gearRatio('3')))
    expect(note('fifth-gear')).toContain(formatRatio(gearRatio('5')))
    expect(note('reverse-idler')).toContain(Math.abs(gearRatio('R') ?? 0).toFixed(2))
  })

  it.each(TOPIC_IDS)('%s is a complete lesson wired to the lab', (id) => {
    const t = getTopic(id)
    expect(t).toBeDefined()
    if (!t) return
    expect(t.categoryId).toBe('transmission')
    expect(t.labId).toBe('transmission')
    expect(t.contentStatus).toBe('complete')
    expect(t.licence.name).toBe('AutoVerse original content')
    expect(t.quiz.length).toBeGreaterThanOrEqual(4)
    expect(t.quiz.length).toBeLessThanOrEqual(5)
    expect(t.steps.length).toBeGreaterThanOrEqual(4)
    expect(t.flow?.nodes.length).toBeGreaterThan(0)
    expect(t.keyConcepts.length).toBeGreaterThan(0)
    expect(t.misconceptions.length).toBeGreaterThan(0)
    expect(t.practicalExamples.length).toBeGreaterThan(0)
    for (const s of t.steps) {
      expect(s.cue && cueIds.has(s.cue), `step ${s.id} cue ${s.cue}`).toBe(true)
      for (const c of s.componentIds) expect(getComponent(c), `step ${s.id} component ${c}`).toBeDefined()
    }
    for (const c of t.componentIds) expect(getComponent(c), c).toBeDefined()
    for (const r of [...t.relatedTopicIds, ...t.prerequisiteTopicIds]) expect(getTopic(r), r).toBeDefined()
  })

  it('quotes clutch figures that match the illustrative model', () => {
    const bite = driveState({ gear: '1', pedal: CLUTCH.bitePedal, rpm: 2000 })
    const slip = driveState({ gear: '1', pedal: CLUTCH.slipPedal, rpm: 2000 })
    expect(Math.round(bite.torqueFraction * 100)).toBe(14)
    expect(Math.round(slip.torqueFraction * 100)).toBe(68)
    expect(Math.round(slip.clutchHeatKw)).toBe(7)
  })
})
