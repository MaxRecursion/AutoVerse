import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Box, Maximize2, Minimize2, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react'
import { useStore } from 'zustand'
import type { Camera } from 'three'
import { LabStoreContext } from '@/components/three/LabContext'
import { SceneCanvas } from '@/components/three/SceneCanvas'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/segmented'
import { engineLabConfig } from '@/features/engine-lab/config'
import { useQualityTier } from '@/hooks/useQualityTier'
import { createLabStore } from '@/lib/simulation/labStore'
import { cn } from '@/lib/utils'
import type { FrameBus } from './animation'
import { cutawayBoundsPoints, fitCutawayPoints } from './cutawayFraming'
import { cutawayMirror, cutawayToWorld } from './cutawayMath'
import { exhaustFramingPoints, exhaustPlumbing, longHeaderSide, type PlumbingCylinder } from './exhaust'
import { describeExhaust } from './exhaustText'
import { CylinderLayout } from './CylinderLayout'
import { CutawayScene } from './CutawayScene'
import type { EngineSpec } from './engines'
import type { FiringEvent } from './firing'
import { describeThrow, isV10, throwPinOffset, v10Framing, v10Model } from './v10Layout'
import { V10Scene } from './V10Scene'

type Vec3 = [number, number, number]
type CutawayView = 'engine' | 'detail'

interface EngineCutawayProps {
  spec: EngineSpec
  events: FiringEvent[]
  bankAngle: number
  sense: 1 | -1
  bus: FrameBus
  /** The engine is running (its sound playing), whether or not motion is reduced. */
  running: boolean
  reduced: boolean
}

const VIEWS = [
  { value: 'engine', label: 'Whole engine' },
  { value: 'detail', label: 'Cylinder cutaway' },
] as const
const noSubscribe = () => () => {}
const ORBIT_STEP = Math.PI / 12
const MIN_DISTANCE = 2.2
const MAX_DISTANCE = 80
/** A boxer's exhaust runs under the engine, so its whole-engine view looks from a little lower down. */
const BOXER_VIEW: Vec3 = [0.55, 0.1, 0.83]
const ORBITS = [
  { label: 'Rotate engine left', icon: ArrowLeft, yaw: -ORBIT_STEP, pitch: 0 },
  { label: 'Rotate engine right', icon: ArrowRight, yaw: ORBIT_STEP, pitch: 0 },
  { label: 'Rotate engine up', icon: ArrowUp, yaw: 0, pitch: ORBIT_STEP },
  { label: 'Rotate engine down', icon: ArrowDown, yaw: 0, pitch: -ORBIT_STEP },
]

/** Frame the complete layout on phones; the single-cylinder view can sit closer. */
function framing(spec: EngineSpec, view: CutawayView, aspect: number): { position: Vec3; target: Vec3 } {
  const slots = spec.layout === 'inline' ? spec.cylinders : spec.cylinders / 2
  if (view === 'engine') {
    const halfLength = (slots - 1) * 1.25 / 2
    const bank = spec.layout === 'inline' ? 0 : spec.layout === 'flat' ? 180 : Math.max(90, spec.bankAngle)
    const halfBank = bank * Math.PI / 360
    const reach = 3.75 * Math.sin(halfBank) + 0.95 * Math.cos(halfBank) + 0.15
    const cylinders: PlumbingCylinder[] = Array.from({ length: slots }, (_, slot) => {
      const x = (slot - (slots - 1) / 2) * 1.25
      return spec.layout === 'inline' ? [{ index: slot, side: 'mid' as const, x }] : [{ index: slot * 2, side: 'A' as const, x }, { index: slot * 2 + 1, side: 'B' as const, x }]
    }).flat()
    const plumbing = exhaustPlumbing(cylinders, (side, x, point) => cutawayToWorld(side, bank, cutawayMirror(spec.layout, side, false), x, point), {
      xFront: halfLength + 0.45, xRear: -halfLength - 0.85, shared: !spec.separateBanks, longBank: longHeaderSide(spec),
    })
    return fitCutawayPoints([
      ...cutawayBoundsPoints([-halfLength - 0.8, -1.15, -reach], [halfLength + 0.9, 3.75 * Math.cos(halfBank) + 0.95 * Math.sin(halfBank) + 0.4, reach]),
      ...exhaustFramingPoints(plumbing),
    ], aspect, spec.layout === 'flat' ? BOXER_VIEW : undefined)
  }
  const target: Vec3 = [0, 1.45, 0]
  const base: Vec3 = [5, 3.5, 6]
  const fit = Math.max(1, Math.min(3.2, 0.7 / aspect))
  const position = base.map((v, i) => target[i]! + (v - target[i]!) * fit) as Vec3
  return { position, target }
}

const cylinderName = (event: FiringEvent) => event.cylinder === null ? `bank ${event.bank}, firing event ${event.index + 1}` : `cylinder ${event.cylinder}`

/**
 * Original mechanical cutaway for the production sound presets. Its local lab
 * store registers camera controls only: the audio frame bus supplies all motion
 * and this view never records lesson progress or advances a lab timeline.
 */
export default function EngineCutaway({ spec, events, bankAngle, sense, bus, running, reduced }: EngineCutawayProps) {
  const [store] = useState(() => createLabStore(engineLabConfig, { autoplay: false }))
  const [view, setView] = useState<CutawayView>('detail')
  const [expanded, setExpanded] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [aspect, setAspect] = useState(1.4)
  const viewport = useRef<HTMLDivElement>(null)
  const liveCamera = useRef<Camera | null>(null)
  const cameraReady = useStore(store, (state) => state.camera !== null)
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false)
  const tier = useQualityTier()
  // V10 presets get the dedicated V10 scene (both banks per throw, exhausts); the rest use the generic scene.
  const v10 = useMemo(() => (isV10(spec) ? v10Model(spec) : null), [spec])
  // Framed for a wide bank angle, so the camera does not move while the bank-angle experiment eases.
  const home = useMemo(() => (v10 ? v10Framing(view === 'engine' ? 'engine' : 'pair', Math.max(spec.bankAngle, 90), aspect, !spec.separateBanks) : framing(spec, view, aspect)), [v10, spec, view, aspect])
  const selected = events.find((event) => event.index === selectedIndex) ?? events[0]!
  const exhaust = describeExhaust(spec, { v10: !!v10, view, running, reduced })
  const partner = v10?.cylinders.find((c) => c.event.index !== selected.index && c.throwIndex === v10.cylinders.find((x) => x.event.index === selected.index)?.throwIndex)
  const pinNote = useMemo(() => {
    if (!v10) return ''
    const throwIndex = v10.cylinders.find((c) => c.event.index === selected.index)?.throwIndex ?? 0
    // Current (perhaps experimental) firing, so the note matches what the scene draws.
    const current = v10.cylinders.map((c) => ({ ...c, event: events[c.event.index] ?? c.event }))
    return describeThrow(throwPinOffset(current, throwIndex, bankAngle, sense))
  }, [v10, selected.index, events, bankAngle, sense])

  useEffect(() => {
    const el = viewport.current
    if (!el || typeof ResizeObserver !== 'function') return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry?.contentRect ?? { width: 0, height: 0 }
      if (width > 0 && height > 0) setAspect(width / height)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const frame = () => {
      const camera = store.getState().camera
      camera?.setHome?.(home.position, home.target)
      camera?.lookAt?.(home.position, home.target)
    }
    frame()
    return store.subscribe((next, previous) => {
      if (next.camera !== previous.camera) frame()
    })
  }, [store, home, selectedIndex])

  const inspect = useCallback((index: number) => {
    setSelectedIndex(index)
    setView('detail')
  }, [])

  const moveCamera = (yawDelta: number, pitchDelta: number, zoom = 1) => {
    const camera = store.getState().camera
    if (!camera?.lookAt) return
    const position = liveCamera.current?.position
    const [tx, ty, tz] = home.target
    const x = (position?.x ?? home.position[0]) - tx
    const y = (position?.y ?? home.position[1]) - ty
    const z = (position?.z ?? home.position[2]) - tz
    const distance = Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, Math.hypot(x, y, z) * zoom))
    const yaw = Math.atan2(x, z) + yawDelta
    const pitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 2 - 0.08, Math.atan2(y, Math.hypot(x, z)) + pitchDelta))
    camera.lookAt([
      tx + distance * Math.sin(yaw) * Math.cos(pitch),
      ty + distance * Math.sin(pitch),
      tz + distance * Math.cos(yaw) * Math.cos(pitch),
    ], home.target)
  }

  const fallback = (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3 sm:p-4">
      <p className="rounded-md border border-amber/25 bg-amber/[0.05] px-3 py-2 text-sm leading-relaxed text-steel-300" role="status">This browser cannot show the 3D cutaway. The piston timing diagram below follows the same firing sequence.</p>
      <CylinderLayout spec={spec} events={events} bankAngle={bankAngle} sense={sense} bus={bus} animating={!reduced && !!bus.last?.animate} testId="cutaway-fallback-layout" />
    </div>
  )

  return (
    <section className="flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-cyan/20 bg-graphite-950/60" aria-labelledby="engine-cutaway-heading" data-testid="engine-cutaway" data-view={view} data-scene={v10 ? 'v10' : 'generic'}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/[0.06] px-3 py-2">
        <div>
          <h3 id="engine-cutaway-heading" className="flex items-center gap-2 text-sm font-semibold text-paper"><Box aria-hidden className="size-4 text-cyan" />3D engine cutaway</h3>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <Segmented value={view} onValueChange={setView} options={VIEWS} aria-label="Engine cutaway view" size="sm" className="max-w-full" />
          <Button variant="ghost" size="sm" aria-label={expanded ? 'Use compact engine view' : 'Expand engine view'} aria-pressed={expanded} onClick={() => setExpanded((value) => !value)} className="h-8 px-2 text-xs">
            {expanded ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}<span className="sr-only sm:not-sr-only">{expanded ? 'Compact view' : 'Expand view'}</span>
          </Button>
        </div>
      </div>

      <LabStoreContext.Provider value={store}>
        <div ref={viewport} className={cn('min-w-0 grow bg-[radial-gradient(ellipse_at_center,rgb(56_215_242/0.035),transparent_70%)]', expanded ? 'h-[min(70svh,640px)]' : 'h-[clamp(240px,32svh,360px)]')} data-testid="engine-cutaway-canvas">
          {mounted ? (
            <SceneCanvas
              label={
                view === 'detail'
                  ? v10 && partner
                    ? `3D mechanical cutaway of ${cylinderName(selected)} and its crank-throw partner, ${cylinderName(partner.event)}, in ${spec.engine}: both banks at ${spec.bankAngle}°, with pistons, connecting rods, crankpins, camshafts, valves and exhaust headers.`
                    : `3D mechanical cutaway of ${cylinderName(selected)} in ${spec.engine}, showing the piston, connecting rod, crankshaft, camshafts, valves and the start of its exhaust header.`
                  : v10
                    ? `3D mechanical cutaway of the ${spec.cylinders}-cylinder ${spec.engine}: five crank throws, banks ${spec.bankAngle}° apart, and ${exhaust.pipes}; ${exhaust.gas}.`
                    : `3D mechanical cutaway of the ${spec.cylinders}-cylinder ${spec.engine}: its ${spec.layout} layout, pistons, connecting rods, crankshaft and valvetrain, and ${exhaust.pipes}; ${exhaust.gas}.`
              }
              cameraPosition={home.position}
              target={home.target}
              minDistance={MIN_DISTANCE}
              maxDistance={MAX_DISTANCE}
              floorY={null}
              frameloop="demand"
              fallback={fallback}
              loadingLabel="Preparing mechanical cutaway…"
              onCreated={({ camera }) => { liveCamera.current = camera }}
            >
              {v10 ? (
                <V10Scene spec={spec} events={events} bankAngle={bankAngle} sense={sense} bus={bus} tier={tier} view={view} selectedIndex={selected.index} onSelect={inspect} />
              ) : (
                <CutawayScene spec={spec} events={events} bankAngle={bankAngle} sense={sense} bus={bus} tier={tier} view={view} selectedIndex={selected.index} onSelect={inspect} />
              )}
            </SceneCanvas>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-5 text-center text-steel-400" role="status">
              <Box aria-hidden className="size-10 text-cyan/60" />
              <p className="text-sm">The mechanical cutaway loads when this page opens.</p>
            </div>
          )}
        </div>
      </LabStoreContext.Provider>

      <div className="flex flex-col gap-2 border-t border-line/[0.06] px-3 py-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="3D camera controls">
            <div className="flex flex-wrap gap-1.5">
              {ORBITS.map(({ label, icon: Icon, yaw, pitch }) => (
                <Button key={label} variant="outline" size="icon" className="size-8 pointer-coarse:size-10" aria-label={label} title={label} onClick={() => moveCamera(yaw, pitch)} disabled={!cameraReady}><Icon aria-hidden /></Button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button variant="outline" size="icon" className="size-8 pointer-coarse:size-10" aria-label="Zoom into engine" title="Zoom in" onClick={() => moveCamera(0, 0, 0.82)} disabled={!cameraReady}><ZoomIn aria-hidden /></Button>
              <Button variant="outline" size="icon" className="size-8 pointer-coarse:size-10" aria-label="Zoom out of engine" title="Zoom out" onClick={() => moveCamera(0, 0, 1.22)} disabled={!cameraReady}><ZoomOut aria-hidden /></Button>
              <Button variant="ghost" className="h-8 px-2 text-xs pointer-coarse:h-10" aria-label="Reset 3D camera" onClick={() => store.getState().camera?.reset()} disabled={!cameraReady}><RotateCcw aria-hidden /><span className="hidden sm:inline">Reset</span></Button>
            </div>
          </div>
          <div className="flex min-w-0 max-w-full items-center gap-2">
            <p className="text-xs font-medium text-steel-300">Cylinder</p>
            <div className="flex min-w-0 gap-1.5 overflow-x-auto py-1 [scrollbar-width:thin] sm:flex-wrap sm:overflow-visible" role="group" aria-label="Choose a cylinder cutaway">
              {events.map((event) => (
                <button key={event.index} type="button" onClick={() => inspect(event.index)} aria-label={`Inspect ${cylinderName(event)}`} aria-pressed={view === 'detail' && selected.index === event.index} className={cn('relative hit-area min-h-7 min-w-7 shrink-0 rounded-md border px-1.5 font-mono text-xs transition-colors pointer-coarse:min-h-10 pointer-coarse:min-w-10', view === 'detail' && selected.index === event.index ? 'border-cyan/50 bg-cyan/10 text-cyan' : 'border-line/10 text-steel-300 hover:border-cyan/40 hover:text-paper')}>
                  {event.cylinder ?? `${event.bank} · ${event.index + 1}`}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p role="status" aria-live="polite" className="text-xs leading-relaxed text-steel-400">
            {view === 'detail' ? `Inspecting ${cylinderName(selected)}${partner ? ` + ${partner.event.cylinder ?? cylinderName(partner.event)} (crank pair)` : ''}.` : `Showing all ${spec.cylinders} cylinders.`}
            {spec.order === null ? ' Labels identify banks and firing events; a verified cylinder order is not published here.' : ''}
          </p>
          <details className="text-xs text-steel-400 open:w-full">
            <summary className="relative hit-area w-fit cursor-pointer py-1 hover:text-paper">View guide and exhaust notes</summary>
            <div className="mt-2 space-y-2 leading-relaxed">
              <p>Drag to orbit; scroll or pinch to zoom. Every camera movement also has a button above.</p>
              {v10 && (
                <p className="mt-1 text-xs leading-relaxed text-steel-400" data-testid="v10-throw-note">
                  {view === 'detail' ? pinNote : 'Gas leaves each cylinder as its exhaust valve opens, then mixes in the collectors.'}{' '}
                  {spec.separateBanks ? 'Each bank has its own exhaust.' : 'Both banks join one exhaust behind the engine.'}
                </p>
              )}
              <p className="text-xs leading-relaxed text-steel-400" data-testid="exhaust-flow-note">{exhaust.note}</p>
              <p className="text-xs leading-relaxed text-steel-500">Illustrative cutaway: firing and bank geometry follow the production preset; dimensions and the DOHC valvetrain are teaching examples.</p>
            </div>
          </details>
        </div>
      </div>
    </section>
  )
}
