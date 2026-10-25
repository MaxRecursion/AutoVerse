import { useStore } from 'zustand'
import type { Step } from '@/lib/schemas'
import { createLabStore, defineLabConfig, type LabCue, type LabState, type LabStore } from '@/lib/simulation/labStore'

/** Inert store used when a lesson has no lab, so hooks can be called unconditionally. */
const NO_LAB: LabStore = createLabStore(defineLabConfig({ id: 'no-lab', timeline: false }))

/** Subscribe to a slice of an optional lab store (null → the inert store's value). */
export function useOptionalLab<T>(store: LabStore | null, selector: (s: LabState) => T): T {
  return useStore(store ?? NO_LAB, selector)
}

/** Whether the lab defines a cue with this id (lesson steps only offer "Show in 3D" for real cues). */
export function labHasCue(store: LabStore | null, cueId: string | undefined): boolean {
  return !!store && !!cueId && store.getState().config.cues.some((c) => c.id === cueId)
}

const SAME_POSITION = 1e-6

/**
 * Whether the lab is resting on exactly this cue: paused on its timeline
 * position (after "Show in 3D", stepping or scrubbing onto it) and/or with its
 * parameter values applied (param-driven labs).
 */
function restsOnCue(s: LabState, cue: LabCue): boolean {
  if (cue.progress === undefined && !cue.params) return false
  if (cue.progress !== undefined && (s.playing || Math.abs(s.progress - cue.progress) > SAME_POSITION)) return false
  return Object.entries(cue.params ?? {}).every(([key, value]) => s.params[key] === value)
}

/**
 * The lesson step that matches what the 3D scene shows right now.
 *
 * A step whose cue the lab is resting on wins — so "Show in 3D" on an event
 * step (e.g. "Spark", which happens inside the compression stroke) highlights
 * that step rather than the enclosing stroke. Otherwise the step naming the
 * live cue (`state.cue`, derived by the lab while it plays) is active.
 */
export function selectActiveStepId(steps: readonly Pick<Step, 'id' | 'cue'>[], s: LabState): string | null {
  for (const step of steps) {
    const cue = step.cue ? s.config.cues.find((c) => c.id === step.cue) : undefined
    if (cue && restsOnCue(s, cue)) return step.id
  }
  if (!s.cue) return null
  return steps.find((step) => step.cue === s.cue)?.id ?? null
}

/** Header (56px) + lesson bar (48px) + breathing room, in px. */
export const STICKY_OFFSET = 112

/** Scroll an element into view below the sticky bars unless it is already fully visible. */
export function revealElement(el: HTMLElement | null, reducedMotion: boolean): void {
  if (!el) return
  const rect = el.getBoundingClientRect()
  const fullyVisible = rect.top >= STICKY_OFFSET - 8 && rect.bottom <= window.innerHeight
  if (fullyVisible) return
  el.scrollIntoView?.({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' })
}
