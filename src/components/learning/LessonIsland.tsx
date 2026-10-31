/*
 * The lesson's sticky "island": where you are, what is next, and the outline.
 * Adapted from Watermelon UI "scroll-island" and "step-indicator" (MIT), see
 * THIRD_PARTY_NOTICES.md: a progress ring that opens a panel, and stages joined
 * by a line that fills as they are done. Built on Radix Popover and plain
 * buttons, so keyboard, focus and screen readers behave like any dialog-less
 * disclosure.
 */
import { useEffect, useRef, useState } from 'react'
import { Check, CircleCheck } from 'lucide-react'
import { Popover as PopoverPrimitive } from 'radix-ui'
import { Button } from '@/components/ui/button'
import type { Stage, StageSummary } from '@/features/progress/stages'
import { useIsMobile, usePrefersReducedMotion } from '@/hooks/useMediaQuery'
import { cn } from '@/lib/utils'
import { jumpToSection } from './jumpToSection'
import { LevelToggle } from './LevelToggle'
import { ProgressRing } from './ProgressRing'
import { useActiveSection } from './useActiveSection'

export interface IslandSection {
  id: string
  title: string
}

interface LessonIslandProps {
  sections: readonly IslandSection[]
  stages: readonly Stage[]
  summary: StageSummary
  complete: boolean
  onFinish: () => void
}

/** Sticky bar under the site header: progress ring and outline, the stages, Finish, and the level switch. */
export function LessonIsland({ sections, stages, summary, complete, onFinish }: LessonIslandProps) {
  const mobile = useIsMobile()
  const reduced = usePrefersReducedMotion()
  const [open, setOpen] = useState(false)
  // Where to go once the panel has closed (focus is moved then, not handed back to the ring).
  const jumpTo = useRef<string | null>(null)
  const navRef = useRef<HTMLElement>(null)
  const active = useActiveSection(sections.map((s) => s.id))
  const percent = summary.coreTotal ? Math.round((summary.coreDone / summary.coreTotal) * 100) : 0
  const next = complete ? undefined : summary.next

  // On a narrow screen the stage you are on may be scrolled out of the strip: bring it to the middle.
  useEffect(() => {
    const nav = navRef.current
    const chip = nav?.querySelector<HTMLElement>('[aria-current="true"]')
    if (!nav || !chip || typeof nav.scrollTo !== 'function') return
    nav.scrollTo({ left: Math.max(0, chip.offsetLeft - nav.clientWidth / 2 + chip.offsetWidth / 2), behavior: reduced ? 'auto' : 'smooth' })
  }, [next?.id, reduced])

  return (
    <div className="sticky top-14 z-30 border-y border-white/[0.06] bg-graphite-950/90 backdrop-blur-lg">
      <div className="mx-auto flex h-12 max-w-6xl items-center gap-2 px-4 sm:gap-3 sm:px-6">
        <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
          <PopoverPrimitive.Trigger asChild>
            <button
              type="button"
              aria-label={`Lesson progress and outline. ${summary.coreDone} of ${summary.coreTotal} core stages done.`}
              className="tactile relative hit-area grid size-10 shrink-0 place-items-center rounded-full border border-white/[0.1] bg-graphite-850 outline-none transition-colors hover:border-cyan/40 focus-visible:ring-2 focus-visible:ring-cyan data-[state=open]:border-cyan/50"
            >
              <ProgressRing percent={complete ? 100 : percent} size={32} stroke={3} barClassName={complete ? 'stroke-ok' : 'stroke-cyan'} />
              <span aria-hidden className={cn('absolute font-mono text-[10px] tabular-nums', complete ? 'text-ok' : 'text-steel-300')}>
                {complete ? <Check className="size-3.5" /> : `${summary.coreDone}/${summary.coreTotal}`}
              </span>
            </button>
          </PopoverPrimitive.Trigger>
          <PopoverPrimitive.Portal>
            <PopoverPrimitive.Content
              align="start"
              sideOffset={8}
              collisionPadding={12}
              onCloseAutoFocus={(e) => {
                const id = jumpTo.current
                jumpTo.current = null
                if (!id) return
                e.preventDefault()
                jumpToSection(id, reduced)
              }}
              className="glass z-[45] max-h-[min(34rem,calc(100dvh-8rem))] w-[min(calc(100vw-1.5rem),25rem)] origin-top-left overflow-y-auto rounded-2xl border border-white/10 p-4 outline-none data-[state=open]:animate-[island-in_170ms_ease-out]"
            >
              <p className="eyebrow">Lesson progress</p>
              <p className="mt-1 font-display text-lg text-paper">
                {complete ? 'Lesson complete' : summary.ready ? 'Ready to finish' : `${summary.coreDone} of ${summary.coreTotal} core stages done`}
              </p>
              <ul className="mt-3 flex flex-col gap-2">
                {stages.map((s, i) => (
                  <li key={s.id} className="flex items-start gap-2.5 text-sm">
                    <span
                      aria-hidden
                      className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full font-mono text-[10px]', s.done ? 'bg-ok/20 text-ok' : 'bg-white/[0.06] text-steel-300')}
                    >
                      {s.done ? <Check className="size-3" /> : i + 1}
                    </span>
                    <span className={s.done ? 'text-steel-400' : 'text-paper'}>
                      <span className="font-medium">{s.label}</span>
                      {s.optional && <span className="text-steel-500"> (optional)</span>}
                      <span className="block text-xs text-steel-400">{s.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="my-4 h-px bg-white/[0.08]" />
              <nav aria-label="On this page">
                <p className="eyebrow">On this page</p>
                <ol className="mt-2 flex flex-col">
                  {sections.map((s, i) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        aria-current={active === s.id ? 'location' : undefined}
                        onClick={() => {
                          jumpTo.current = s.id
                          setOpen(false)
                        }}
                        className={cn(
                          'relative hit-area flex min-h-9 w-full items-center gap-3 rounded-md px-2 text-left text-sm transition-colors hover:bg-white/[0.05]',
                          active === s.id ? 'bg-cyan/10 text-cyan' : 'text-steel-300 hover:text-paper',
                        )}
                      >
                        <span className="w-5 font-mono text-[11px] tabular-nums text-steel-500">{String(i + 1).padStart(2, '0')}</span>
                        {s.title}
                      </button>
                    </li>
                  ))}
                </ol>
              </nav>
            </PopoverPrimitive.Content>
          </PopoverPrimitive.Portal>
        </PopoverPrimitive.Root>

        <div className="flex min-w-0 flex-1 items-center gap-2" data-tour="stage-rail">
          <nav
            ref={navRef}
            aria-label="Lesson stages"
            className="track relative min-w-0 rounded-full border border-white/[0.07] bg-graphite-950/60 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden overflow-x-auto"
          >
            <ol className="flex w-max items-center gap-1 py-0.5 sm:gap-1.5">
              {stages.map((s, i) => {
                const isNext = !complete && summary.next?.id === s.id
                return (
                  <li key={s.id} className="flex shrink-0 items-center gap-1 sm:gap-1.5">
                    {i > 0 && (
                      // The line between two stages fills once the earlier one is done.
                      <span aria-hidden className={cn('hidden h-0.5 w-3 rounded-full transition-colors duration-500 lg:block', stages[i - 1]!.done ? 'bg-ok/60' : 'bg-white/15')} />
                    )}
                    <button
                      type="button"
                      onClick={() => jumpToSection(s.target, reduced)}
                      aria-current={isNext ? 'true' : undefined}
                      title={s.detail}
                      className={cn(
                        'relative hit-area flex min-h-9 items-center gap-1.5 rounded-full border px-1.5 text-xs transition-colors sm:px-2.5',
                        s.done
                          ? 'border-ok/35 bg-ok/[0.07] text-ok'
                          : isNext
                            ? 'tactile border-cyan/60 bg-cyan/10 text-cyan'
                            : 'border-white/10 text-steel-400 hover:border-white/25 hover:text-paper',
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn('grid size-5 shrink-0 place-items-center rounded-full font-mono text-[10px]', s.done ? 'bg-ok/20' : 'bg-white/[0.06]')}
                      >
                        {s.done ? <Check className="size-3" /> : i + 1}
                      </span>
                      {/* Visually hidden (never display:none) when narrow, so assistive tech always hears the stage name. */}
                      <span className={cn('whitespace-nowrap', !isNext && 'sr-only lg:not-sr-only')}>{s.label}</span>
                      <span className="sr-only">
                        {s.done ? ' — done' : isNext ? ' — next' : ''}
                        {s.optional ? ' (optional)' : ''}. {s.detail}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
          </nav>
          {complete ? (
            <span className="inline-flex min-h-9 shrink-0 items-center gap-1.5 text-xs text-ok">
              <CircleCheck aria-hidden className="size-4" />
              <span className="hidden sm:inline">Lesson complete</span>
              <span className="sr-only sm:hidden">Lesson complete</span>
            </span>
          ) : summary.ready ? (
            <Button size="sm" className="h-9 shrink-0" onClick={onFinish}>
              <CircleCheck aria-hidden /> Finish<span className="sr-only sm:not-sr-only"> lesson</span>
            </Button>
          ) : (
            <span className="hidden shrink-0 font-mono text-[11px] tabular-nums text-steel-400 xl:inline" aria-hidden>
              {summary.coreDone}/{summary.coreTotal} core
            </span>
          )}
        </div>
        <LevelToggle compact={mobile} className="shrink-0" />
      </div>
    </div>
  )
}
