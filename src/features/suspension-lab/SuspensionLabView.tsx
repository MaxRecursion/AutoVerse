import { useEffect, useRef } from 'react'
import { useLabStoreApi } from '@/components/three/LabContext'
import { LabWorkbench } from '@/components/three/LabWorkbench'
import { SceneCanvas } from '@/components/three/SceneCanvas'
import type { LabViewProps } from '@/features/labs/types'
import { useIsMobile } from '@/hooks/useMediaQuery'
import { useQualityTier } from '@/hooks/useQualityTier'
import { SuspensionControls } from './SuspensionControls'
import { SuspensionDiagram2D } from './SuspensionDiagram2D'
import { SuspensionExplanation } from './SuspensionExplanation'
import { SuspensionScene } from './SuspensionScene'
import { SLOW_MOTION } from './config'
import { SUSPENSION_CAMERA, SUSPENSION_CAMERA_NARROW, SUSPENSION_EXPLODED_CAMERA, SUSPENSION_PART_IDS } from './suspensionParts'
import { formatLoad, formatMm, formatTravel } from './suspensionText'
import { useSuspensionFrame } from './useSuspensionFrame'

const DISCLAIMER =
  'Masses, spring and damper rates, tyre stiffness and hard points are illustrative teaching values for a mid-size car, not data for any real vehicle. ' +
  'The response comes from a two-mass quarter-car model driven over a looping test road at 18 km/h. ' +
  'The amber patch under the tyre is a conceptual picture of tyre load.'

const SCENE_LABEL =
  'Interactive 3D model of a double-wishbone front suspension corner driving over a test road: wheel and tyre, hub, steering knuckle, ' +
  'upper and lower control arms with ball joints, coil spring, damper, bump stop, anti-roll bar with drop link, tie rod and the body mounts. ' +
  'The arms swing, the spring compresses and the body rises and falls on one timeline. Drag to orbit, scroll or pinch to zoom, and select a part to learn what it does.'

/** Compact scene overlay: body vs wheel displacement, travel and tyre load (written per frame, no re-render). */
function SuspensionReadouts() {
  const root = useRef<HTMLDListElement>(null)
  useSuspensionFrame((f) => {
    const dl = root.current
    if (!dl) return
    const write = (k: string, text: string) => {
      const el = dl.querySelector<HTMLElement>(`[data-readout="${k}"]`)
      if (el && el.textContent !== text) el.textContent = text
    }
    write('body', formatMm(f.pose.body))
    write('wheel', formatMm(f.pose.wheel))
    write('travel', formatTravel(f.pose.travel))
    write('load', formatLoad(f.pose.loadFactor, f.pose.contact))
    const load = dl.querySelector<HTMLElement>('[data-readout="load"]')
    if (load) load.dataset.airborne = String(!f.pose.contact)
  })
  return (
    <div className="panel w-fit px-2.5 py-1.5" data-testid="suspension-readouts">
      <dl ref={root} className="grid grid-cols-[auto_auto] gap-x-3 font-mono text-[11px] leading-5">
        <dt className="text-cyan">Body</dt>
        <dd data-readout="body" className="text-right tabular-nums text-paper" />
        <dt className="text-amber">Wheel</dt>
        <dd data-readout="wheel" className="text-right tabular-nums text-paper" />
        {/* Phones keep the two key numbers; travel and load are in the Explain tab. */}
        <dt className="text-steel-400 max-sm:hidden">Travel</dt>
        <dd data-readout="travel" className="text-right tabular-nums text-paper max-sm:hidden" />
        <dt className="text-steel-400 max-sm:hidden">Tyre load</dt>
        <dd data-readout="load" className="text-right tabular-nums text-paper data-[airborne=true]:text-danger max-sm:hidden" />
      </dl>
      <p className="mt-0.5 max-w-[11rem] font-mono text-[10px] leading-snug text-steel-400">{SLOW_MOTION}× slower than real time · illustrative</p>
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
        const framing = s.exploded ? SUSPENSION_EXPLODED_CAMERA : assembled
        s.camera.lookAt(framing.position, framing.target)
        // "Reset camera" returns to the framing of the current view.
        s.camera.setHome?.(framing.position, framing.target)
      }),
    [store, assembled],
  )
}

/** The Suspension Laboratory (lazy-loaded by the lab registry). */
export default function SuspensionLabView({ variant }: LabViewProps) {
  const tier = useQualityTier()
  const camera = useIsMobile() ? SUSPENSION_CAMERA_NARROW : SUSPENSION_CAMERA
  useExplodedFraming(camera)
  return (
    <LabWorkbench
      title="Suspension Laboratory"
      variant={variant}
      scene={
        <SceneCanvas
          label={SCENE_LABEL}
          fallback={<SuspensionDiagram2D variant="fallback" />}
          cameraPosition={camera.position}
          target={camera.target}
          floorY={null}
          minDistance={0.8}
          maxDistance={8}
        >
          <SuspensionScene tier={tier} />
        </SceneCanvas>
      }
      explanation={<SuspensionExplanation />}
      componentIds={[...SUSPENSION_PART_IDS]}
      controls={<SuspensionControls />}
      readouts={<SuspensionReadouts />}
      extraTab={{ id: 'model', label: 'Model', content: <SuspensionDiagram2D variant="panel" /> }}
      disclaimer={DISCLAIMER}
    />
  )
}
