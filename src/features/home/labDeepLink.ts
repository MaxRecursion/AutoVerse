import type { LabDefinition } from '@/features/labs/types'
import type { SceneComponent, Topic } from '@/lib/schemas'
import type { LabStore } from '@/lib/simulation/labStore'

/**
 * Deep links into a lab page: `/labs/<id>?cue=<cueId>&component=<componentId>`.
 * `cue` seeks the timeline to one of the lab's cues (pausing there);
 * `component` selects and highlights that part without isolating it, so it is
 * seen in context. Unknown ids are ignored, never thrown.
 */
export const LAB_QUERY = { cue: 'cue', component: 'component' } as const

export interface LabDeepLink {
  cueId: string | null
  componentId: string | null
}

export interface DeepLinkSources {
  getComponent: (id: string) => SceneComponent | undefined
  topics: readonly Pick<Topic, 'labId' | 'componentIds'>[]
}

type LabLike = Pick<LabDefinition, 'id' | 'systemId' | 'config'>

/**
 * A component belongs to a lab when it is documented for the lab's vehicle
 * system, or a lesson that embeds the lab names it.
 */
export function isLabComponent(lab: LabLike, componentId: string, src: DeepLinkSources): boolean {
  const component = src.getComponent(componentId)
  if (!component) return false
  return component.systemId === lab.systemId || src.topics.some((t) => t.labId === lab.id && t.componentIds.includes(componentId))
}

const param = (params: URLSearchParams, key: string) => params.get(key)?.trim() || null

/** Validate the query string against the lab's cues and components. */
export function resolveLabDeepLink(lab: LabLike, params: URLSearchParams, src: DeepLinkSources): LabDeepLink {
  const cue = param(params, LAB_QUERY.cue)
  const component = param(params, LAB_QUERY.component)
  return {
    cueId: cue && lab.config.cues.some((c) => c.id === cue) ? cue : null,
    componentId: component && isLabComponent(lab, component, src) ? component : null,
  }
}

/** Apply a resolved deep link to a lab store. Idempotent, so it is safe to re-run. */
export function applyLabDeepLink(store: LabStore, link: LabDeepLink): void {
  if (link.cueId) store.getState().seekCue(link.cueId)
  const id = link.componentId
  if (!id) return
  const s = store.getState()
  // Focus without isolating: make sure the part is visible and nothing else is ghosted, then select it.
  if (s.hidden[id]) s.toggleHidden(id)
  if (s.isolatedId !== null && s.isolatedId !== id) s.isolate(null)
  store.getState().select(id)
}

/** Build a lab URL, optionally deep-linking to a cue and/or component. */
export function labHref(labId: string, opts: { cue?: string; component?: string } = {}): string {
  const q = new URLSearchParams()
  if (opts.cue) q.set(LAB_QUERY.cue, opts.cue)
  if (opts.component) q.set(LAB_QUERY.component, opts.component)
  const search = q.toString()
  return `/labs/${encodeURIComponent(labId)}${search ? `?${search}` : ''}`
}
