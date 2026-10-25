import { describe, expect, it } from 'vitest'
import { engineLabConfig } from '@/features/engine-lab/config'
import { getLab, labs } from '@/features/labs/registry'
import { categories, getComponent, getTopic, sceneComponents, topics } from '@/lib/content'
import type { SceneComponent, Topic } from '@/lib/schemas'
import { createLabStore, defineLabConfig } from '@/lib/simulation/labStore'
import { applyLabDeepLink, isLabComponent, labHref, resolveLabDeepLink, type DeepLinkSources } from './labDeepLink'
import { buildLabOverview, getLabOverviews, primaryLesson, sortLabs, systemCategory } from './labOverview'

const engine = getLab('engine')!
const bundled: DeepLinkSources = { getComponent, topics }
const q = (s: string) => new URLSearchParams(s)

describe('resolveLabDeepLink', () => {
  it('accepts a known cue and a component of the lab’s system', () => {
    expect(resolveLabDeepLink(engine, q('cue=exhaust&component=piston'), bundled)).toEqual({ cueId: 'exhaust', componentId: 'piston' })
  })

  it('ignores unknown, blank or missing values', () => {
    expect(resolveLabDeepLink(engine, q('cue=warp&component=flux-capacitor'), bundled)).toEqual({ cueId: null, componentId: null })
    expect(resolveLabDeepLink(engine, q('cue=%20&component='), bundled)).toEqual({ cueId: null, componentId: null })
    expect(resolveLabDeepLink(engine, q(''), bundled)).toEqual({ cueId: null, componentId: null })
  })

  it('trims whitespace around ids', () => {
    expect(resolveLabDeepLink(engine, q('cue=%20power%20'), bundled).cueId).toBe('power')
  })
})

describe('isLabComponent', () => {
  const part = (id: string, systemId: string) => ({ id, systemId }) as SceneComponent
  const parts = new Map([
    ['disc', part('disc', 'braking')],
    ['tyre', part('tyre', 'wheels')],
  ])
  const lab = { id: 'braking', systemId: 'braking', config: defineLabConfig({ id: 'braking' }) }
  const src = (lessons: Pick<Topic, 'labId' | 'componentIds'>[]): DeepLinkSources => ({ getComponent: (id) => parts.get(id), topics: lessons })

  it('accepts parts of the lab’s system', () => {
    expect(isLabComponent(lab, 'disc', src([]))).toBe(true)
  })

  it('accepts other parts only when a lesson embedding the lab names them', () => {
    expect(isLabComponent(lab, 'tyre', src([]))).toBe(false)
    expect(isLabComponent(lab, 'tyre', src([{ labId: 'other', componentIds: ['tyre'] }]))).toBe(false)
    expect(isLabComponent(lab, 'tyre', src([{ labId: 'braking', componentIds: ['tyre'] }]))).toBe(true)
  })

  it('rejects undocumented ids', () => {
    expect(isLabComponent(lab, 'nope', src([{ labId: 'braking', componentIds: ['nope'] }]))).toBe(false)
  })
})

describe('applyLabDeepLink', () => {
  it('seeks the cue (paused) and selects the part without isolating it', () => {
    const store = createLabStore(engineLabConfig, { autoplay: true })
    applyLabDeepLink(store, { cueId: 'exhaust', componentId: 'piston' })
    const s = store.getState()
    expect(s.cue).toBe('exhaust')
    expect(s.progress).toBe(engineLabConfig.cues.find((c) => c.id === 'exhaust')!.progress)
    expect(s.playing).toBe(false)
    expect(s.selectedId).toBe('piston')
    expect(s.isolatedId).toBeNull()
  })

  it('un-hides the part and clears another part’s isolation', () => {
    const store = createLabStore(engineLabConfig)
    store.getState().toggleHidden('piston')
    store.getState().isolate('crankshaft')
    applyLabDeepLink(store, { cueId: null, componentId: 'piston' })
    const s = store.getState()
    expect(s.hidden.piston).toBeUndefined()
    expect(s.isolatedId).toBeNull()
    expect(s.selectedId).toBe('piston')
  })

  it('does nothing for an empty link', () => {
    const store = createLabStore(engineLabConfig, { autoplay: true })
    const before = store.getState()
    applyLabDeepLink(store, { cueId: null, componentId: null })
    expect(store.getState()).toBe(before)
  })
})

describe('labHref', () => {
  it('builds plain and deep-linked lab URLs', () => {
    expect(labHref('engine')).toBe('/labs/engine')
    expect(labHref('engine', { cue: 'spark', component: 'spark-plug' })).toBe('/labs/engine?cue=spark&component=spark-plug')
  })
})

describe('lab overviews', () => {
  it('cover every registered lab in registry order', () => {
    expect(getLabOverviews().map((o) => o.lab.id)).toEqual(sortLabs(labs).map((l) => l.id))
  })

  it('describe the engine lab from content', () => {
    const o = getLabOverviews().find((x) => x.lab.id === 'engine')!
    expect(o.lesson?.id).toBe('four-stroke-cycle')
    expect(o.system?.id).toBe('engine')
    expect(o.parts.length).toBe(sceneComponents.filter((c) => c.systemId === 'engine').length)
    expect(o.parts.length).toBeGreaterThan(0)
    expect(o.lessons.map((t) => t.id)).not.toContain('four-stroke-cycle')
  })

  it('fall back to any lesson embedding the lab when the registry topic is not written', () => {
    const lab = { ...engine, topicId: 'not-written-yet' }
    const embedding = topics.find((t) => t.labId === 'engine')
    expect(primaryLesson(lab, { getTopic, topics })?.id).toBe(embedding?.id)
    const overview = buildLabOverview(lab, { getTopic, categories, topics, components: sceneComponents })
    expect(overview.lesson?.id).toBe(embedding?.id)
  })

  it('map a system id to its first category', () => {
    expect(systemCategory('braking', categories)?.id).toBe('brakes')
    expect(systemCategory('nope', categories)).toBeUndefined()
  })
})
