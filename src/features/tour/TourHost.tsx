import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, ArrowRight, X } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router'
import { topicHref } from '@/components/learning/labels'
import { Button } from '@/components/ui/button'
import { resolveNextUp } from '@/features/progress/curriculum'
import { useIsMobile, usePrefersReducedMotion } from '@/hooks/useMediaQuery'
import { getTopic, learningPaths, topics } from '@/lib/content'
import { cn } from '@/lib/utils'
import { useProgress } from '@/stores/progress'
import { clampToViewport, padBox, placeCard, type Size } from './geometry'
import { TOUR_LENGTH, TOUR_STEPS } from './steps'
import { useTour, type TourOutcome } from './tourStore'
import { useTargetBox } from './useTargetBox'

const SPOT_PAD = 8
const CARD_WIDTH = 380

/** Renders nothing until the tour is started; the overlay's hooks only run while it is open. */
export function TourHost() {
  const active = useTour((s) => s.active)
  if (!active || typeof document === 'undefined') return null
  return createPortal(<TourOverlay />, document.body)
}

function TourOverlay() {
  const index = useTour((s) => s.index)
  const { next, back } = useTour.getState()
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  // The router's own location (no base path), kept in a ref so `close` stays stable.
  const here = useRef(`${pathname}${search}`)
  useEffect(() => {
    here.current = `${pathname}${search}`
  }, [pathname, search])
  const reduced = usePrefersReducedMotion()
  const narrow = useIsMobile()
  const step = TOUR_STEPS[index]!
  const last = index === TOUR_LENGTH - 1

  const cardRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [cardSize, setCardSize] = useState<Size | null>(null)
  const [viewport, setViewport] = useState<Size>({ width: window.innerWidth, height: window.innerHeight })

  /* -- Leave the tour: restore the page, the focus, and (unless asked otherwise) the learner's place. -- */
  const close = useCallback(
    (outcome: TourOutcome, to?: string) => {
      const { origin } = useTour.getState()
      useTour.getState().stop(outcome)
      const destination = to ?? (outcome === 'interrupted' ? null : origin)
      if (destination && destination !== here.current) navigate(destination)
    },
    [navigate],
  )

  /* -- Make the page behind inert: no clicks, no focus, hidden from screen readers; the dialog stays reachable. -- */
  useEffect(() => {
    const root = document.getElementById('root')
    const trigger = document.activeElement as HTMLElement | null
    root?.setAttribute('inert', '')
    return () => {
      root?.removeAttribute('inert')
      if (trigger && trigger.isConnected) trigger.focus({ preventScroll: true })
    }
  }, [])

  /* -- Take the learner to the step's page, and notice if they leave it by themselves. -- */
  const requested = useRef<string | null>(null)
  const arrivedAt = useRef<string | null>(null)
  useEffect(() => {
    if (!step.route) return
    if (pathname === step.route) {
      requested.current = null
      arrivedAt.current = step.route
      return
    }
    if (requested.current === step.route) return
    if (arrivedAt.current === step.route) {
      useTour.getState().stop('interrupted') // they used Back or a link: respect it
      return
    }
    requested.current = step.route
    navigate(step.route)
  }, [step.route, pathname, navigate])

  const onRoute = !step.route || pathname === step.route
  const selectors = [narrow ? step.narrowTarget : undefined, step.target, narrow ? undefined : step.narrowTarget].filter((s): s is string => !!s)
  const { status, box: targetBox } = useTargetBox(selectors, step.id, { enabled: onRoute && selectors.length > 0, reduced })

  /* -- Measure the card and the viewport so placement is exact. -- */
  useLayoutEffect(() => {
    const el = cardRef.current
    if (!el) return
    const measure = () => setCardSize({ width: el.offsetWidth, height: el.offsetHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [index, status])
  useEffect(() => {
    const onResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  /* -- Move focus to the new step's heading so it is announced; animate the spotlight for a moment after each change. -- */
  const [settling, setSettling] = useState(false)
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
    if (reduced) return
    const start = requestAnimationFrame(() => setSettling(true))
    const end = setTimeout(() => setSettling(false), 420)
    return () => {
      cancelAnimationFrame(start)
      clearTimeout(end)
    }
  }, [index, reduced])

  /* -- Keyboard: Esc leaves, arrows move, Tab stays inside the card. -- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close('skipped')
      } else if (e.key === 'ArrowRight' && !last) {
        e.preventDefault()
        next()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        back()
      } else if (e.key === 'Tab') {
        const focusable = cardRef.current?.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])')
        if (!focusable || focusable.length === 0) return
        const first = focusable[0]!
        const lastEl = focusable[focusable.length - 1]!
        if (e.shiftKey && (document.activeElement === first || document.activeElement === headingRef.current)) {
          e.preventDefault()
          lastEl.focus()
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close, next, back, last])

  const startLearning = () => {
    const { completed, recent } = useProgress.getState()
    const target = resolveNextUp({ topics, paths: learningPaths, completed, recent, getTopic }).topic
    close('completed', target ? topicHref(target) : '/learn')
  }

  const spot = targetBox ? clampToViewport(padBox(targetBox, SPOT_PAD), viewport) : null
  const placement = placeCard(spot, cardSize ?? { width: CARD_WIDTH, height: 240 }, viewport, { narrow })
  const waiting = status === 'waiting' || (!onRoute && selectors.length > 0)

  return (
    <div className="fixed inset-0 z-[80]" data-testid="tour">
      {/* Scrim: dims everything; the spotlight is a transparent hole cut by a very large shadow. */}
      {spot ? (
        <div
          data-testid="tour-spotlight"
          aria-hidden
          className={cn('pointer-events-none absolute rounded-xl border border-cyan/60', settling && 'transition-[top,left,width,height] duration-300 ease-out')}
          style={{ top: spot.top, left: spot.left, width: spot.width, height: spot.height, boxShadow: '0 0 0 100vmax rgb(4 5 7 / 0.76)' }}
        >
          <span aria-hidden className="absolute inset-0 rounded-xl motion-safe:animate-[tour-pulse_2.2s_ease-out_infinite]" />
        </div>
      ) : (
        <div aria-hidden className="absolute inset-0 bg-[rgb(4_5_7/0.78)] backdrop-blur-[2px]" />
      )}

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        data-placement={placement.placement}
        className={cn(
          'panel absolute flex flex-col gap-3 border-cyan/30 p-4 shadow-2xl sm:p-5',
          cardSize ? 'opacity-100' : 'opacity-0',
          !reduced && settling && 'transition-[top,left] duration-300 ease-out',
        )}
        style={{ top: placement.top, left: placement.left, width: placement.width }}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="eyebrow text-cyan">
            {step.chapter} · {index + 1} of {TOUR_LENGTH}
          </p>
          <button
            type="button"
            onClick={() => close('skipped')}
            aria-label="Close the tour"
            className="-mr-1.5 -mt-1.5 grid size-9 shrink-0 place-items-center rounded-md text-steel-400 hover:bg-white/[0.06] hover:text-paper"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>

        <h2 id="tour-title" ref={headingRef} tabIndex={-1} className="text-xl font-semibold leading-tight text-paper outline-none">
          {step.title}
        </h2>
        <p id="tour-body" className="text-[15px] leading-relaxed text-steel-300">
          {step.body}
        </p>
        {step.tip && <p className="rounded-lg border border-white/[0.08] bg-graphite-900/70 px-3 py-2 text-[13px] leading-snug text-steel-300">{step.tip}</p>}
        {waiting && (
          <p className="text-xs text-steel-400" role="status">
            Getting this ready…
          </p>
        )}

        <ol className="flex items-center gap-1.5" aria-hidden>
          {TOUR_STEPS.map((s, i) => (
            <li key={s.id} className={cn('h-1 flex-1 rounded-full', i < index ? 'bg-cyan/60' : i === index ? 'bg-cyan' : 'bg-white/15')} />
          ))}
        </ol>

        <div className="flex flex-wrap items-center justify-between gap-2">
          {last ? (
            <span />
          ) : (
            <Button variant="ghost" size="sm" className="h-10 px-2 text-steel-300" onClick={() => close('skipped')}>
              Skip tour
            </Button>
          )}
          <div className="flex items-center gap-2">
            <Button variant="outline" className="h-10" onClick={back} disabled={index === 0}>
              <ArrowLeft aria-hidden /> Back
            </Button>
            {last ? (
              <>
                <Button variant="outline" className="h-10" onClick={() => close('completed')}>
                  Close
                </Button>
                <Button className="h-10" onClick={startLearning}>
                  Start learning <ArrowRight aria-hidden />
                </Button>
              </>
            ) : (
              <Button className="h-10" onClick={next}>
                Next <ArrowRight aria-hidden />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
