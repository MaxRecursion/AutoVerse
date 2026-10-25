import { useEffect, useMemo, useState } from 'react'
import { useLabStoreApi } from '@/components/three/LabContext'
import { LabWorkbench } from '@/components/three/LabWorkbench'
import { SceneCanvas } from '@/components/three/SceneCanvas'
import type { LabViewProps } from '@/features/labs/types'
import { usePrefersReducedMotion } from '@/hooks/useMediaQuery'
import { useQualityTier, type QualityTier } from '@/hooks/useQualityTier'
import { PARAM } from './config'
import { DEFAULT_FRAMINGS, DISTANCE, SCENE_FOV, labFramings, type LabFramings } from './framing'
import { GearboxSchematic2D } from './GearboxSchematic2D'
import { describeDrive, formatMultiplication, formatRatio, formatRoadSpeed, formatRpm } from './gearboxText'
import { TransmissionControls } from './TransmissionControls'
import { TransmissionExplanation } from './TransmissionExplanation'
import { TransmissionScene } from './TransmissionScene'
import { TRANSMISSION_CAMERA, TRANSMISSION_PART_IDS } from './transmissionParts'
import { useDriveState } from './useTransmission'

const DISCLAIMER =
  'Illustrative teaching gearbox: tooth counts, ratios, final drive, efficiencies, engine torque and the clutch characteristic are invented round numbers, ' +
  'not the data of any production gearbox. Shaft rotation is slowed 100× and the clutch plate lift is exaggerated so both are easy to see; the amber glow marks the parts carrying torque.'

const SCENE_LABEL =
  'Interactive 3D cutaway of a five-speed manual gearbox and its clutch: flywheel, clutch disc, pressure plate, input shaft, constant-mesh gears, layshaft, ' +
  'free-running mainshaft gears, synchroniser collars, reverse idler and output shaft. The parts carrying power glow amber. ' +
  'Use the gear selector, clutch pedal and engine-speed controls below the scene; drag to orbit, scroll or pinch to zoom, and select a part to learn what it does.'

/** Compact scene overlay: ratio, input / output speed, torque multiplication and road speed. */
function TransmissionReadouts() {
  const d = useDriveState()
  const rows: { k: string; v: string; phone?: boolean }[] = [
    { k: 'Ratio', v: formatRatio(d.ratio), phone: true },
    { k: 'Input', v: formatRpm(d.inputRpm) },
    { k: 'Output', v: formatRpm(d.outputRpm), phone: true },
    { k: 'Torque', v: formatMultiplication(d.torqueMultiplication) },
    { k: 'Road', v: formatRoadSpeed(d.roadSpeedKmh), phone: true },
  ]
  return (
    <div className="panel w-fit px-2.5 py-1.5" data-testid="transmission-readouts">
      <dl className="grid grid-cols-[auto_auto] gap-x-3 font-mono text-[11px] leading-5">
        {rows.map((r) => (
          <div key={r.k} className={r.phone ? 'contents' : 'contents max-sm:hidden'}>
            <dt className={r.phone ? 'text-steel-400' : 'text-steel-400 max-sm:hidden'}>{r.k}</dt>
            <dd className={r.phone ? 'text-right tabular-nums text-paper' : 'text-right tabular-nums text-paper max-sm:hidden'} data-readout={r.k.toLowerCase()}>
              {r.v}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-0.5 whitespace-nowrap font-mono text-[10px] text-steel-400">
        illustrative<span className="max-sm:hidden"> · 100× slower</span>
      </p>
      <p className="sr-only">{describeDrive(d)}</p>
    </div>
  )
}

/** Test ids of the overlays whose size the camera fit leaves room for. */
const OVERLAY = { readouts: 'transmission-readouts', controls: 'transmission-controls' } as const
/** Typical overlay sizes (px) if they cannot be measured. */
const OVERLAY_FALLBACK = { top: 60, bottom: 170, side: 12 } as const

/**
 * Fit both camera framings to the canvas host, leaving room for the overlays
 * LabWorkbench draws over the scene: the readouts (top left; capped so they
 * cannot squeeze the model on short canvases) and the control deck (bottom).
 */
function measureFramings(host: HTMLElement): LabFramings {
  const box = host.getBoundingClientRect()
  if (!(box.width > 0 && box.height > 0)) return DEFAULT_FRAMINGS
  const section = host.parentElement ?? host
  const rect = (id: string) => section.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect()
  const controls = rect(OVERLAY.controls)
  const readouts = rect(OVERLAY.readouts)
  const bottom = controls && controls.height > 0 ? box.bottom - controls.top + 8 : OVERLAY_FALLBACK.bottom
  const top = readouts && readouts.height > 0 ? readouts.bottom - box.top : OVERLAY_FALLBACK.top
  return labFramings(box.width, box.height, {
    top: Math.min(Math.max(top, 52), box.height * 0.22),
    bottom,
    left: OVERLAY_FALLBACK.side,
    right: OVERLAY_FALLBACK.side,
  })
}

/** Relative size change that counts as a new layout (rotation, pane resize), not URL-bar jitter. */
const REFIT_THRESHOLD = 0.15

/**
 * Camera framings fitted to the canvas host. The first fit is measured
 * synchronously once the host mounts (before the canvas is created, so the
 * initial view and "Reset camera" use it). A large resize — a phone rotating,
 * a pane snapping — refits and eases the camera to the new framing.
 */
function useFittedFramings(host: HTMLElement | null): LabFramings | null {
  const store = useLabStoreApi()
  const initial = useMemo(() => (host ? measureFramings(host) : null), [host])
  const [refit, setRefit] = useState<{ host: HTMLElement; framings: LabFramings } | null>(null)

  useEffect(() => {
    if (!host || typeof ResizeObserver === 'undefined') return
    let last = host.getBoundingClientRect()
    let timer: ReturnType<typeof setTimeout> | undefined
    const observer = new ResizeObserver(() => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        const r = host.getBoundingClientRect()
        const moved = Math.abs(r.width - last.width) > REFIT_THRESHOLD * last.width || Math.abs(r.height - last.height) > REFIT_THRESHOLD * last.height
        if (!moved || r.width <= 0 || r.height <= 0) return
        last = r
        const framings = measureFramings(host)
        setRefit({ host, framings })
        const s = store.getState()
        const f = s.exploded ? framings.exploded : framings.assembled
        s.camera?.lookAt?.(f.position, f.target)
        // "Reset camera" should return to the refitted view, not the one from page load.
        s.camera?.setHome?.(f.position, f.target)
      }, 200)
    })
    observer.observe(host)
    return () => {
      observer.disconnect()
      clearTimeout(timer)
    }
  }, [host, store])

  return refit?.host === host ? refit.framings : initial
}

/**
 * Move the camera to the exploded framing (further back) and back again with
 * the exploded view; "Reset camera" follows, so it never crops the exploded parts.
 */
function useExplodedFraming(framings: LabFramings | null) {
  const store = useLabStoreApi()
  useEffect(
    () =>
      store.subscribe((s, prev) => {
        if (!framings || s.exploded === prev.exploded || !s.camera?.lookAt) return
        const f = s.exploded ? framings.exploded : framings.assembled
        s.camera.lookAt(f.position, f.target)
        s.camera.setHome?.(f.position, f.target)
      }),
    [store, framings],
  )
}

/** The 3D scene in a host that measures itself first, so the camera fits the model to the canvas. */
function FittedScene({ tier, reducedMotion }: { tier: QualityTier; reducedMotion: boolean }) {
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  const framings = useFittedFramings(host)
  useExplodedFraming(framings)
  return (
    <div ref={setHost} className="h-full w-full">
      {framings && (
        <SceneCanvas
          label={SCENE_LABEL}
          fallback={<GearboxSchematic2D variant="fallback" />}
          cameraPosition={framings.assembled.position}
          target={framings.assembled.target}
          fov={SCENE_FOV}
          floorY={TRANSMISSION_CAMERA.floorY}
          minDistance={DISTANCE.min}
          maxDistance={DISTANCE.max}
        >
          <TransmissionScene tier={tier} reducedMotion={reducedMotion} />
        </SceneCanvas>
      )}
    </div>
  )
}

/** Reduced motion: start with the shafts still (the user can press play). */
function useReducedMotionStart(reduced: boolean) {
  const store = useLabStoreApi()
  useEffect(() => {
    if (reduced) store.getState().setParam(PARAM.running, false)
  }, [store, reduced])
}

/** The Manual Gearbox Laboratory (lazy-loaded by the lab registry). */
export default function TransmissionLabView({ variant }: LabViewProps) {
  const tier = useQualityTier()
  const reducedMotion = usePrefersReducedMotion()
  useReducedMotionStart(reducedMotion)
  return (
    <LabWorkbench
      title="Manual Gearbox Laboratory"
      variant={variant}
      scene={<FittedScene tier={tier} reducedMotion={reducedMotion} />}
      explanation={<TransmissionExplanation />}
      componentIds={[...TRANSMISSION_PART_IDS]}
      controls={<TransmissionControls />}
      readouts={<TransmissionReadouts />}
      extraTab={{ id: 'schematic', label: 'Schematic', content: <GearboxSchematic2D variant="panel" /> }}
      disclaimer={DISCLAIMER}
    />
  )
}
