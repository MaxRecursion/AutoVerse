import { useId, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { useLab, useLabStoreApi } from '@/components/three/LabContext'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { PARAM, PEDAL_RANGE, SPEED_RANGE, SURFACES, SURFACE_IDS, readParams, type SurfaceId } from './braking'
import { pressPedal, releasePedal, setBrakingParam } from './brakingActions'
import { useBrakingFrame } from './useBrakingFrame'

const SURFACE_SHORT: Record<SurfaceId, string> = { dry: 'Dry', wet: 'Wet', ice: 'Ice' }

/**
 * Lab controls overlaid on the scene: a press-and-hold brake pedal, the road
 * surface, ABS on/off and (behind "Adjust" on phones) the pedal force and
 * starting speed. Every control writes lab-store params; nothing here is
 * decorative.
 */
export function BrakingControls() {
  const params = useLab((s) => s.params)
  const p = readParams(params)
  const [open, setOpen] = useState(false)
  const slidersId = useId()

  return (
    <div className="panel pointer-events-auto flex flex-col gap-2 px-2.5 py-2" role="group" aria-label="Brake controls" data-testid="brake-controls">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <PedalButton />
        <SurfacePicker value={p.surface} />
        <AbsToggle value={p.abs} />
        <button
          type="button"
          aria-expanded={open}
          aria-controls={slidersId}
          onClick={() => setOpen((v) => !v)}
          className={cn(
            'relative hit-area ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors sm:hidden',
            open ? 'border-cyan/50 bg-cyan/10 text-cyan' : 'border-white/[0.1] text-steel-300 hover:text-paper',
          )}
        >
          <SlidersHorizontal className="size-3.5" aria-hidden />
          Adjust
        </button>
      </div>
      <div id={slidersId} className={cn('grid gap-x-4 gap-y-1 sm:grid-cols-2', !open && 'max-sm:hidden')}>
        <ParamSlider
          label="Pedal force"
          unit="N"
          value={p.pedalN}
          range={PEDAL_RANGE}
          paramKey={PARAM.pedal}
          hint="Foot force on the pedal"
        />
        <ParamSlider
          label="Speed"
          unit="km/h"
          value={p.speedKmh}
          range={SPEED_RANGE}
          paramKey={PARAM.speed}
          hint="Speed when the pedal goes down"
        />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Press-and-hold pedal                                                 */
/* ------------------------------------------------------------------ */

function PedalButton() {
  const store = useLabStoreApi()
  const [held, setHeld] = useState(false)
  const [status, setStatus] = useState('')
  const fill = useRef<HTMLSpanElement>(null)
  const heldRef = useRef(false)
  const hintId = useId()

  useBrakingFrame((st) => {
    if (fill.current) fill.current.style.transform = `scaleY(${st.pedalTravel.toFixed(3)})`
  })

  const press = () => {
    if (heldRef.current) return
    heldRef.current = true
    setHeld(true)
    setStatus('Pedal held: braking.')
    pressPedal(store)
  }
  const release = () => {
    if (!heldRef.current) return
    heldRef.current = false
    setHeld(false)
    const finished = store.getState().progress >= 1
    releasePedal(store)
    setStatus(finished ? 'Stopped.' : 'Pedal released: paused. Hold again to carry on braking.')
  }

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    press()
  }
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== ' ' && e.key !== 'Enter') return
    e.preventDefault()
    if (!e.repeat) press()
  }
  const onKeyUp = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== ' ' && e.key !== 'Enter') return
    e.preventDefault()
    release()
  }

  return (
    <>
      <button
        type="button"
        aria-pressed={held}
        aria-describedby={hintId}
        onPointerDown={onPointerDown}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={release}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onBlur={release}
        onContextMenu={(e) => e.preventDefault()}
        className={cn(
          'relative inline-flex min-h-10 pointer-coarse:min-h-12 touch-none items-center gap-2 overflow-hidden rounded-lg border px-3 text-sm font-medium transition-colors select-none [-webkit-touch-callout:none]',
          held ? 'border-amber/70 bg-amber/15 text-paper' : 'border-amber/40 bg-graphite-850 text-paper hover:border-amber/70',
        )}
        data-testid="brake-pedal-button"
      >
        {/* Pedal travel meter (written per frame). */}
        <span className="relative h-5 w-1.5 overflow-hidden rounded-full bg-white/[0.08]" aria-hidden>
          <span ref={fill} className="absolute inset-0 origin-bottom scale-y-0 bg-amber" />
        </span>
        Hold to brake
      </button>
      <span id={hintId} className="sr-only">
        Press and hold (mouse, touch, Space or Enter). The stop plays while you hold the pedal; letting go pauses it.
      </span>
      <span className="sr-only" role="status">
        {status}
      </span>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Surface and ABS                                                      */
/* ------------------------------------------------------------------ */

function SurfacePicker({ value }: { value: SurfaceId }) {
  const store = useLabStoreApi()
  const name = useId()
  return (
    <fieldset className="flex items-center gap-1.5">
      <legend className="sr-only">Road surface</legend>
      <span className="eyebrow max-sm:sr-only" aria-hidden>
        Road
      </span>
      <div className="flex rounded-lg border border-white/[0.08] bg-graphite-900/70 p-0.5">
        {SURFACE_IDS.map((id) => (
          <label key={id} className="relative" title={SURFACES[id].label}>
            <input
              type="radio"
              name={name}
              value={id}
              checked={value === id}
              onChange={() => setBrakingParam(store, PARAM.surface, id)}
              className="peer sr-only"
              aria-label={SURFACES[id].label}
            />
            <span
              className={cn(
                'relative hit-area flex min-h-9 min-w-10 pointer-coarse:min-w-12 cursor-pointer items-center justify-center rounded-md px-2 text-xs transition-colors',
                'peer-focus-visible:ring-2 peer-focus-visible:ring-cyan',
                value === id ? 'bg-cyan/15 text-cyan' : 'text-steel-300 hover:text-paper',
              )}
            >
              {SURFACE_SHORT[id]}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function AbsToggle({ value }: { value: boolean }) {
  const store = useLabStoreApi()
  const id = useId()
  return (
    <div className="flex min-h-9 items-center gap-2">
      <label htmlFor={id} className="cursor-pointer text-xs font-medium text-steel-300">
        ABS
      </label>
      <Switch id={id} checked={value} onCheckedChange={(v) => setBrakingParam(store, PARAM.abs, v)} aria-describedby={`${id}-note`} />
      <span id={`${id}-note`} className="sr-only">
        Conceptual anti-lock braking demonstration.
      </span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Sliders                                                              */
/* ------------------------------------------------------------------ */

function ParamSlider({
  label,
  unit,
  value,
  range,
  paramKey,
  hint,
}: {
  label: string
  unit: string
  value: number
  range: { min: number; max: number; step: number }
  paramKey: string
  hint: ReactNode
}) {
  const store = useLabStoreApi()
  const id = useId()
  return (
    <div className="flex min-h-9 items-center gap-2.5">
      <label htmlFor={id} className="w-[5.5rem] shrink-0 text-xs text-steel-300">
        {label}
        <span className="block font-mono text-[11px] tabular-nums text-paper">
          {value} {unit}
        </span>
      </label>
      <input
        id={id}
        type="range"
        min={range.min}
        max={range.max}
        step={range.step}
        value={value}
        onChange={(e) => setBrakingParam(store, paramKey, Number(e.target.value))}
        aria-valuetext={`${value} ${unit}`}
        aria-describedby={`${id}-hint`}
        className="h-9 min-w-0 flex-1 cursor-pointer accent-[var(--cyan)]"
      />
      <span id={`${id}-hint`} className="sr-only">
        {hint}
      </span>
    </div>
  )
}
