import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { ChevronUp } from 'lucide-react'
import { animate, useMotionValue, type AnimationPlaybackControls } from 'motion/react'
import { useLab } from '@/components/three/LabContext'
import { usePrefersReducedMotion } from '@/hooks/useMediaQuery'
import { cn } from '@/lib/utils'
import { readView } from './explorerConfig'
import { BodyFadeControl } from './ExplorerControls'
import { ExplorerPanel } from './ExplorerPanel'
import { getExplorerSystem } from './explorerSystems'

/** Sheet heights as fractions of the explorer area (match the h-[40%] / h-[68%] classes). */
const DETENT = { collapsed: 0.4, expanded: 0.68 } as const
/** Finger travel (px) on the handle before a press counts as a drag rather than a tap. */
const TAP_SLOP = 6
/** Release speed (px/s) that counts as a flick: the sheet goes the way it was thrown, however far it moved. */
const FLICK = 500
/** Past either height the sheet follows the finger at this fraction, so the limit is felt. */
const RUBBER_BAND = 0.3
const SPRING = { type: 'spring', stiffness: 420, damping: 40 } as const

/**
 * Phone / small-tablet panel: a bottom sheet under the canvas (not over it,
 * so the framed car stays fully visible). Collapsed it shows the heading and
 * the start of the panel; expanded it gives the panel most of the height.
 * Choosing a system does not expand it, so the newly framed system stays big.
 *
 * The handle follows the finger and settles on a spring: towards the nearer
 * height, or the way it was flicked. Grabbing it mid-spring carries on from
 * where it is. A tap, Enter or Space on the handle still toggles it.
 */
export function MobileSheet() {
  const [expanded, setExpanded] = useState(false)
  const system = useLab((s) => readView(s.params).system)
  const reduced = usePrefersReducedMotion()
  const sheet = useRef<HTMLDivElement>(null)
  const height = useMotionValue(0)
  const spring = useRef<AnimationPlaybackControls | null>(null)
  const drag = useRef<{ y: number; start: number; moved: boolean } | null>(null)

  // While dragged or springing the height is this value in px; at rest the class (a share of the area) takes over again.
  useEffect(() => height.on('change', (v) => sheet.current?.style.setProperty('height', `${v}px`)), [height])

  const area = () => sheet.current?.parentElement?.clientHeight ?? 0
  const release = () => sheet.current?.style.removeProperty('height')

  /** Animate from the current height (and speed) to a detent. */
  const settle = (open: boolean, velocity = 0) => {
    setExpanded(open)
    spring.current?.stop()
    if (reduced) return release()
    spring.current = animate(height, area() * (open ? DETENT.expanded : DETENT.collapsed), { ...SPRING, velocity, onComplete: release })
  }

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    const el = sheet.current
    if (!el || e.button !== 0) return
    spring.current?.stop()
    const start = el.getBoundingClientRect().height
    height.jump(start)
    drag.current = { y: e.clientY, start, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    if (!d) return
    const dy = e.clientY - d.y
    if (!d.moved && Math.abs(dy) < TAP_SLOP) return
    d.moved = true
    const lo = area() * DETENT.collapsed
    const hi = area() * DETENT.expanded
    const raw = d.start - dy
    height.set(raw > hi ? hi + (raw - hi) * RUBBER_BAND : raw < lo ? lo - (lo - raw) * RUBBER_BAND : raw)
  }
  const onPointerUp = () => {
    const d = drag.current
    if (!d?.moved) return
    const velocity = height.getVelocity()
    const middle = (area() * (DETENT.collapsed + DETENT.expanded)) / 2
    settle(Math.abs(velocity) > FLICK ? velocity > 0 : height.get() > middle, velocity)
  }
  const onPointerCancel = () => {
    if (drag.current?.moved) settle(expanded)
    drag.current = null
  }

  const title = system ? getExplorerSystem(system).name : 'Vehicle systems'

  return (
    <div
      ref={sheet}
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
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClick={() => {
          // A drag already decided; a plain tap (or Enter / Space) toggles.
          const dragged = drag.current?.moved
          drag.current = null
          if (dragged) return
          const el = sheet.current
          if (el) height.jump(el.getBoundingClientRect().height)
          settle(!expanded)
        }}
        className="flex min-h-11 pointer-coarse:min-h-12 w-full touch-none flex-col items-center gap-1 rounded-t-2xl px-4 pb-1 pt-2 focus-visible:outline-2 focus-visible:outline-cyan"
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
