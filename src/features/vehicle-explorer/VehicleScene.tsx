/**
 * Vehicle explorer — 3D scene. The car body comes from the licence-verified
 * Car Concept GLB (with Kenney and procedural fallbacks, see VehicleModels);
 * every system the model lacks is an original procedural module from
 * vehicleParts.ts. Nothing animates on a timeline: the only motion is the
 * hinged panels easing towards the open / closed param, and camera moves.
 */
import { useEffect, useMemo, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { useLab, useLabStoreApi } from '@/components/three/LabContext'
import { useHtmlLayer } from '@/components/three/htmlLayer'
import type { QualityTier } from '@/hooks/useQualityTier'
import type { LabStore } from '@/lib/simulation/labStore'
import { cn } from '@/lib/utils'
import { chooseSystem, currentTarget, framingFor } from './explorerActions'
import { P } from './explorerConfig'
import { EXPLORER_SYSTEMS, type ExplorerSystemId, type ModelKind } from './explorerSystems'
import { ProceduralModules } from './ProceduralModules'
import { VehicleModel } from './VehicleModels'
import { ExplorerSceneOptionsContext } from './sceneOptions'
import { PROCEDURAL_SHAPES, SYSTEM_HOTSPOTS } from './vehicleParts'

/** Move the camera onto the store's current target, for the canvas's current aspect ratio. */
function frameCurrent(store: LabStore, aspect: number) {
  const camera = store.getState().camera
  if (!camera?.lookAt) return
  const f = framingFor(currentTarget(store), aspect)
  camera.lookAt(f.position, f.target)
}

/**
 * Frames the focused component / system / whole car whenever the focus
 * changes, and again when the canvas changes shape (phone sheet opened,
 * device rotated) so the framed subject stays in view.
 */
function CameraRig() {
  const store = useLabStoreApi()
  // Read the canvas size when framing (not on every render).
  const getThree = useThree((s) => s.get)
  const width = useThree((s) => s.size.width)
  const height = useThree((s) => s.size.height)
  const sized = useRef(false)

  useEffect(() => {
    const key = () => {
      const t = currentTarget(store)
      return `${t.systemId ?? ''}|${t.componentId ?? ''}`
    }
    const frame = () => {
      const { width: w, height: h } = getThree().size
      frameCurrent(store, w / Math.max(1, h))
    }
    let last = key()
    // A deep link may have chosen a target before the camera registered.
    if (last !== '|' && store.getState().camera) frame()
    return store.subscribe((s, prev) => {
      const next = key()
      if (next !== last || (s.camera && !prev.camera && next !== '|')) {
        last = next
        frame()
      }
    })
  }, [store, getThree])

  useEffect(() => {
    // The first size is the one the opening shot was framed for.
    if (!sized.current) {
      sized.current = true
      return
    }
    if (width > 0 && height > 0) frameCurrent(store, width / height)
  }, [store, width, height])
  return null
}

function Hotspot({
  id,
  position,
  label,
  compact,
  hidden,
}: {
  id: ExplorerSystemId
  position: [number, number, number]
  label: string
  /** Hidden markers stay mounted (cheaper than re-creating each <Html> root on every system change). */
  hidden: boolean
  /** Phones: a dot only (names would overlap); the name shows as a tooltip and in the sheet. */
  compact: boolean
}) {
  const store = useLabStoreApi()
  const portal = useHtmlLayer()
  return (
    <Html portal={portal} position={position} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
      {/* The DOM system list is the keyboard / screen-reader path; hotspots are a pointer shortcut. */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        title={compact ? label : undefined}
        onClick={() => chooseSystem(store, id)}
        className={cn(
          'relative hit-area group pointer-events-auto flex min-h-9 items-center rounded-full border border-white/15 bg-graphite-950/75 backdrop-blur-sm transition-colors hover:border-cyan/60 hover:text-paper',
          compact ? 'size-9 justify-center border-transparent bg-transparent backdrop-blur-none' : 'gap-1.5 py-1 pl-1.5 pr-2.5 font-mono text-[10px] uppercase tracking-wider text-steel-300',
          hidden && 'invisible',
        )}
      >
        <span className="relative flex size-2.5 items-center justify-center">
          <span className="absolute size-2.5 rounded-full bg-cyan/30 motion-safe:animate-ping" />
          <span className="size-1.5 rounded-full bg-cyan" />
        </span>
        {!compact && label}
      </button>
    </Html>
  )
}

function Hotspots({ compact }: { compact: boolean }) {
  const visible = useLab((s) => s.showLabels && !s.params[P.system])
  return (
    <>
      {EXPLORER_SYSTEMS.map((sys) => (
        <Hotspot key={sys.id} id={sys.id} position={SYSTEM_HOTSPOTS[sys.id]} label={sys.short} compact={compact} hidden={!visible} />
      ))}
    </>
  )
}

export function VehicleScene({
  tier,
  forceModel,
  compactHotspots = false,
}: {
  tier: QualityTier
  forceModel?: ModelKind
  compactHotspots?: boolean
}) {
  const detail = tier === 'low' ? 'low' : 'high'
  const options = useMemo(() => ({ compact: compactHotspots }), [compactHotspots])
  return (
    <ExplorerSceneOptionsContext.Provider value={options}>
      <VehicleModel detail={detail} forceModel={forceModel} />
      <ProceduralModules source={PROCEDURAL_SHAPES} detail={detail} />
      <Hotspots compact={compactHotspots} />
      <CameraRig />
    </ExplorerSceneOptionsContext.Provider>
  )
}
