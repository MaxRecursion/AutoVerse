import type { ReactNode } from 'react'
import { DoorOpen, RotateCcw, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useLab, useLabStoreApi } from '@/components/three/LabContext'
import { cn } from '@/lib/utils'
import { P, VIEW_MODES, VIEW_MODE_HINT, VIEW_MODE_LABEL, isViewMode } from './explorerConfig'

// Styled by aria-checked: the tooltip trigger overrides the item's data-state.
const ITEM = 'h-9 px-3 text-xs aria-checked:bg-cyan/15 aria-checked:text-cyan'

/** Exterior / Cutaway / System focus. */
export function ViewModeSwitch({ className }: { className?: string }) {
  const store = useLabStoreApi()
  const mode = useLab((s) => s.params[P.mode])
  return (
    <ToggleGroup
      type="single"
      size="sm"
      variant="outline"
      value={typeof mode === 'string' ? mode : 'exterior'}
      onValueChange={(v) => isViewMode(v) && store.getState().setParam(P.mode, v)}
      aria-label="View mode"
      className={cn('panel bg-graphite-950/70', className)}
    >
      {VIEW_MODES.map((m) => (
        <Tooltip key={m}>
          <TooltipTrigger asChild>
            <ToggleGroupItem value={m} className={ITEM} aria-label={`${VIEW_MODE_LABEL[m]}: ${VIEW_MODE_HINT[m]}`}>
              {m === 'focus' ? (
                <>
                  <span className="sm:hidden">Focus</span>
                  <span className="max-sm:hidden">{VIEW_MODE_LABEL[m]}</span>
                </>
              ) : (
                VIEW_MODE_LABEL[m]
              )}
            </ToggleGroupItem>
          </TooltipTrigger>
          <TooltipContent>{VIEW_MODE_HINT[m]}</TooltipContent>
        </Tooltip>
      ))}
    </ToggleGroup>
  )
}

function ToolButton({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          aria-label={label}
          aria-pressed={active}
          onClick={onClick}
          className={cn('size-9 pointer-coarse:size-11', active && 'bg-cyan/15 text-cyan hover:bg-cyan/20 hover:text-cyan')}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** Labels, doors / clamshells and camera reset. */
export function SceneTools({ className }: { className?: string }) {
  const store = useLabStoreApi()
  const showLabels = useLab((s) => s.showLabels)
  const open = useLab((s) => s.params[P.open] === true)
  return (
    <div className={cn('panel flex items-center gap-0.5 p-1 pointer-coarse:gap-1 pointer-coarse:max-sm:flex-col', className)} role="toolbar" aria-label="Scene tools">
      <ToolButton label="Show names and hotspots" active={showLabels} onClick={() => store.getState().toggleLabels()}>
        <Tag />
      </ToolButton>
      <ToolButton label="Open doors and clamshells" active={open} onClick={() => store.getState().setParam(P.open, !open)}>
        <DoorOpen />
      </ToolButton>
      <ToolButton label="Reset camera" onClick={() => store.getState().resetCamera()}>
        <RotateCcw />
      </ToolButton>
    </div>
  )
}

/** Fades the body panels, glass and cabin (0–100 %). */
export function BodyFadeControl({ className, id = 'body-fade' }: { className?: string; id?: string }) {
  const store = useLabStoreApi()
  const fade = useLab((s) => Number(s.params[P.bodyFade]) || 0)
  const pct = Math.round(fade * 100)
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <label htmlFor={id} className="eyebrow shrink-0 text-steel-400">
        Body fade
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        step={5}
        value={pct}
        onChange={(e) => store.getState().setParam(P.bodyFade, Number(e.target.value) / 100)}
        aria-valuetext={`${pct}% faded`}
        className="h-9 min-w-24 flex-1 cursor-pointer accent-cyan"
      />
      <output htmlFor={id} className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-steel-300">
        {pct}%
      </output>
    </div>
  )
}
