import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'
import { useLab, useLabStoreApi } from './LabContext'

/**
 * Timeline transport shared by all labs: play/pause, restart, step, speed and
 * a scrub bar with cue markers. All actions go through the lab store, so the
 * scene, readouts and explanations stay on one time parameter.
 */
export function AnimationControls({ className }: { className?: string }) {
  const store = useLabStoreApi()
  const config = useLab((s) => s.config)
  const playing = useLab((s) => s.playing)
  const progress = useLab((s) => s.progress)
  const speed = useLab((s) => s.speed)
  const s = store.getState()
  const readout = config.formatProgress?.(progress) ?? `${Math.round(progress * 100)}%`

  return (
    <div className={cn('panel flex flex-col gap-2 px-3 py-2.5', className)} role="group" aria-label="Animation controls">
      <div className="relative">
        <Slider
          value={[progress]}
          min={0}
          max={1}
          step={0.001}
          onValueChange={([v]) => s.seek(v ?? 0)}
          onPointerDown={() => s.pause()}
          aria-label="Animation progress"
        />
        <div className="pointer-events-none absolute inset-x-0 top-full mt-1 h-3" aria-hidden>
          {config.cues
            .filter((c) => c.progress !== undefined)
            .map((c) => (
              <span key={c.id} className="absolute h-1.5 w-px bg-steel-500" style={{ left: `${(c.progress ?? 0) * 100}%` }} />
            ))}
        </div>
      </div>
      {/* One row at every width (phones included), so the transport never steals a second row from the scene. */}
      <div className="mt-1 flex items-center gap-1.5">
        <Button size="icon" variant="ghost" onClick={() => s.stepBy(-1)} aria-label="Step backward">
          <ChevronLeft />
        </Button>
        <Button size="icon" onClick={() => s.toggle()} aria-label={playing ? 'Pause' : 'Play'} aria-pressed={playing}>
          {playing ? <Pause /> : <Play />}
        </Button>
        <Button size="icon" variant="ghost" onClick={() => s.stepBy(1)} aria-label="Step forward">
          <ChevronRight />
        </Button>
        <Button size="icon" variant="ghost" onClick={() => s.restart()} aria-label="Restart">
          <RotateCcw />
        </Button>
        {/* Shrinks first; on a narrow row a long readout ("400° · Compression") wraps onto two short lines within the row height. */}
        <span
          className="annotation ml-1 min-w-0 flex-1 break-words leading-tight tabular-nums sm:min-w-24 sm:flex-none"
          aria-live="off"
          data-testid="progress-readout"
        >
          {readout}
        </span>
        {/* Phones: a compact button that steps through the speeds, so the transport fits one row. */}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-9 min-w-9 shrink-0 px-1.5 font-mono text-xs tabular-nums sm:hidden"
          onClick={() => s.setSpeed(nextSpeed(config.speeds, speed))}
          aria-label={`Playback speed ${speed}×, change`}
        >
          {speed}×
        </Button>
        <label className="ml-auto flex shrink-0 items-center gap-1.5 max-sm:hidden">
          <span className="eyebrow">Speed</span>
          <select
            className="h-8 rounded-md border border-input bg-graphite-850 px-2 font-mono text-xs"
            value={speed}
            onChange={(e) => s.setSpeed(Number(e.target.value))}
            aria-label="Playback speed"
          >
            {config.speeds.map((v) => (
              <option key={v} value={v}>
                {v}×
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  )
}

/** The next playback speed in the list, wrapping round (an unlisted speed starts from the first). */
function nextSpeed(speeds: readonly number[], current: number): number {
  if (!speeds.length) return current
  const i = speeds.indexOf(current)
  return speeds[(i + 1) % speeds.length]
}
