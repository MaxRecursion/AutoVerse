/*
 * Adapted from Watermelon UI "onboarding-checklist" (MIT), see
 * THIRD_PARTY_NOTICES.md: a collapsible card whose header shows progress as
 * segments, over a list of first steps. The steps and their evidence are
 * AutoVerse's own (checklist.ts); nothing here ticks anything itself.
 */
import { useId, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, Check, ChevronDown, X } from 'lucide-react'
import { Link } from 'react-router'
import { topicHref } from '@/components/learning/labels'
import { Button } from '@/components/ui/button'
import { useStartTour } from '@/features/tour/useStartTour'
import { getTopic, learningPaths, topics } from '@/lib/content'
import { cn } from '@/lib/utils'
import { usePreferences } from '@/stores/preferences'
import { useProgress } from '@/stores/progress'
import { resolveNextUp } from './curriculum'
import { gettingStartedDone, gettingStartedSteps, type GettingStartedId } from './checklist'

/**
 * The first things worth doing, with where to do each. On the home page it
 * can be hidden (and goes away by itself once everything is done); on the
 * progress page it stays, folded away when complete.
 */
export function GettingStarted({ variant }: { variant: 'home' | 'page' }) {
  const bodyId = useId()
  const startTour = useStartTour()
  const tourStatus = usePreferences((p) => p.tourStatus)
  const dismissed = usePreferences((p) => p.checklistDismissed)
  const setDismissed = usePreferences((p) => p.setChecklistDismissed)
  const recent = useProgress((s) => s.recent)
  const lessons = useProgress((s) => s.lessons)
  const quizScores = useProgress((s) => s.quizScores)
  const completed = useProgress((s) => s.completed)
  const certificates = useProgress((s) => s.certificates)

  const steps = useMemo(
    () => gettingStartedSteps({ tourStatus, recent, lessons, quizScores, completed, certificates }),
    [tourStatus, recent, lessons, quizScores, completed, certificates],
  )
  const count = gettingStartedDone(steps)
  const allDone = count === steps.length
  // Open while there is something to do; the learner can fold it away.
  const [open, setOpen] = useState(!allDone)

  const next = useMemo(() => resolveNextUp({ topics, paths: learningPaths, completed, recent, getTopic }), [completed, recent])
  const lessonHref = next.topic ? topicHref(next.topic) : '/learn'
  const labLesson = topics.find((t) => t.labId)
  const where: Record<GettingStartedId, { to?: string; label: string; onClick?: () => void }> = {
    tour: { label: 'Show me around', onClick: startTour },
    lesson: { to: lessonHref, label: 'Open a lesson' },
    lab: { to: labLesson ? topicHref(labLesson) : '/labs', label: 'Open a lab lesson' },
    quiz: { to: lessonHref, label: 'Go to a lesson' },
    finish: { to: lessonHref, label: 'Go to a lesson' },
    certificate: { to: '/progress#certificates', label: 'See courses' },
  }

  if (variant === 'home' && (dismissed || allDone)) return null

  return (
    <section aria-labelledby={`${bodyId}-title`} data-testid="getting-started" className="panel overflow-hidden">
      <div className="flex items-center gap-2 p-1.5 sm:p-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={bodyId}
          className="relative hit-area flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-lg px-3 text-left outline-none transition-colors hover:bg-white/[0.03] focus-visible:ring-2 focus-visible:ring-cyan"
        >
          <ChevronDown aria-hidden className={cn('size-5 shrink-0 text-steel-400 transition-transform duration-300', open && 'rotate-180')} />
          <span className="min-w-0">
            <span id={`${bodyId}-title`} className="block font-display text-base font-semibold text-paper sm:text-lg">
              Getting started
            </span>
            <span className="block text-xs text-steel-400">{allDone ? 'All done. Nice work.' : 'Six first steps, ticked as you do them.'}</span>
          </span>
          {/* Progress as segments: they fill in as steps are done. */}
          <span aria-hidden className="ml-auto flex shrink-0 items-center gap-1">
            {steps.map((s) => (
              <span key={s.id} className={cn('h-2 w-4 rounded-full transition-colors duration-500 sm:w-6', s.done ? 'bg-ok' : 'bg-white/10')} />
            ))}
          </span>
          <span className="shrink-0 font-mono text-xs tabular-nums text-steel-300">
            <span className="sr-only">{count} of {steps.length} done</span>
            <span aria-hidden>
              {count}/{steps.length}
            </span>
          </span>
        </button>
        {variant === 'home' && (
          <Button variant="ghost" size="icon" className="relative hit-area shrink-0 text-steel-400" aria-label="Hide Getting started" onClick={() => setDismissed(true)}>
            <X aria-hidden />
          </Button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={bodyId}
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 34 }}
            className="overflow-hidden"
          >
            <ol className="flex flex-col gap-0.5 border-t border-white/[0.06] p-2 sm:p-3">
              {steps.map((s, i) => {
                const go = where[s.id]
                return (
                  <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-2">
                    <span
                      aria-hidden
                      className={cn('grid size-6 shrink-0 place-items-center rounded-full font-mono text-[11px]', s.done ? 'bg-ok/20 text-ok' : 'border border-white/15 text-steel-300')}
                    >
                      {s.done ? <Check className="size-3.5" /> : i + 1}
                    </span>
                    <span className="min-w-0 flex-1 basis-48">
                      <span className={cn('block text-sm font-medium', s.done ? 'text-steel-400' : 'text-paper')}>
                        {s.label}
                        {s.done && <span className="sr-only"> (done)</span>}
                      </span>
                      {!s.done && <span className="block text-xs text-steel-400">{s.hint}</span>}
                    </span>
                    {!s.done &&
                      (go.to ? (
                        <Button asChild variant="outline" size="sm" className="relative hit-area">
                          <Link to={go.to}>
                            {go.label} <ArrowRight aria-hidden />
                          </Link>
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" className="relative hit-area" onClick={go.onClick}>
                          {go.label} <ArrowRight aria-hidden />
                        </Button>
                      ))}
                  </li>
                )
              })}
            </ol>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
