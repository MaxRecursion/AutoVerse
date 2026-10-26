import { useRef, useState, type PointerEvent } from 'react'
import { ChevronUp } from 'lucide-react'
import { useLab } from '@/components/three/LabContext'
import { cn } from '@/lib/utils'
import { readView } from './explorerConfig'
import { BodyFadeControl } from './ExplorerControls'
import { ExplorerPanel } from './ExplorerPanel'
import { getExplorerSystem } from './explorerSystems'

/** Vertical drag (px) on the handle that counts as a swipe. */
const SWIPE = 28

/**
 * Phone / small-tablet panel: a bottom sheet under the canvas (not over it,
 * so the framed car stays fully visible). Collapsed it shows the heading and
 * the start of the panel; expanded it gives the panel most of the height.
 * Choosing a system does not expand it, so the newly framed system stays big.
 * Toggle with the handle button (tap, Enter / Space) or swipe it.
 */
export function MobileSheet() {
  const [expanded, setExpanded] = useState(false)
  const system = useLab((s) => readView(s.params).system)
  const drag = useRef<{ y: number; moved: boolean } | null>(null)


  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    drag.current = { y: e.clientY, moved: false }
  }
  const onPointerUp = (e: PointerEvent<HTMLButtonElement>) => {
    const start = drag.current
    if (!start) return
    const dy = e.clientY - start.y
    if (dy < -SWIPE) setExpanded(true)
    else if (dy > SWIPE) setExpanded(false)
    if (Math.abs(dy) > SWIPE) start.moved = true
  }

  const title = system ? getExplorerSystem(system).name : 'Vehicle systems'

  return (
    <div
      className={cn(
        'relative z-30 flex shrink-0 flex-col rounded-t-2xl border-t border-white/10 bg-graphite-900/95 shadow-[0_-12px_32px_-12px_rgba(0,0,0,0.6)]',
        expanded ? 'h-[68%]' : 'h-[40%]',
      )}
      data-testid="explorer-sheet"
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls="explorer-sheet-body"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onClick={() => {
          // A swipe already decided; a plain tap toggles.
          if (drag.current?.moved) {
            drag.current = null
            return
          }
          drag.current = null
          setExpanded((v) => !v)
        }}
        className="flex min-h-11 w-full touch-none flex-col items-center gap-1 rounded-t-2xl px-4 pb-1 pt-2 focus-visible:outline-2 focus-visible:outline-cyan"
      >
        <span aria-hidden className="h-1 w-10 rounded-full bg-steel-500/60" />
        <span className="flex w-full items-center justify-between gap-2 text-xs text-steel-300">
          <span className="truncate font-medium text-paper">{title}</span>
          <span className="inline-flex shrink-0 items-center gap-1">
            {expanded ? 'Less' : 'More'}
            <ChevronUp aria-hidden className={cn('size-4 transition-transform', expanded && 'rotate-180')} />
          </span>
        </span>
      </button>
      <div id="explorer-sheet-body" className="flex min-h-0 flex-1 flex-col pb-[env(safe-area-inset-bottom)]">
        <BodyFadeControl id="body-fade-mobile" className="border-b border-white/[0.06] px-4 pb-1" />
        <ExplorerPanel compact className="min-h-0 flex-1" />
      </div>
    </div>
  )
}
