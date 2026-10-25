/**
 * How each explorer part looks for a given view (pure, unit-tested). The
 * scene applies the result to the part's cloned materials; nothing here
 * touches three.js.
 */
import type { ViewMode, ExplorerView } from './explorerConfig'
import type { ExplorerSystemId } from './explorerSystems'

/** Body components that hide the systems inside: faded by the slider and ghosted in cutaway. */
export const COVER_COMPONENTS: ReadonlySet<string> = new Set([
  'body-shell',
  'front-clamshell',
  'rear-clamshell',
  'side-doors',
  'windscreen',
  'cabin-interior',
])

export const GHOST_OPACITY = 0.07
const CUTAWAY_MAX = 0.16
const CUTAWAY_MIN = 0.04
/** At full fade the body keeps a faint outline so the car still reads as a car. */
const FADE_FLOOR = 0.06

export type Glow = 'selected' | 'hover' | 'system' | null

export const GLOW_INTENSITY: Readonly<Record<Exclude<Glow, null>, number>> = {
  selected: 0.6,
  hover: 0.4,
  system: 0.18,
}

export interface PartLook {
  opacity: number
  glow: Glow
}

export interface LookInput {
  componentId: string
  systemId: ExplorerSystemId
  view: Pick<ExplorerView, 'mode' | 'system' | 'bodyFade'>
  selectedId: string | null
  hoveredId: string | null
}

/** Opacity of the covering body for a mode and fade (before system focus). */
export function coverOpacity(mode: ViewMode, bodyFade: number): number {
  const f = Math.min(1, Math.max(0, bodyFade))
  if (mode === 'exterior') return 1 - (1 - FADE_FLOOR) * f
  return CUTAWAY_MAX + (CUTAWAY_MIN - CUTAWAY_MAX) * f
}

export function partLook({ componentId, systemId, view, selectedId, hoveredId }: LookInput): PartLook {
  const cover = COVER_COMPONENTS.has(componentId)
  const inSystem = view.system === systemId
  let opacity = 1
  if (view.mode === 'focus' && view.system) {
    // Only the chosen system stays solid.
    opacity = inSystem ? 1 : cover ? Math.min(GHOST_OPACITY, coverOpacity('cutaway', view.bodyFade)) : GHOST_OPACITY
  } else if (cover) {
    // Focus without a system behaves like cutaway until one is chosen.
    opacity = coverOpacity(view.mode === 'focus' ? 'cutaway' : view.mode, view.bodyFade)
  }
  const glow: Glow = selectedId === componentId ? 'selected' : hoveredId === componentId ? 'hover' : inSystem ? 'system' : null
  return { opacity, glow }
}

/**
 * Choosing a system whose parts sit inside the body switches the Exterior
 * view to Cutaway so they can be seen; other modes are kept.
 */
export function modeForSystem(mode: ViewMode, system: ExplorerSystemId | null): ViewMode {
  if (mode === 'exterior' && system && system !== 'body') return 'cutaway'
  return mode
}

/** Smoothly approach a target fraction (frame-rate independent); snaps when close. */
export function approach(current: number, target: number, dt: number, rate = 6): number {
  const next = current + (target - current) * (1 - Math.exp(-dt * rate))
  return Math.abs(target - next) < 1e-3 ? target : next
}

/** Ease for hinge motion: panels accelerate away and settle gently. */
export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)
