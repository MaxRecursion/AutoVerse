import { describe, expect, it } from 'vitest'
import { BRAKE_PART_IDS } from '@/features/braking-lab/brakeParts'
import { ENGINE_PART_IDS } from '@/features/engine-lab/engineParts'
import { SUSPENSION_PART_IDS } from '@/features/suspension-lab/suspensionParts'
import { TRANSMISSION_PART_IDS } from '@/features/transmission-lab/transmissionParts'
import { getComponent, getTopic, topics } from '@/lib/content'
import { getLab, labs } from './registry'

// Cross-feature contracts between lesson content and the lab registry (content validation checks ids, not cues).
describe('lab registry ↔ lesson content', () => {
  it('has unique lab ids', () => {
    expect(new Set(labs.map((l) => l.id)).size).toBe(labs.length)
  })

  it('every lesson step cue exists in its lesson’s lab config', () => {
    const problems: string[] = []
    for (const t of topics) {
      const lab = t.labId ? getLab(t.labId) : undefined
      if (t.labId && !lab) problems.push(`${t.id}: unknown lab "${t.labId}"`)
      for (const s of t.steps) {
        if (!s.cue) continue
        if (!lab) problems.push(`${t.id}/${s.id}: cue "${s.cue}" but the lesson has no lab`)
        else if (!lab.config.cues.some((c) => c.id === s.cue)) problems.push(`${t.id}/${s.id}: cue "${s.cue}" not in lab "${lab.id}"`)
      }
    }
    expect(problems).toEqual([])
  })

  it('every engine scene part is a documented component', () => {
    expect(ENGINE_PART_IDS.filter((id) => !getComponent(id))).toEqual([])
  })

  it('every lab’s parts are documented components of that lab’s system', () => {
    const parts: Record<string, readonly string[]> = {
      engine: ENGINE_PART_IDS,
      transmission: TRANSMISSION_PART_IDS,
      braking: BRAKE_PART_IDS,
      suspension: SUSPENSION_PART_IDS,
    }
    expect(Object.keys(parts).sort()).toEqual(labs.map((l) => l.id).sort())
    const problems: string[] = []
    for (const lab of labs)
      for (const id of parts[lab.id] ?? []) {
        const c = getComponent(id)
        if (!c) problems.push(`${lab.id}: unknown component "${id}"`)
        else if (c.systemId !== lab.systemId) problems.push(`${lab.id}: "${id}" belongs to "${c.systemId}"`)
      }
    expect(problems).toEqual([])
  })

  it('every lab names an existing lesson that embeds it, and has unique cue ids', () => {
    for (const lab of labs) {
      expect(getTopic(lab.topicId), `${lab.id} → ${lab.topicId}`).toBeDefined()
      expect(getTopic(lab.topicId)?.labId, lab.id).toBe(lab.id)
      const ids = lab.config.cues.map((c) => c.id)
      expect(new Set(ids).size, lab.id).toBe(ids.length)
    }
  })

  it('every registered lab loads a view component', async () => {
    for (const lab of labs) {
      const mod = await lab.load()
      expect(mod.default, lab.id).toBeTypeOf('function')
    }
  }, 30_000)
})
