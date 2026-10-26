/**
 * /explore — the complete car in 3D. One explorer store drives the scene, the
 * system panel (side panel on wide screens, bottom sheet on phones), the 2D
 * fallback and the URL (`?system=` / `?component=`), so every way of choosing
 * a system lands in the same state.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Network } from 'lucide-react'
import { LabStoreContext, useLab } from '@/components/three/LabContext'
import { SceneCanvas } from '@/components/three/SceneCanvas'
import { useMediaQuery, usePrefersReducedMotion } from '@/hooks/useMediaQuery'
import { useQualityTier, type QualityTier } from '@/hooks/useQualityTier'
import { getComponent } from '@/lib/content'
import type { LabStore } from '@/lib/simulation/labStore'
import { CAMERA_FOV, applyTarget, createVehicleExplorerStore, currentTarget, framingFor, visibleComponents } from './explorerActions'
import { P, readView } from './explorerConfig'
import { sameTarget, searchForTarget, targetFromSearch } from './explorerDeepLink'
import { BodyFadeControl, SceneTools, ViewModeSwitch } from './ExplorerControls'
import { ExplorerFallback } from './ExplorerFallback'
import { ExplorerPanel } from './ExplorerPanel'
import { ExplorerTextAlternative } from './ExplorerTextAlternative'
import { getExplorerSystem, type ModelKind } from './explorerSystems'
import type { Framing } from './vehicleLayout'
import { MobileSheet } from './MobileSheet'
import { VehicleScene } from './VehicleScene'

const contentSystemOf = (componentId: string) => getComponent(componentId)?.systemId

const SCENE_LABEL =
  'Interactive 3D model of a complete car. Choose a system to highlight all of its parts and frame them; drag to orbit, scroll or pinch to zoom, and select a part to read what it does. ' +
  'A text version of every system follows the explorer.'

/** `?model=kenney|procedural` forces a fallback model (for checking the fallback chain). */
const forcedModel = (v: string | null): ModelKind | undefined => (v === 'kenney' || v === 'procedural' ? v : undefined)

/** Keeps `?system=` / `?component=` and the store in step (both directions, never looping). */
function useUrlSync(store: LabStore) {
  const [params, setParams] = useSearchParams()

  // URL → store (back / forward, links on this page).
  useEffect(() => {
    const target = targetFromSearch(params, contentSystemOf)
    if (!sameTarget(target, currentTarget(store))) applyTarget(store, target)
  }, [params, store])

  // Store → URL (choices in the scene, panel or fallback), replacing history.
  useEffect(() => {
    let last = currentTarget(store)
    return store.subscribe(() => {
      const next = currentTarget(store)
      if (sameTarget(next, last)) return
      last = next
      setParams((prev) => {
        const wanted = searchForTarget(prev, next)
        return wanted.toString() === prev.toString() ? prev : wanted
      }, { replace: true, preventScrollReset: true })
    })
  }, [store, setParams])
}

/** Measures the canvas box once so the opening shot frames the whole car for this aspect ratio. */
function ExplorerCanvas({ tier, forceModel, compact }: { tier: QualityTier; forceModel?: ModelKind; compact: boolean }) {
  const [initial, setInitial] = useState<Framing | null>(null)
  const measure = useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    const aspect = el.clientWidth > 0 && el.clientHeight > 0 ? el.clientWidth / el.clientHeight : 1.5
    setInitial((prev) => prev ?? framingFor({ systemId: null, componentId: null }, aspect))
  }, [])

  // The car counts as ready once a model (or a fallback) is in place; SceneCanvas shows its loading overlay until then.
  const ready = useLab((s) => s.params[P.ready] === true)

  return (
    <div ref={measure} className="absolute inset-0">
      {initial && (
        <SceneCanvas
          label={SCENE_LABEL}
          loadingLabel="Preparing the 3D car…"
          ready={ready}
          fallback={<ExplorerFallback />}
          cameraPosition={initial.position}
          target={initial.target}
          fov={CAMERA_FOV}
          minDistance={1.1}
          maxDistance={14}
          floorY={0}
        >
          <VehicleScene tier={tier} forceModel={forceModel} compactHotspots={compact} />
        </SceneCanvas>
      )}
    </div>
  )
}

/** Polite screen-reader note when the focused system changes (scene clicks included). */
function SystemAnnouncer() {
  const system = useLab((s) => readView(s.params).system)
  const model = useLab((s) => readView(s.params).model)
  const text = system
    ? `${getExplorerSystem(system).name}: ${visibleComponents(system, model).length} parts highlighted.`
    : 'Whole vehicle shown.'
  return (
    <p className="sr-only" aria-live="polite">
      {text}
    </p>
  )
}

export function ExplorerView() {
  const [params] = useSearchParams()
  const [store] = useState(() => {
    const s = createVehicleExplorerStore()
    // Apply the deep link before the first render, so the panel opens on it.
    applyTarget(s, targetFromSearch(params, contentSystemOf))
    return s
  })
  useUrlSync(store)

  const wide = useMediaQuery('(min-width: 1024px)')
  const phone = useMediaQuery('(max-width: 767px)')
  const deviceTier = useQualityTier()
  // Phones get the simplified scene (lower tessellation; SceneCanvas lowers the pixel ratio for the low tier).
  const tier: QualityTier = phone ? 'low' : deviceTier
  const forceModel = forcedModel(params.get('model'))
  const reducedMotion = usePrefersReducedMotion()
  const sceneRef = useRef<HTMLElement>(null)
  const showScene = useCallback(() => {
    sceneRef.current?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' })
    sceneRef.current?.focus({ preventScroll: true })
  }, [reducedMotion])

  return (
    <LabStoreContext.Provider value={store}>
      <div className="mx-auto max-w-[1600px] lg:px-6 lg:pt-4">
        <header className="flex items-center justify-between gap-3 px-4 py-2.5 lg:px-0 lg:pb-3 lg:pt-0">
          <div className="min-w-0">
            <p className="eyebrow max-lg:hidden">Vehicle explorer</p>
            <h1 className="truncate font-display text-lg font-semibold text-paper lg:mt-1 lg:text-2xl">Explore the whole car</h1>
          </div>
          <Link
            to="/map"
            className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md border border-white/10 px-2.5 text-xs text-steel-300 transition-colors hover:border-cyan/50 hover:text-paper focus-visible:outline-2 focus-visible:outline-cyan"
          >
            <Network aria-hidden className="size-4" />
            <span className="max-sm:hidden">How the systems connect</span>
            <span className="sm:hidden">System map</span>
          </Link>
        </header>

        <div
          className={
            wide
              ? 'grid h-[calc(100dvh-9rem-env(safe-area-inset-top))] min-h-[560px] grid-cols-[minmax(0,1fr)_minmax(340px,400px)] gap-3'
              : 'flex h-[calc(100dvh-6.75rem-env(safe-area-inset-top))] min-h-[520px] flex-col'
          }
        >
          <section
            ref={sceneRef}
            tabIndex={-1}
            aria-label="3D vehicle explorer"
            className={
              wide
                ? 'relative isolate overflow-hidden rounded-xl border border-white/[0.07] bg-graphite-950 bg-blueprint outline-none'
                : 'relative isolate min-h-0 flex-1 overflow-hidden bg-graphite-950 bg-blueprint outline-none'
            }
          >
            <ExplorerCanvas tier={tier} forceModel={forceModel} compact={phone} />
            {/* z-30: above in-scene labels and hotspots (drei <Html>, z-index ≤ 20). */}
            <div className="pointer-events-none absolute inset-x-3 top-3 z-30 flex items-start justify-between gap-2">
              <ViewModeSwitch className="pointer-events-auto" />
              <SceneTools className="pointer-events-auto" />
            </div>
            {wide && (
              <div className="panel absolute bottom-3 left-3 z-30 w-72 px-3 py-1">
                <BodyFadeControl />
              </div>
            )}
          </section>

          {wide ? (
            <aside aria-label="Vehicle systems" className="panel flex min-h-0 flex-col overflow-hidden">
              <ExplorerPanel className="min-h-0 flex-1" />
            </aside>
          ) : (
            <MobileSheet />
          )}
        </div>
        <SystemAnnouncer />
      </div>
      <ExplorerTextAlternative onFocusSystem={showScene} />
    </LabStoreContext.Provider>
  )
}
