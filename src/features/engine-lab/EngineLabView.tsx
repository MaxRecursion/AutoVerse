import { useEffect, useRef } from 'react'
import { useLab, useLabStoreApi } from '@/components/three/LabContext'
import { LabWorkbench } from '@/components/three/LabWorkbench'
import { SceneCanvas } from '@/components/three/SceneCanvas'
import type { LabViewProps } from '@/features/labs/types'
import { useIsMobile } from '@/hooks/useMediaQuery'
import { useQualityTier } from '@/hooks/useQualityTier'
import { EngineExplanation } from './EngineExplanation'
import { EngineScene } from './EngineScene'
import { EngineSection2D } from './EngineSection2D'
import { ENGINE_CAMERA, ENGINE_CAMERA_NARROW, ENGINE_EXPLODED_CAMERA, ENGINE_PART_IDS } from './engineParts'
import { formatCamDegrees, formatDegrees } from './engineText'
import { IDLE_RPM, formatSlowdown, slowdownVsIdle, strokeIndex } from './kinematics'
import { useEngineFrame } from './useEngineFrame'

const DISCLAIMER =
  'Dimensions, valve timing, spark timing and the pressure curve are illustrative teaching values, not data for any real engine. ' +
  'Gas colours and the combustion glow are a conceptual visualisation, and valve lift is drawn 1.5× real size so it is easy to see.'

const SCENE_LABEL =
  'Interactive 3D cutaway of a single-cylinder four-stroke engine: piston, connecting rod, crankshaft, two camshafts, valves and spark plug moving on one timeline. ' +
  'Drag to orbit, scroll or pinch to zoom, and select a part to learn what it does.'

/** Compact scene overlay: crank and cam angles, stroke number and how slowed-down the animation is. */
function EngineReadouts() {
  const root = useRef<HTMLDListElement>(null)
  const speed = useLab((s) => s.speed)
  const cycle = useLab((s) => s.config.cycleDuration)
  useEngineFrame((s) => {
    const dl = root.current
    if (!dl) return
    const write = (k: string, text: string) => {
      const el = dl.querySelector<HTMLElement>(`[data-readout="${k}"]`)
      if (el && el.textContent !== text) el.textContent = text
    }
    write('crank', formatDegrees(s.crankDeg))
    write('cam', formatCamDegrees(s.camDeg))
    write('stroke', `${strokeIndex(s.stroke) + 1} / 4`)
  })
  const slowdown = formatSlowdown(slowdownVsIdle(cycle, speed))

  return (
    <div className="panel w-fit px-2.5 py-1.5" data-testid="engine-readouts">
      <dl ref={root} className="grid grid-cols-[auto_auto] gap-x-3 font-mono text-[11px] leading-5">
        <dt className="text-steel-400">Crank</dt>
        <dd data-readout="crank" className="text-right tabular-nums text-paper" />
        <dt className="text-steel-400">Cam</dt>
        <dd data-readout="cam" className="text-right tabular-nums text-paper" />
        {/* The cue badge already names the stroke; phones skip this row to keep the scene clear. */}
        <dt className="text-steel-400 max-sm:hidden">Stroke</dt>
        <dd data-readout="stroke" className="text-right tabular-nums text-paper max-sm:hidden" />
      </dl>
      <p className="mt-0.5 max-w-[11rem] font-mono text-[10px] leading-snug text-steel-400">
        ~{slowdown}× slower than a {IDLE_RPM} rpm idle
      </p>
    </div>
  )
}

/** Pull the camera back while the exploded view is on, so the spread-out parts stay in frame. */
function useExplodedFraming(assembled: { position: [number, number, number]; target: [number, number, number] }) {
  const store = useLabStoreApi()
  useEffect(
    () =>
      store.subscribe((s, prev) => {
        if (s.exploded === prev.exploded || !s.camera?.lookAt) return
        const framing = s.exploded ? ENGINE_EXPLODED_CAMERA : assembled
        s.camera.lookAt(framing.position, framing.target)
        // "Reset camera" returns to the framing of the current view.
        s.camera.setHome?.(framing.position, framing.target)
      }),
    [store, assembled],
  )
}

/** The Four-Stroke Engine Laboratory (lazy-loaded by the lab registry). */
export default function EngineLabView({ variant }: LabViewProps) {
  const tier = useQualityTier()
  // Narrow (portrait) canvases need the camera further back to clear the overlays.
  const camera = useIsMobile() ? ENGINE_CAMERA_NARROW : ENGINE_CAMERA
  useExplodedFraming(camera)
  return (
    <LabWorkbench
      title="Four-Stroke Engine Laboratory"
      variant={variant}
      scene={
        <SceneCanvas
          label={SCENE_LABEL}
          fallback={<EngineSection2D variant="fallback" />}
          cameraPosition={camera.position}
          target={camera.target}
          floorY={ENGINE_CAMERA.floorY}
          minDistance={2.5}
          maxDistance={20}
        >
          <EngineScene tier={tier} />
        </SceneCanvas>
      }
      explanation={<EngineExplanation />}
      componentIds={[...ENGINE_PART_IDS]}
      readouts={<EngineReadouts />}
      extraTab={{ id: 'section', label: 'Section', content: <EngineSection2D variant="panel" /> }}
      disclaimer={DISCLAIMER}
    />
  )
}
