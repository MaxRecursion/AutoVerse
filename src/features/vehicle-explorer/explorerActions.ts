/**
 * Explorer actions on the shared lab store (pure: no three.js, no React).
 * The scene, the panel, deep links and the 2D fallback all go through these,
 * so a system choice behaves the same wherever it starts.
 */
import type { LabStore } from '@/lib/simulation/labStore'
import { P, createExplorerStore, readView } from './explorerConfig'
import { modeForSystem } from './explorerVisuals'
import {
  EXPLORER_SYSTEMS,
  availableComponents,
  componentsOfSystem,
  systemOfComponent,
  type ExplorerSystemId,
  type ExplorerTarget,
  type ModelKind,
} from './explorerSystems'
import { CAR_BOX, frameBox, unionBoxes, type Box, type Framing, type Vec3 } from './vehicleLayout'
import { componentBox, componentFocusBox } from './vehicleParts'

/** Focus a system (or the whole car with null). Leaves a component selection only if it belongs to the system. */
export function chooseSystem(store: LabStore, systemId: ExplorerSystemId | null) {
  const s = store.getState()
  const view = readView(s.params)
  if (view.system !== systemId) s.setParam(P.system, systemId ?? '')
  const mode = modeForSystem(view.mode, systemId)
  if (mode !== view.mode) s.setParam(P.mode, mode)
  const selected = store.getState().selectedId
  if (selected && (!systemId || systemOfComponent(selected) !== systemId)) store.getState().select(null)
}

/** Select one component (and its system), or clear the component selection. */
export function chooseComponent(store: LabStore, componentId: string | null) {
  if (!componentId) {
    store.getState().select(null)
    return
  }
  const system = systemOfComponent(componentId)
  if (!system) return
  chooseSystem(store, system)
  store.getState().select(componentId)
}

/** Apply a resolved deep-link target. */
export function applyTarget(store: LabStore, target: ExplorerTarget) {
  if (target.componentId) chooseComponent(store, target.componentId)
  else chooseSystem(store, target.systemId)
}

/** The explorer target currently shown (inverse of applyTarget). */
export function currentTarget(store: LabStore): ExplorerTarget {
  const s = store.getState()
  const system = readView(s.params).system
  const componentId = s.selectedId && systemOfComponent(s.selectedId) ? s.selectedId : null
  return { systemId: componentId ? systemOfComponent(componentId) : system, componentId }
}

/**
 * A store whose clicks in the scene (Part sets `selectedId` directly) also
 * focus the clicked component's system.
 */
export function createVehicleExplorerStore(): LabStore {
  const store = createExplorerStore()
  store.subscribe((s, prev) => {
    if (s.selectedId === prev.selectedId || !s.selectedId) return
    const system = systemOfComponent(s.selectedId)
    if (system && readView(s.params).system !== system) chooseSystem(store, system)
  })
  return store
}

/** Components of a system that the loaded model actually shows, in display order. */
export function visibleComponents(systemId: ExplorerSystemId, model: ModelKind): string[] {
  const available = availableComponents(model)
  return componentsOfSystem(systemId).filter((id) => available.has(id))
}

/* ------------------------------------------------------------------------ */
/* Camera framing                                                            */
/* ------------------------------------------------------------------------ */

export const CAMERA_FOV = 38
/**
 * Framing margins (1 = box corners exactly on the frame edge). The car's
 * bounding box is roomier than its tapered body, so the whole-car view may
 * let empty box corners fall just outside.
 */
const MARGIN = { overview: 0.94, system: 1.1, component: 1.35 } as const

/** Whole-car view: from the front-left, a little above. */
export const OVERVIEW_DIRECTION: Vec3 = [1, 0.5, 1.15]

export function systemBox(systemId: ExplorerSystemId): Box | null {
  return unionBoxes(componentsOfSystem(systemId).flatMap((id) => componentBox(id) ?? []))
}

/**
 * The box the camera frames for a system. A system spread along most of the
 * car (brakes, suspension, exhaust) is framed with the car's full length, so
 * the view never crops the nose or tail just short of the subject.
 */
export function systemFramingBox(systemId: ExplorerSystemId): Box | null {
  const box = systemBox(systemId)
  if (!box) return null
  const carLength = CAR_BOX.max[2] - CAR_BOX.min[2]
  if (box.max[2] - box.min[2] < 0.6 * carLength) return box
  return { min: [box.min[0], box.min[1], CAR_BOX.min[2]], max: [box.max[0], box.max[1], CAR_BOX.max[2]] }
}

/** Where the camera goes for a target, given the canvas aspect ratio. */
export function framingFor(target: ExplorerTarget, aspect: number): Framing {
  const system = target.systemId ? EXPLORER_SYSTEMS.find((s) => s.id === target.systemId) : undefined
  if (target.componentId) {
    const box = componentFocusBox(target.componentId)
    const owner = EXPLORER_SYSTEMS.find((s) => s.id === systemOfComponent(target.componentId!))
    if (box) return frameBox(box, owner?.view ?? OVERVIEW_DIRECTION, CAMERA_FOV, aspect, MARGIN.component, 1.4)
  }
  if (system) {
    const box = systemFramingBox(system.id)
    if (box) return frameBox(box, system.view, CAMERA_FOV, aspect, MARGIN.system, 1.8)
  }
  return frameBox(CAR_BOX, OVERVIEW_DIRECTION, CAMERA_FOV, aspect, MARGIN.overview)
}
