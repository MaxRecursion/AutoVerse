import { describe, expect, it } from 'vitest'
import { getComponent, getTopic } from '@/lib/content'
import { createLabStore } from '@/lib/simulation/labStore'
import { BAR, G, clampMultiplication, hydraulicChain, planStop, summarizeStop, toLabParams } from './braking'
import { BRAKE_PART_IDS } from './brakeParts'
import { BRAKING_CUES, EVENT_CUE_IDS, LIVE_CUE_IDS, SCENARIOS, brakingLabConfig, deriveBrakingCue } from './config'

const TOPIC_IDS = ['disc-brakes', 'anti-lock-braking'] as const
const cueIds = new Set(BRAKING_CUES.map((c) => c.id))

describe('braking lab config', () => {
  it('defines every live and event cue once, each with in-range progress and a full scenario', () => {
    expect(cueIds.size).toBe(BRAKING_CUES.length)
    expect([...cueIds].sort()).toEqual([...LIVE_CUE_IDS, ...EVENT_CUE_IDS].sort())
    for (const c of BRAKING_CUES) {
      expect(c.progress, c.id).toBeGreaterThanOrEqual(0)
      expect(c.progress, c.id).toBeLessThanOrEqual(1)
      expect(Object.keys(c.params ?? {}).sort(), c.id).toEqual(Object.keys(toLabParams(SCENARIOS.firmStop)).sort())
    }
    expect(brakingLabConfig.loop).toBe(false)
  })

  it('lands each live cue on its own phase when a lesson seeks it', () => {
    const store = createLabStore(brakingLabConfig)
    for (const id of LIVE_CUE_IDS) {
      store.getState().seekCue(id)
      expect(store.getState().cue, id).toBe(id)
    }
  })

  it('never returns an event cue from deriveCue', () => {
    const live = new Set<string>(LIVE_CUE_IDS)
    for (const scenario of Object.values(SCENARIOS)) {
      for (let i = 0; i <= 200; i++) expect(live.has(deriveBrakingCue(i / 200, toLabParams(scenario)))).toBe(true)
    }
  })

  it('puts each event cue on the moment it names', () => {
    const store = createLabStore(brakingLabConfig)
    const phaseAfterSeek = (id: string) => {
      store.getState().seekCue(id)
      return store.getState().cue
    }
    expect(phaseAfterSeek('clamp')).toBe('braking')
    expect(phaseAfterSeek('heat')).toBe('braking')
    expect(phaseAfterSeek('abs-release')).toBe('abs-active')
    expect(phaseAfterSeek('abs-reapply')).toBe('abs-active')
    expect(phaseAfterSeek('abs-stopped')).toBe('stopped')
    expect(phaseAfterSeek('lock-stopped')).toBe('stopped')
  })
})

describe('braking content', () => {
  it.each(TOPIC_IDS)('%s is a complete lesson wired to the lab', (id) => {
    const t = getTopic(id)
    expect(t).toBeDefined()
    if (!t) return
    expect(t.categoryId).toBe('brakes')
    expect(t.labId).toBe('braking')
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
      for (const c of s.componentIds) expect((BRAKE_PART_IDS as readonly string[]).includes(c), `step ${s.id} component ${c}`).toBe(true)
    }
    for (const c of t.componentIds) expect(getComponent(c), c).toBeDefined()
    for (const r of [...t.relatedTopicIds, ...t.prerequisiteTopicIds]) expect(getTopic(r), r).toBeDefined()
  })

  it('quotes the same figures as the illustrative model', () => {
    const chain = hydraulicChain(120)
    expect(Math.round(clampMultiplication())).toBe(69)
    expect(Math.round(chain.pressurePa / BAR)).toBe(33)
    expect((chain.clampN / 1000).toFixed(1)).toBe('8.3')
    expect((chain.frictionN / 1000).toFixed(1)).toBe('6.6')
    expect(Math.round(chain.torqueNm / 100) * 100).toBe(800)
    expect((chain.decel / G).toFixed(2)).toBe('0.66')

    const firm = summarizeStop(planStop(SCENARIOS.firmStop))
    expect(Math.round(firm.stopDistance)).toBe(41)
    expect(Math.round(firm.discRiseK)).toBe(29)
    expect(Math.round(firm.energyTotal / 1000)).toBe(99)

    const wetPlan = planStop(SCENARIOS.wetLock)
    expect((wetPlan.demandDecel / G).toFixed(1)).toBe('1.2')
    expect((wetPlan.gripDecel / G).toFixed(1)).toBe('0.7')
    const locked = summarizeStop(wetPlan)
    const abs = summarizeStop(planStop(SCENARIOS.wetAbs))
    expect(Math.round(locked.stopDistance)).toBe(51)
    expect(locked.stopTime.toFixed(1)).toBe('4.6')
    expect(Math.round(abs.stopDistance)).toBe(41)
    expect(abs.stopTime.toFixed(1)).toBe('3.6')

    // And the lessons actually say so.
    const text = (id: string) => JSON.stringify(getTopic(id))
    expect(text('disc-brakes')).toMatch(/about 69/)
    expect(text('disc-brakes')).toMatch(/8\.3 kN/)
    expect(text('disc-brakes')).toMatch(/41 m/)
    expect(text('anti-lock-braking')).toMatch(/51 m and 4\.6 s/)
    expect(text('anti-lock-braking')).toMatch(/41 m and 3\.6 s/)
  })
})
