import { Component, Suspense, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Canvas, useFrame, useThree, type RootState } from '@react-three/fiber'
import { CameraControls, ContactShadows, Environment, Lightformer } from '@react-three/drei'
import { HtmlLayerContext } from './htmlLayer'
import { useOptionalLabStoreApi, LabStoreContext } from './LabContext'
import { SceneLoadingFallback } from './SceneLoadingFallback'
import { useQualityTier } from '@/hooks/useQualityTier'
import { hasWebGL } from '@/lib/webgl'
import { useRafClock } from '@/lib/simulation/useRafClock'
import { cn } from '@/lib/utils'

type Vec3 = [number, number, number]

export interface SceneCanvasProps {
  children: ReactNode
  /** Rendered instead of the canvas when WebGL is unavailable or the scene crashes. */
  fallback: ReactNode
  cameraPosition?: Vec3
  target?: Vec3
  fov?: number
  minDistance?: number
  maxDistance?: number
  /** Y of the soft contact shadow; null disables it. */
  floorY?: number | null
  className?: string
  /** Accessible description of what the scene shows. */
  label: string
  /**
   * `orbit` (default): drag to orbit, wheel / pinch to zoom.
   * `none`: fixed camera — the page keeps its scroll and touch gestures
   * (e.g. a homepage hero); parts can still be clicked.
   */
  controls?: 'orbit' | 'none'
  /**
   * Text of the in-scene loading overlay, shown until the scene has rendered
   * its first frames (and while drei loaders report progress). Default
   * "Preparing 3D scene…".
   */
  loadingLabel?: string
  /**
   * Optional extra readiness signal (e.g. a model placed by the scene). While
   * `false`, the loading overlay stays up even after the first frames.
   */
  ready?: boolean
  /** Called once the WebGL renderer exists, with the canvas size, camera and renderer. */
  onCreated?: (state: RootState) => void
}

/**
 * Shared R3F canvas: studio lighting (procedural environment, no network),
 * camera controls with a registered reset, simulation clock, loading
 * progress, WebGL detection and an error boundary with a non-3D fallback.
 */
export function SceneCanvas({
  children,
  fallback,
  cameraPosition = [4, 3, 6],
  target = [0, 0, 0],
  fov = 38,
  minDistance = 1.5,
  maxDistance = 20,
  floorY = -1.5,
  className,
  label,
  controls = 'orbit',
  loadingLabel = 'Preparing 3D scene…',
  ready = true,
  onCreated,
}: SceneCanvasProps) {
  const store = useOptionalLabStoreApi()
  const tier = useQualityTier()
  // False until the scene's Suspense content has resolved and drawn its first frames.
  const [drawn, setDrawn] = useState(false)
  // Fixed DOM target for in-scene HTML (part labels, hotspots); see htmlLayer.ts.
  const htmlLayer = useRef<HTMLDivElement>(null)
  // The fallback has no render loop of its own; keep the lab's timeline running for it.
  const fallbackWithClock = (
    <>
      {fallback}
      <FallbackClock />
    </>
  )

  if (!hasWebGL()) return fallbackWithClock

  return (
    <SceneErrorBoundary fallback={fallbackWithClock}>
      <div className={cn('relative h-full w-full', className)} role="img" aria-label={label}>
        {/* Before the Canvas, so its ref is attached before the scene (and its labels) first render; z-[1] draws it above the canvas. */}
        <div ref={htmlLayer} className="pointer-events-none absolute inset-0 z-[1] overflow-hidden" data-testid="scene-html-layer" />
        <Canvas
          dpr={tier === 'low' ? [1, 1.25] : [1, 2]}
          camera={{ position: cameraPosition, fov, near: 0.05, far: 200 }}
          gl={{ antialias: tier !== 'low', powerPreference: 'high-performance' }}
          onPointerMissed={() => store?.getState().select(null)}
          onCreated={onCreated}
        >
          {/* Re-provide the lab store: context does not cross the R3F reconciler boundary by default in all setups. */}
          <LabStoreContext.Provider value={store}>
            <HtmlLayerContext.Provider value={htmlLayer}>
              <StudioLights lowQuality={tier === 'low'} />
              <Suspense fallback={null}>
                {children}
                {/* Mounts with the children (same boundary), so it only counts frames once they are in the scene. */}
                <FirstFrames onDrawn={() => setDrawn(true)} />
              </Suspense>
              {floorY !== null && (
                <ContactShadows position={[0, floorY, 0]} opacity={0.45} scale={14} blur={2.4} far={4} resolution={tier === 'low' ? 256 : 512} />
              )}
              {controls === 'orbit' ? (
                <Controls position={cameraPosition} target={target} minDistance={minDistance} maxDistance={maxDistance} />
              ) : (
                <FixedCamera position={cameraPosition} target={target} />
              )}
              {store && <SimulationClock />}
            </HtmlLayerContext.Provider>
          </LabStoreContext.Provider>
        </Canvas>
        <SceneLoadingFallback pending={!drawn || !ready} label={loadingLabel} />
      </div>
    </SceneErrorBoundary>
  )
}

function StudioLights({ lowQuality }: { lowQuality: boolean }) {
  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight position={[5, 8, 5]} intensity={1.6} />
      <directionalLight position={[-6, 3, -4]} intensity={0.6} color="#9fd8ff" />
      <Environment resolution={lowQuality ? 64 : 256} frames={1}>
        <Lightformer intensity={2} position={[0, 5, -6]} scale={[10, 3, 1]} />
        <Lightformer intensity={1.2} position={[-6, 2, 2]} rotation={[0, Math.PI / 2, 0]} scale={[8, 2, 1]} />
        <Lightformer intensity={0.8} color="#f6a63a" position={[6, 1, 2]} rotation={[0, -Math.PI / 2, 0]} scale={[6, 1, 1]} />
      </Environment>
    </>
  )
}

function Controls({ position, target, minDistance, maxDistance }: { position: Vec3; target: Vec3; minDistance: number; maxDistance: number }) {
  const ref = useRef<CameraControls>(null)
  const store = useOptionalLabStoreApi()
  useEffect(() => {
    const cc = ref.current
    if (!cc) return
    cc.setLookAt(...position, ...target, false)
    cc.saveState()
    if (!store) return
    // "Reset camera" returns to the saved initial view until a lab moves its home (e.g. after refitting to a resize).
    let home: { position: Vec3; target: Vec3 } | null = null
    store.getState().registerCamera({
      reset: () => void (home ? cc.setLookAt(...home.position, ...home.target, true) : cc.reset(true)),
      lookAt: (p, t) => void cc.setLookAt(...p, ...t, true),
      setHome: (p, t) => {
        home = { position: [...p], target: [...t] }
      },
    })
    return () => store.getState().registerCamera(null)
    // Initial framing only; later prop changes must not yank the user's camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store])
  return <CameraControls ref={ref} makeDefault minDistance={minDistance} maxDistance={maxDistance} smoothTime={0.35} />
}

/** Static framing for `controls="none"`: aims the default camera once (no orbit, no wheel / touch capture). */
function FixedCamera({ position, target }: { position: Vec3; target: Vec3 }) {
  const camera = useThree((s) => s.camera)
  const invalidate = useThree((s) => s.invalidate)
  useLayoutEffect(() => {
    camera.position.set(...position)
    camera.lookAt(...target)
    camera.updateMatrixWorld()
    invalidate()
    // Initial framing only, like <Controls>.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera])
  return null
}

/** Number of rendered frames after which the scene counts as drawn (the first can be a blank shader-compile frame). */
const FRAMES_TO_DRAWN = 2

/** Reports once the scene content has rendered its first frames (hides the loading overlay). */
function FirstFrames({ onDrawn }: { onDrawn: () => void }) {
  const frames = useRef(0)
  useFrame(() => {
    if (frames.current > FRAMES_TO_DRAWN) return
    frames.current += 1
    if (frames.current > FRAMES_TO_DRAWN) onDrawn()
  })
  return null
}

/** Advances the lab's simulation time from the render loop (no React re-render per frame except subscribers). */
function SimulationClock() {
  const store = useOptionalLabStoreApi()
  useFrame((_, dt) => {
    const s = store?.getState()
    if (s?.playing) s.advance(Math.min(dt, 0.1))
  })
  return null
}

/** DOM clock used while the non-3D fallback is shown (no useFrame outside a Canvas). */
function FallbackClock() {
  useRafClock(useOptionalLabStoreApi())
  return null
}

class SceneErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error) {
    console.error('[AutoVerse] 3D scene failed, showing fallback:', error)
  }
  render() {
    if (this.state.error)
      return (
        <div className="relative h-full w-full">
          {this.props.fallback}
          <p className="absolute left-3 top-3 rounded bg-danger/15 px-2 py-1 font-mono text-[11px] text-danger" role="status">
            3D view unavailable — showing diagram
          </p>
        </div>
      )
    return this.props.children
  }
}
