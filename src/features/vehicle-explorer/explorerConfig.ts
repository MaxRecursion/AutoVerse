import { createLabStore, defineLabConfig, type LabParamValue, type LabState, type LabStore } from '@/lib/simulation/labStore'
import { isExplorerSystemId, type ExplorerSystemId, type ModelKind } from './explorerSystems'

/**
 * Vehicle explorer store (pure — no three.js). The explorer has no timeline:
 * everything it shows is a pure function of these params plus the shared
 * selection state (`selectedId` = selected component, `hoveredId`).
 */

export const VIEW_MODES = ['exterior', 'cutaway', 'focus'] as const
export type ViewMode = (typeof VIEW_MODES)[number]

export const VIEW_MODE_LABEL: Readonly<Record<ViewMode, string>> = {
  exterior: 'Exterior',
  cutaway: 'Cutaway',
  focus: 'System focus',
}

export const VIEW_MODE_HINT: Readonly<Record<ViewMode, string>> = {
  exterior: 'The complete car as you would see it.',
  cutaway: 'Body panels ghosted so the systems inside show through.',
  focus: 'Only the chosen system is solid; everything else is ghosted.',
}

export const isViewMode = (v: unknown): v is ViewMode => typeof v === 'string' && (VIEW_MODES as readonly string[]).includes(v)

/** Param keys (all values are LabParamValue). */
export const P = {
  mode: 'mode',
  /** Selected system id, or '' for the whole vehicle. */
  system: 'system',
  /** Body fade 0 (solid) … 1 (almost invisible). */
  bodyFade: 'bodyFade',
  /** Doors and clamshells open. */
  open: 'open',
  /** Which vehicle model actually rendered (set by the scene). */
  model: 'model',
  /** True once a vehicle model (or the 2D fallback) is on screen. */
  ready: 'ready',
} as const

export const explorerConfig = defineLabConfig({
  id: 'vehicle',
  timeline: false,
  loop: false,
  cues: [],
  initialParams: {
    [P.mode]: 'exterior',
    [P.system]: '',
    [P.bodyFade]: 0,
    [P.open]: false,
    [P.model]: 'carconcept',
    [P.ready]: false,
  },
})

export interface ExplorerView {
  mode: ViewMode
  system: ExplorerSystemId | null
  bodyFade: number
  open: boolean
  model: ModelKind
}

const MODEL_KINDS: readonly ModelKind[] = ['carconcept', 'kenney', 'procedural']

/** Typed view of the explorer params (tolerates missing / malformed values). */
export function readView(params: Record<string, LabParamValue>): ExplorerView {
  const mode = params[P.mode]
  const system = params[P.system]
  const fade = Number(params[P.bodyFade])
  const model = params[P.model]
  return {
    mode: isViewMode(mode) ? mode : 'exterior',
    system: isExplorerSystemId(system) ? system : null,
    bodyFade: Number.isFinite(fade) ? Math.min(1, Math.max(0, fade)) : 0,
    open: params[P.open] === true,
    model: MODEL_KINDS.includes(model as ModelKind) ? (model as ModelKind) : 'carconcept',
  }
}

export const selectView = (s: LabState): ExplorerView => readView(s.params)

/** A fresh explorer store; part names (hotspots / labels) are on by default. */
export function createExplorerStore(): LabStore {
  const store = createLabStore(explorerConfig)
  store.setState({ showLabels: true })
  return store
}
