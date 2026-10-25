import { useId, useRef, type KeyboardEvent } from 'react'
import { Pause, Play } from 'lucide-react'
import { Slider as SliderPrimitive } from 'radix-ui'
import { useLabStoreApi } from '@/components/three/LabContext'
import { cn } from '@/lib/utils'
import { PARAM } from './config'
import { ENGINE_RPM, GEARS, clutchState, gearRatio, type GearId } from './gearbox'
import { GEAR_NAME, clutchPedalText, clutchShortLabel, formatRatio, formatRpm } from './gearboxText'
import { useTransmissionParams } from './useTransmission'

/**
 * Shift-gate positions (column, row) of the classic five-speed H pattern with
 * reverse beside 5th: 1 3 5 on top, 2 4 R below, neutral on the cross-gate.
 */
const GATE: Record<GearId, { col: 1 | 2 | 3; row: 1 | 2 | 3 }> = {
  '1': { col: 1, row: 1 },
  '3': { col: 2, row: 1 },
  '5': { col: 3, row: 1 },
  N: { col: 2, row: 2 },
  '2': { col: 1, row: 3 },
  '4': { col: 2, row: 3 },
  R: { col: 3, row: 3 },
}

/** Shortcut keys inside the gear selector. */
const KEY_TO_GEAR: Record<string, GearId> = { n: 'N', '0': 'N', '1': '1', '2': '2', '3': '3', '4': '4', '5': '5', r: 'R' }

/**
 * Gear selector: an accessible radio group laid out as a shift gate. Arrow
 * keys move through N → 1 … 5 → R (selection follows focus, as in any radio
 * group), Home / End jump to the ends, and N, R or a digit selects directly.
 */
export function ShiftGate({ value, onChange, className }: { value: GearId; onChange: (g: GearId) => void; className?: string }) {
  const buttons = useRef<Partial<Record<GearId, HTMLButtonElement | null>>>({})
  const labelId = useId()

  const choose = (g: GearId) => {
    onChange(g)
    buttons.current[g]?.focus()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = GEARS.indexOf(value)
    let next: GearId | undefined
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = GEARS[(i + 1) % GEARS.length]
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        next = GEARS[(i - 1 + GEARS.length) % GEARS.length]
        break
      case 'Home':
        next = GEARS[0]
        break
      case 'End':
        next = GEARS[GEARS.length - 1]
        break
      default:
        next = KEY_TO_GEAR[e.key.toLowerCase()]
    }
    if (!next) return
    e.preventDefault()
    choose(next)
  }

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <span id={labelId} className="eyebrow text-[10px]">
        Gear
      </span>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        onKeyDown={onKeyDown}
        className="relative grid grid-cols-[repeat(3,2.25rem)] grid-rows-[repeat(3,2.25rem)] gap-x-2 gap-y-0.5"
        data-testid="shift-gate"
      >
        {/* The gate itself: three slots joined by the cross-gate. */}
        <svg className="pointer-events-none absolute inset-0 size-full text-white/[0.12]" aria-hidden>
          {[1, 2, 3].map((col) => {
            const x = `${((col - 0.5) / 3) * 100}%`
            return <line key={col} x1={x} x2={x} y1="16%" y2="84%" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
          })}
          <line x1="16%" x2="84%" y1="50%" y2="50%" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        </svg>
        {GEARS.map((g) => {
          const checked = g === value
          const ratio = gearRatio(g)
          return (
            <button
              key={g}
              ref={(el) => {
                buttons.current[g] = el
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={ratio === null ? GEAR_NAME[g] : `${GEAR_NAME[g]}, ratio ${formatRatio(ratio)}`}
              tabIndex={checked ? 0 : -1}
              onClick={() => choose(g)}
              style={{ gridColumn: GATE[g].col, gridRow: GATE[g].row }}
              className={cn(
                'relative z-10 flex size-9 items-center justify-center rounded-full border font-mono text-sm font-semibold transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan',
                checked
                  ? 'border-amber bg-amber text-graphite-950 shadow-[0_0_0_3px_rgb(246_166_58/0.25)]'
                  : 'border-white/15 bg-graphite-850 text-steel-300 hover:border-cyan/60 hover:text-paper',
              )}
            >
              {g}
            </button>
          )
        })}
      </div>
    </div>
  )
}

interface LabSliderProps {
  /** Accessible name and visible label. */
  label: string
  /** Visible label on phones, where the control deck is narrow (the accessible name stays `label`). */
  shortLabel?: string
  value: number
  min: number
  max: number
  step: number
  valueText: string
  /** Short visible value next to the label. */
  display: string
  onChange: (v: number) => void
  tone?: 'cyan' | 'amber'
  testId?: string
}

/** Labelled Radix slider: keyboard (arrows, Page Up / Down, Home / End), touch and a spoken value text. */
function LabSlider({ label, shortLabel, value, min, max, step, valueText, display, onChange, tone = 'cyan', testId }: LabSliderProps) {
  return (
    <div className="flex min-w-0 flex-col" data-testid={testId}>
      <div className="flex items-baseline justify-between gap-2">
        {/* Visual label only: the thumb carries the accessible name, so the phone-width short label cannot change it. */}
        <span className="eyebrow whitespace-nowrap text-[10px]" aria-hidden>
          {shortLabel ? (
            <>
              <span className="sm:hidden">{shortLabel}</span>
              <span className="max-sm:hidden">{label}</span>
            </>
          ) : (
            label
          )}
        </span>
        <span className={cn('truncate whitespace-nowrap font-mono text-[11px] tabular-nums', tone === 'amber' ? 'text-amber' : 'text-paper')}>{display}</span>
      </div>
      <SliderPrimitive.Root
        className="relative flex h-9 w-full touch-none select-none items-center"
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0])}
      >
        <SliderPrimitive.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-white/10">
          <SliderPrimitive.Range className={cn('absolute h-full', tone === 'amber' ? 'bg-amber' : 'bg-cyan')} />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          aria-label={label}
          aria-valuetext={valueText}
          className={cn(
            'block size-5 rounded-full border-2 bg-paper shadow transition-[box-shadow]',
            'focus-visible:outline-none focus-visible:ring-4',
            tone === 'amber' ? 'border-amber focus-visible:ring-amber/40' : 'border-cyan focus-visible:ring-cyan/40',
          )}
        />
      </SliderPrimitive.Root>
    </div>
  )
}

/** Gear selector, clutch pedal, engine speed and play / pause, overlaid at the bottom of the scene. */
export function TransmissionControls() {
  const store = useLabStoreApi()
  const p = useTransmissionParams()
  const set = (key: string, v: number | string | boolean) => store.getState().setParam(key, v)
  const state = clutchState(p.clutch)

  return (
    <div className="panel pointer-events-auto flex items-stretch gap-3 p-2 sm:gap-4 sm:p-3" data-testid="transmission-controls">
      <ShiftGate value={p.gear} onChange={(g) => set(PARAM.gear, g)} className="shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
        <LabSlider
          label="Clutch pedal"
          value={p.clutch}
          min={0}
          max={1}
          step={0.01}
          display={clutchShortLabel(p.clutch)}
          valueText={clutchPedalText(p.clutch)}
          tone={state === 'engaged' ? 'cyan' : 'amber'}
          onChange={(v) => set(PARAM.clutch, Math.round(v * 100) / 100)}
          testId="clutch-slider"
        />
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <LabSlider
              label="Engine speed"
              shortLabel="Engine"
              value={p.rpm}
              min={ENGINE_RPM.min}
              max={ENGINE_RPM.max}
              step={ENGINE_RPM.step}
              display={formatRpm(p.rpm)}
              valueText={`${formatRpm(p.rpm)} engine speed`}
              onChange={(v) => set(PARAM.rpm, v)}
              testId="rpm-slider"
            />
          </div>
          <button
            type="button"
            onClick={() => set(PARAM.running, !p.running)}
            aria-label={p.running ? 'Pause shaft rotation' : 'Play shaft rotation'}
            className={cn(
              'mb-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan',
              p.running ? 'border-white/15 text-paper hover:border-cyan/60' : 'border-cyan/60 bg-cyan/15 text-cyan',
            )}
          >
            {p.running ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
          </button>
        </div>
      </div>
    </div>
  )
}
