import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Box, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react'
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
  reduced: boolean
}

const VIEWS = [
  { value: 'engine', label: 'Whole engine' },
  { value: 'detail', label: 'Cylinder cutaway' },
] as const
const noSubscribe = () => () => {}
const ORBIT_STEP = Math.PI / 12
const MIN_DISTANCE = 2.2
const MAX_DISTANCE = 50
const ORBITS = [
  { label: 'Rotate engine left', icon: ArrowLeft, yaw: -ORBIT_STEP, pitch: 0 },
  { label: 'Rotate engine right', icon: ArrowRight, yaw: ORBIT_STEP, pitch: 0 },
  { label: 'Rotate engine up', icon: ArrowUp, yaw: 0, pitch: ORBIT_STEP },
  { label: 'Rotate engine down', icon: ArrowDown, yaw: 0, pitch: -ORBIT_STEP },
]

/** Frame the complete layout on phones; the single-cylinder view can sit closer. */
function framing(spec: EngineSpec, view: CutawayView, aspect: number): { position: Vec3; target: Vec3 } {
  const slots = spec.layout === 'inline' ? spec.cylinders : spec.cylinders / 2
  const length = (slots - 1) * 1.25 + 1.2
  const target: Vec3 = view === 'detail' ? [0, 1.45, 0] : [0, 1.2, 0]
  const base: Vec3 = view === 'detail' ? [5, 3.5, 6] : [Math.max(7, length * 1.1), 5, Math.max(7, length * 0.9)]
  const fit = Math.max(1, Math.min(3.2, (view === 'detail' ? 0.7 : 1.32) / aspect))
  const position = base.map((v, i) => target[i]! + (v - target[i]!) * fit) as Vec3
  return { position, target }
}

const cylinderName = (event: FiringEvent) => event.cylinder === null ? `bank ${event.bank}, firing event ${event.index + 1}` : `cylinder ${event.cylinder}`

/**
 * Original mechanical cutaway for the production sound presets. Its local lab
 * store registers camera controls only: the audio frame bus supplies all motion
 * and this view never records lesson progress or advances a lab timeline.
 */
export default function EngineCutaway({ spec, events, bankAngle, sense, bus, reduced }: EngineCutawayProps) {
  const [store] = useState(() => createLabStore(engineLabConfig, { autoplay: false }))
  const [view, setView] = useState<CutawayView>('detail')
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
  const home = useMemo(() => (v10 ? v10Framing(view === 'engine' ? 'engine' : 'pair', Math.max(spec.bankAngle, 90), aspect) : framing(spec, view, aspect)), [v10, spec, view, aspect])
  const selected = events.find((event) => event.index === selectedIndex) ?? events[0]!
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
    <section className="min-w-0 overflow-hidden rounded-xl border border-cyan/20 bg-graphite-950/60" aria-labelledby="engine-cutaway-heading" data-testid="engine-cutaway" data-view={view} data-scene={v10 ? 'v10' : 'generic'}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] p-3 sm:p-4">
        <div>
          <h3 id="engine-cutaway-heading" className="flex items-center gap-2 font-semibold text-paper"><Box aria-hidden className="size-4 text-cyan" />3D engine cutaway</h3>
          <p className="mt-1 text-xs leading-relaxed text-steel-400">Follow the pistons, rods, crankshaft, cams and valves.</p>
        </div>
        <Segmented value={view} onValueChange={setView} options={VIEWS} aria-label="Engine cutaway view" size="sm" className="max-w-full" />
      </div>

      <LabStoreContext.Provider value={store}>
        <div ref={viewport} className="h-[420px] min-w-0 bg-[radial-gradient(ellipse_at_center,rgb(56_215_242/0.035),transparent_70%)] sm:h-[520px]" data-testid="engine-cutaway-canvas">
          {mounted ? (
            <SceneCanvas
              label={
                view === 'detail'
                  ? v10 && partner
                    ? `3D mechanical cutaway of ${cylinderName(selected)} and its crank-throw partner, ${cylinderName(partner.event)}, in ${spec.engine}: both banks at ${spec.bankAngle}°, with pistons, connecting rods, crankpins, camshafts, valves and exhaust headers.`
                    : `3D mechanical cutaway of ${cylinderName(selected)} in ${spec.engine}, showing the piston, connecting rod, crankshaft, camshafts and valves.`
                  : v10
                    ? `3D mechanical cutaway of the ${spec.cylinders}-cylinder ${spec.engine}: five crank throws, banks ${spec.bankAngle}° apart, with each bank's exhaust headers and the pulses travelling through them in firing order.`
                    : `3D mechanical cutaway of the ${spec.cylinders}-cylinder ${spec.engine}: its ${spec.layout} layout, pistons, connecting rods, crankshaft and valvetrain.`
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

      <div className="flex flex-col gap-4 border-t border-white/[0.06] p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-3" role="group" aria-label="3D camera controls">
          <div className="flex flex-wrap gap-2">
            {ORBITS.map(({ label, icon: Icon, yaw, pitch }) => (
              <Button key={label} variant="outline" size="icon" className="size-10" aria-label={label} title={label} onClick={() => moveCamera(yaw, pitch)} disabled={!cameraReady}><Icon aria-hidden /></Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="icon" className="size-10" aria-label="Zoom into engine" title="Zoom in" onClick={() => moveCamera(0, 0, 0.82)} disabled={!cameraReady}><ZoomIn aria-hidden /></Button>
            <Button variant="outline" size="icon" className="size-10" aria-label="Zoom out of engine" title="Zoom out" onClick={() => moveCamera(0, 0, 1.22)} disabled={!cameraReady}><ZoomOut aria-hidden /></Button>
            <Button variant="ghost" className="h-10 px-3" aria-label="Reset 3D camera" onClick={() => store.getState().camera?.reset()} disabled={!cameraReady}><RotateCcw aria-hidden />Reset</Button>
          </div>
        </div>
        <p className="text-xs leading-relaxed text-steel-400">Drag to orbit; scroll or pinch to zoom. Every camera movement also has a button above.</p>
        <div>
          <p className="text-xs font-medium text-steel-300">Inspect a cylinder</p>
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Choose a cylinder cutaway">
            {events.map((event) => (
              <button key={event.index} type="button" onClick={() => inspect(event.index)} aria-label={`Inspect ${cylinderName(event)}`} aria-pressed={view === 'detail' && selected.index === event.index} className={cn('relative hit-area min-h-9 min-w-9 rounded-md border px-2 font-mono text-xs transition-colors', view === 'detail' && selected.index === event.index ? 'border-cyan/50 bg-cyan/10 text-cyan' : 'border-white/10 text-steel-300 hover:border-cyan/40 hover:text-paper')}>
                {event.cylinder ?? `${event.bank} · ${event.index + 1}`}
              </button>
            ))}
          </div>
          <p role="status" aria-live="polite" className="mt-2 text-xs leading-relaxed text-steel-400">
            {view === 'detail' ? `Inspecting ${cylinderName(selected)}${partner ? ` and ${cylinderName(partner.event)}, its partner on the same crank throw` : ''}.` : `Showing all ${spec.cylinders} cylinders.`}
            {spec.order === null ? ' Labels identify banks and firing events; a verified cylinder order is not published here.' : ''}
          </p>
          {v10 && (
            <p className="mt-1 text-xs leading-relaxed text-steel-400" data-testid="v10-throw-note">
              {view === 'detail' ? pinNote : 'Glowing pulses leave each cylinder as its exhaust valve opens; pulses sharing a pipe are spaced by their firing gaps.'}{' '}
              {spec.separateBanks ? 'Each bank has its own exhaust.' : 'Both banks join one exhaust behind the engine.'}
            </p>
          )}
        </div>
        <p className="text-xs leading-relaxed text-steel-500">Illustrative cutaway: firing and bank geometry follow the production preset; dimensions and the DOHC valvetrain are teaching examples.</p>
      </div>
    </section>
  )
}
