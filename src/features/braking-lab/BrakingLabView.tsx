import { useEffect, useRef } from 'react'
import { useLabStoreApi } from '@/components/three/LabContext'
import { LabWorkbench } from '@/components/three/LabWorkbench'
import { SceneCanvas } from '@/components/three/SceneCanvas'
import type { LabViewProps } from '@/features/labs/types'
import { useIsMobile } from '@/hooks/useMediaQuery'
import { useQualityTier } from '@/hooks/useQualityTier'
import { BrakeScene } from './BrakeScene'
import { Braking2D } from './Braking2D'
import { BrakingControls } from './BrakingControls'
import { BrakingExplanation } from './BrakingExplanation'
import { BRAKE_CAMERA, BRAKE_CAMERA_NARROW, BRAKE_EXPLODED_CAMERA, BRAKE_PART_IDS, type Framing } from './brakeParts'
import { formatDecel, formatEnergy, formatForce, formatPressure, formatSpeed, formatTemp } from './brakingText'
import { useBrakingFrame } from './useBrakingFrame'

const DISCLAIMER =
  'Illustrative teaching model of one front corner of a 1,600 kg car — not data for any real vehicle. ' +
  'ABS is a conceptual hold / release / reapply cycle, not a vehicle-dynamics model. Fluid and disc colours are a conceptual pressure and heat map ' +
  '(a real disc only glows above about 500 °C), pad clearance is exaggerated, and the event plays slowed down or sped up to fit the timeline.'

const SCENE_LABEL =
  'Interactive 3D model of a disc brake on one wheel: brake pedal, servo, master cylinder, ABS modulator, brake line, floating caliper with piston and pads, ' +
  'ventilated disc, hub, wheel-speed sensor and tyre on the road. Hold the brake button to stop the car; drag to orbit, scroll or pinch to zoom, and select a part to learn what it does.'

type Readout = 'speed' | 'pressure' | 'clamp' | 'decel' | 'energy' | 'temp'

/** Compact scene overlay: speed, pressure, clamp force, deceleration, energy converted and disc temperature. */
function BrakingReadouts() {
  const root = useRef<HTMLDListElement>(null)
  useBrakingFrame((st) => {
    const dl = root.current
    if (!dl) return
    const write = (k: Readout, text: string) => {
      const el = dl.querySelector<HTMLElement>(`[data-readout="${k}"]`)
      if (el && el.textContent !== text) el.textContent = text
    }
    write('speed', formatSpeed(st.vehicleSpeed))
    write('pressure', formatPressure(st.caliperPressurePa))
    write('clamp', formatForce(st.clampN))
    write('decel', formatDecel(st.decel))
    write('energy', formatEnergy(st.energyTotal))
    write('temp', formatTemp(st.discTempC))
  })

  // Phones: label-over-value cells in two columns (a short block that leaves the scene visible).
  // Wider screens: one label / value row per reading (the wrapper becomes display: contents).
  const row = (k: Readout, label: string, mobile = true) => (
    <div className={mobile ? 'flex flex-col sm:contents' : 'contents max-sm:hidden'}>
      <dt className="text-[10px] leading-4 text-steel-400 sm:text-[11px] sm:leading-5">{label}</dt>
      <dd data-readout={k} className="leading-4 tabular-nums text-paper sm:text-right sm:leading-5" />
    </div>
  )
  return (
    <div className="panel w-fit px-2.5 py-1.5" data-testid="braking-readouts">
      <dl ref={root} className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px] sm:grid-cols-[auto_auto] sm:gap-y-0">
        {row('speed', 'Speed')}
        {row('pressure', 'Pressure')}
        {/* Phones keep the four headline numbers so the scene stays clear. */}
        {row('clamp', 'Clamp', false)}
        {row('decel', 'Decel.')}
        {row('energy', 'Heat made', false)}
        {row('temp', 'Disc')}
      </dl>
      <p className="mt-0.5 font-mono text-[10px] leading-snug text-steel-400">illustrative values</p>
    </div>
  )
}

/** Pull the camera back while the exploded view is on, so the spread-out parts stay in frame. */
function useExplodedFraming(assembled: Framing) {
  const store = useLabStoreApi()
  useEffect(
    () =>
      store.subscribe((s, prev) => {
        if (s.exploded === prev.exploded || !s.camera?.lookAt) return
        const framing = s.exploded ? BRAKE_EXPLODED_CAMERA : assembled
        s.camera.lookAt(framing.position, framing.target)
        // "Reset camera" returns to the framing of the current view.
        s.camera.setHome?.(framing.position, framing.target)
      }),
    [store, assembled],
  )
}

/** The Disc Brake Laboratory (lazy-loaded by the lab registry). */
export default function BrakingLabView({ variant }: LabViewProps) {
  const tier = useQualityTier()
  const camera = useIsMobile() ? BRAKE_CAMERA_NARROW : BRAKE_CAMERA
  useExplodedFraming(camera)
  return (
    <LabWorkbench
      title="Disc Brake Laboratory"
      variant={variant}
      scene={
        <SceneCanvas
          label={SCENE_LABEL}
          fallback={<Braking2D variant="fallback" />}
          cameraPosition={camera.position}
          target={camera.target}
          floorY={BRAKE_CAMERA.floorY}
          minDistance={2.5}
          maxDistance={16}
        >
          <BrakeScene tier={tier} />
        </SceneCanvas>
      }
      explanation={<BrakingExplanation />}
      componentIds={[...BRAKE_PART_IDS]}
      controls={<BrakingControls />}
      readouts={<BrakingReadouts />}
      extraTab={{ id: 'diagram', label: 'Diagram', content: <Braking2D variant="panel" /> }}
      disclaimer={DISCLAIMER}
    />
  )
}
