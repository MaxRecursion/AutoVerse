import { useId, useState } from 'react'
import { ChevronDown, ChevronUp, SlidersHorizontal } from 'lucide-react'
import { useLabStoreApi } from '@/components/three/LabContext'
import { cn } from '@/lib/utils'
import { DAMPING_PRESETS, ROAD_INPUTS, SPRING_RATE_RANGE } from './quarterCar'
import { dampingLabel, formatHz, frequencies, roadLabel } from './suspensionText'
import { useSuspensionSettings } from './useSuspensionFrame'

/**
 * Test setup over the scene: road input, damper preset and spring rate. Every
 * control writes a lab parameter, so the 3D corner, readouts, chart and
 * lesson all switch to the new (precomputed) response together. On phones the
 * panel folds into a one-line summary to keep the scene visible.
 */
export function SuspensionControls() {
  const store = useLabStoreApi()
  const settings = useSuspensionSettings()
  const [open, setOpen] = useState(false)
  const bodyId = useId()
  const roadId = useId()
  const springId = useId()
  const set = (key: string, value: string | number) => store.getState().setParam(key, value)
  const hz = frequencies(settings.springRate).body

  return (
    <div className="panel pointer-events-auto px-3 py-2" role="group" aria-label="Test setup" data-testid="suspension-controls">
      <button
        type="button"
        className="relative hit-area flex min-h-9 w-full items-center gap-2 text-left sm:hidden"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((o) => !o)}
      >
        <SlidersHorizontal className="size-4 shrink-0 text-cyan" aria-hidden />
        <span className="eyebrow shrink-0">Setup</span>
        <span className="min-w-0 flex-1 truncate text-xs text-steel-300">
          {roadLabel(settings.road)} · {dampingLabel(settings.damping)} · {settings.springRate} N/mm
        </span>
        {open ? <ChevronDown className="size-4 shrink-0" aria-hidden /> : <ChevronUp className="size-4 shrink-0" aria-hidden />}
      </button>

      <div id={bodyId} className={cn('flex flex-wrap items-end gap-x-4 gap-y-2', open ? 'max-sm:mt-2' : 'max-sm:hidden')}>
        <div className="flex min-w-[8.5rem] flex-col gap-1">
          <label htmlFor={roadId} className="eyebrow">
            Road
          </label>
          <select
            id={roadId}
            className="h-9 rounded-md border border-input bg-graphite-850 px-2 text-sm text-paper"
            value={settings.road}
            onChange={(e) => set('road', e.target.value)}
          >
            {ROAD_INPUTS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <fieldset className="flex flex-col gap-1">
          <legend className="eyebrow mb-1">Damper</legend>
          <div className="flex rounded-md border border-input bg-graphite-850 p-0.5">
            {DAMPING_PRESETS.map((p) => (
              <label key={p.id} className="relative" title={p.summary}>
                <input
                  type="radio"
                  name={`${bodyId}-damping`}
                  value={p.id}
                  checked={settings.damping === p.id}
                  onChange={() => set('damping', p.id)}
                  className="peer sr-only"
                />
                <span
                  className={cn(
                    'flex h-9 cursor-pointer items-center whitespace-nowrap rounded px-2.5 text-xs font-medium transition-colors',
                    'text-steel-300 hover:text-paper peer-checked:bg-cyan/15 peer-checked:text-cyan',
                    'peer-focus-visible:ring-2 peer-focus-visible:ring-ring',
                  )}
                >
                  {p.label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex min-w-[11rem] flex-1 flex-col gap-1">
          <label htmlFor={springId} className="flex items-baseline justify-between gap-2">
            <span className="eyebrow">Spring rate</span>
            <output htmlFor={springId} className="font-mono text-[11px] tabular-nums text-paper">
              {settings.springRate} N/mm <span className="text-steel-400">· body {formatHz(hz)}</span>
            </output>
          </label>
          <input
            id={springId}
            type="range"
            min={SPRING_RATE_RANGE.min}
            max={SPRING_RATE_RANGE.max}
            step={SPRING_RATE_RANGE.step}
            value={settings.springRate}
            onChange={(e) => set('springRate', Number(e.target.value))}
            aria-valuetext={`${settings.springRate} newtons per millimetre`}
            className="h-9 w-full cursor-pointer accent-cyan"
          />
        </div>
      </div>
    </div>
  )
}
