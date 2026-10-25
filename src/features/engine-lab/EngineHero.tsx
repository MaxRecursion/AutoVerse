import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { ArrowRight, Pause, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LabStoreContext, useLab, useLabStoreApi } from '@/components/three/LabContext'
import { SceneCanvas } from '@/components/three/SceneCanvas'
import { usePrefersReducedMotion } from '@/hooks/useMediaQuery'
import { useQualityTier } from '@/hooks/useQualityTier'
import { getComponent } from '@/lib/content'
import { createLabStore } from '@/lib/simulation/labStore'
import { cn } from '@/lib/utils'
import { engineLabConfig } from './config'
import { EngineScene } from './EngineScene'
import { EngineSection2D } from './EngineSection2D'
import { ENGINE_CAMERA } from './engineParts'
import { progressFromCrankAngle } from './kinematics'

/** Still pose for reduced motion: early power stroke — valves shut, combustion glow visible. */
const STILL_POSE_DEG = 380
const LAB_PATH = '/labs/engine'

/**
 * Homepage hero: the engine cutaway playing on its own store, with minimal
 * chrome. Parts can still be clicked to highlight them. Respects reduced
 * motion (no autoplay, no sway; a still mid-power-stroke pose instead). The
 * camera is fixed so the page keeps its scroll and touch gestures.
 */
export default function EngineHero({ className }: { className?: string }) {
  const reduced = usePrefersReducedMotion()
  const tier = useQualityTier()
  const [store] = useState(() => createLabStore(engineLabConfig, { autoplay: !reduced }))

  // The preference can resolve or change after mount (e.g. hydration, OS setting).
  useEffect(() => {
    if (!reduced) return
    const s = store.getState()
    s.pause()
    if (s.progress === 0) s.seek(progressFromCrankAngle(STILL_POSE_DEG))
  }, [reduced, store])

  return (
    <LabStoreContext.Provider value={store}>
      <div className={cn('relative h-full min-h-[320px] w-full', className)}>
        <SceneCanvas
          label="Animated cutaway of a four-stroke engine: the piston, crankshaft, camshafts, valves and spark plug moving together. Select a part to highlight it."
          fallback={<EngineSection2D variant="hero" />}
          cameraPosition={[ENGINE_CAMERA.position[0] * 1.08, ENGINE_CAMERA.position[1] * 1.04, ENGINE_CAMERA.position[2] * 1.08]}
          target={ENGINE_CAMERA.target}
          floorY={ENGINE_CAMERA.floorY}
          controls="none"
          loadingLabel="Starting the engine…"
        >
          <EngineScene tier={tier} sway={!reduced} />
        </SceneCanvas>
        <HeroChrome />
      </div>
    </LabStoreContext.Provider>
  )
}

function HeroChrome() {
  const store = useLabStoreApi()
  const playing = useLab((s) => s.playing)
  const cueLabel = useLab((s) => s.config.cues.find((c) => c.id === s.cue)?.label ?? '')
  const selectedId = useLab((s) => s.selectedId)
  const selected = selectedId ? getComponent(selectedId) : undefined

  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-wrap items-end justify-between gap-2">
      <div className="panel pointer-events-auto flex items-center gap-1 py-1 pl-1 pr-3">
        <Button
          size="icon"
          variant="ghost"
          className="size-9"
          onClick={() => store.getState().toggle()}
          aria-label={playing ? 'Pause engine animation' : 'Play engine animation'}
          aria-pressed={playing}
        >
          {playing ? <Pause /> : <Play />}
        </Button>
        <span className="font-mono text-[11px] uppercase tracking-wider text-amber" aria-live="off" data-testid="hero-stroke">
          {cueLabel}
        </span>
      </div>
      {selected ? (
        <div className="panel pointer-events-auto max-w-xs px-3 py-2" aria-live="polite">
          <p className="text-sm font-medium text-paper">{selected.name}</p>
          <Link to={LAB_PATH} className="mt-0.5 inline-flex min-h-9 items-center gap-1 text-xs text-cyan hover:underline">
            Explore it in the engine lab <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      ) : (
        <p className="annotation rounded bg-graphite-950/60 px-2 py-1 text-steel-400">Tap a part to highlight it</p>
      )}
    </div>
  )
}
