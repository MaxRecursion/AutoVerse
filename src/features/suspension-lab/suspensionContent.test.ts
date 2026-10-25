import { describe, expect, it } from 'vitest'
import components from '@/content/components/suspension.json'
import { getComponent, getTopic } from '@/lib/content'
import { LAP_SECONDS, ROAD_SPEED, WASHBOARD, BUMP, POTHOLE, BASE_PARAMS, DAMPING_PRESETS, GRAVITY, bodyFrequency, modelParams, poseAt, responseFor, staticTyreDeflection, staticTyreLoad, wheelHopFrequency, type SuspensionSettings } from './quarterCar'
import { motionRatio, solveLinkage } from './linkage'
import { LOADED_RADIUS } from './suspensionModel'
import { SUSPENSION_CUES } from './config'
import { SUSPENSION_PART_IDS } from './suspensionParts'

const TOPIC_IDS = ['suspension-basics', 'springs-and-dampers'] as const
const cueIds = new Set(SUSPENSION_CUES.map((c) => c.id))

const bump = (damping: SuspensionSettings['damping'], springRate = 25) => responseFor({ road: 'bump', damping, springRate })
const mm = (m: number) => Math.round(m * 1000)
const at = (seconds: number) => seconds / LAP_SECONDS

describe('suspension content', () => {
  it('describes every scene part in the suspension components file', () => {
    const ids = components.map((c) => c.id)
    expect(new Set(ids)).toEqual(new Set(SUSPENSION_PART_IDS))
    expect(ids).toHaveLength(SUSPENSION_PART_IDS.length)
    for (const id of SUSPENSION_PART_IDS) expect(getComponent(id)?.systemId, id).toBe('suspension')
  })

  it.each(TOPIC_IDS)('%s is a complete lesson wired to the lab', (id) => {
    const t = getTopic(id)
    expect(t).toBeDefined()
    if (!t) return
    expect(t.categoryId).toBe('suspension-steering')
    expect(t.labId).toBe('suspension')
    expect(t.contentStatus).toBe('complete')
    expect(t.licence.name).toBe('AutoVerse original content')
    expect(t.quiz.length).toBeGreaterThanOrEqual(4)
    expect(t.quiz.length).toBeLessThanOrEqual(5)
    expect(t.steps.length).toBeGreaterThanOrEqual(4)
    expect(t.flow?.nodes.length).toBeGreaterThan(0)
    expect(t.keyConcepts.some((k) => k.equation)).toBe(true)
    expect(t.misconceptions.length).toBeGreaterThan(0)
    expect(t.practicalExamples.length).toBeGreaterThan(0)
    expect(t.beginnerExplanation.length).toBeGreaterThan(200)
    expect(t.technicalExplanation.length).toBeGreaterThan(200)
    for (const s of t.steps) {
      expect(s.cue && cueIds.has(s.cue), `step ${s.id} cue ${s.cue}`).toBe(true)
      expect(s.componentIds.length, `step ${s.id}`).toBeGreaterThan(0)
      for (const c of s.componentIds) expect(getComponent(c)?.systemId, `step ${s.id} component ${c}`).toBe('suspension')
    }
    for (const c of t.componentIds) expect(getComponent(c), c).toBeDefined()
    for (const r of [...t.relatedTopicIds, ...t.prerequisiteTopicIds]) expect(getTopic(r), r).toBeDefined()
  })

  it('between them, the lessons visit every phase and scenario cue', () => {
    const used = new Set(TOPIC_IDS.flatMap((id) => getTopic(id)?.steps.map((s) => s.cue) ?? []))
    for (const c of SUSPENSION_CUES) expect(used.has(c.id), c.id).toBe(true)
  })
})

/**
 * The lessons quote numbers read off the illustrative model. If the model is
 * retuned, these fail and point at the text that needs rewording.
 */
describe('figures quoted in the lessons match the model', () => {
  it('static load, tyre squash and natural frequencies', () => {
    expect(BASE_PARAMS.sprungMass).toBe(300)
    expect(BASE_PARAMS.unsprungMass).toBe(40)
    expect((BASE_PARAMS.sprungMass * GRAVITY) / 1000).toBeCloseTo(2.9, 1)
    expect(staticTyreLoad(BASE_PARAMS) / 1000).toBeCloseTo(3.3, 1)
    expect(mm(staticTyreDeflection(BASE_PARAMS))).toBe(17)
    const freq = (springRate: number) => modelParams({ road: 'bump', damping: 'balanced', springRate })
    expect(bodyFrequency(freq(25))).toBeCloseTo(1.4, 1)
    expect(bodyFrequency(freq(15))).toBeCloseTo(1.1, 1)
    expect(Math.round(wheelHopFrequency(freq(25)))).toBe(12)
    // Ripples at 18 km/h excite the wheel close to its hop frequency.
    expect(ROAD_SPEED * 3.6).toBe(18)
    expect(WASHBOARD.wavelength).toBe(0.42)
    expect(Math.round(ROAD_SPEED / WASHBOARD.wavelength)).toBe(12)
    expect(mm(BUMP.height)).toBe(60)
    expect(mm(POTHOLE.depth)).toBe(50)
  })

  it('damper presets and the single bump', () => {
    expect(DAMPING_PRESETS.map((p) => p.ratio)).toEqual([0.08, 0.32, 1.1])
    const balanced = bump('balanced')
    const load = (r: ReturnType<typeof bump>, f: number) => f / staticTyreLoad(r.params)
    expect(Math.abs(mm(balanced.stats.maxTravel) - 55)).toBeLessThanOrEqual(1)
    expect(mm(balanced.params.bumpStopAt)).toBe(58)
    expect(balanced.stats.stopHit).toBe(false)
    expect(mm(balanced.stats.maxBody)).toBe(40)
    expect(mm(balanced.stats.minBody)).toBe(-17)
    expect(load(balanced, balanced.stats.minTyreForce)).toBeCloseTo(0.6, 1)
    expect(load(balanced, balanced.stats.maxTyreForce)).toBeCloseTo(1.85, 1)
    expect(balanced.stats.peakBodyAccel).toBeCloseTo(7, 0)

    // Approach: a balanced or firm damper has the corner back at rest; a worn one is still bobbing from the last lap.
    for (const r of [balanced, bump('stiff')]) {
      const p = poseAt(r, at(0.2))
      expect(Math.abs(p.body)).toBeLessThan(0.001)
      expect(Math.abs(p.wheel)).toBeLessThan(0.001)
      expect(p.loadFactor).toBeCloseTo(1, 1)
    }
    expect(Math.abs(poseAt(bump('soft'), at(0.2)).body)).toBeGreaterThan(0.01)

    const compression = poseAt(balanced, at(0.45))
    expect(mm(compression.wheel)).toBe(22)
    expect(mm(compression.body)).toBe(1)
    expect(compression.loadFactor).toBeCloseTo(1.8, 1)
    expect(poseAt(balanced, at(0.54)).loadFactor).toBeCloseTo(0.7, 1)
    expect(Math.abs(mm(poseAt(balanced, at(1.4)).body))).toBeLessThanOrEqual(7)

    const soft = bump('soft')
    expect(mm(soft.stats.maxBody)).toBe(54)
    expect(soft.stats.contactLost).toBe(true)
    expect(mm(poseAt(soft, at(1.4)).body)).toBe(38)

    const stiff = bump('stiff')
    expect(stiff.stats.maxTyreForce / staticTyreLoad(stiff.params)).toBeCloseTo(2.2, 1)
    expect(Math.round(stiff.stats.airborneSeconds * 1000)).toBe(85)
    expect(Math.round(stiff.stats.peakBodyAccel)).toBe(12)

    const softSpring = bump('balanced', 15)
    expect(mm(softSpring.stats.maxTravel)).toBe(60)
    expect(softSpring.stats.stopHit).toBe(true)
    expect(softSpring.params.stopRate / 1000).toBe(160)
  })

  it('pothole, ripples and the linkage', () => {
    const pothole = responseFor({ road: 'pothole', damping: 'balanced', springRate: 25 })
    expect(Math.round(pothole.stats.airborneSeconds * 1000)).toBe(40)
    const ripples = responseFor({ road: 'washboard', damping: 'balanced', springRate: 25 })
    const bodyRange = ripples.stats.maxBody - ripples.stats.minBody
    expect(mm(bodyRange)).toBeGreaterThanOrEqual(9)
    expect(mm(bodyRange)).toBeLessThanOrEqual(12)
    expect(ripples.stats.contactLost).toBe(false)
    const hop = responseFor({ road: 'washboard', damping: 'soft', springRate: 25 })
    expect(hop.stats.airborneSeconds).toBeCloseTo(0.2, 1)
    const ratio = (ripples.stats.maxWheel - ripples.stats.minWheel) / bodyRange
    expect(ratio).toBeGreaterThan(2)
    expect(ratio).toBeLessThan(3)

    expect(motionRatio(0, LOADED_RADIUS)).toBeCloseTo(0.55, 2)
    const peak = bump('balanced').stats.maxTravel
    expect(solveLinkage(peak, LOADED_RADIUS).camberChangeDeg).toBeCloseTo(-2.1, 1)
    expect(Math.round(solveLinkage(0.058, LOADED_RADIUS).camberChangeDeg)).toBe(-2)
    expect(mm(solveLinkage(0, LOADED_RADIUS).coiloverLength - solveLinkage(peak, LOADED_RADIUS).coiloverLength)).toBe(30)
  })
})
