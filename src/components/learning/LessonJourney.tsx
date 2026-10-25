import { ArrowRight, CircleCheck, Route } from 'lucide-react'
import { Link } from 'react-router'
import { Progress } from '@/components/ui/progress'
import { displayPathTitle } from '@/features/home/homeData'
import type { PathProgress } from '@/features/progress/paths'
import type { Category, Topic } from '@/lib/schemas'
import { cn } from '@/lib/utils'
import { useProgress } from '@/stores/progress'
import { topicHref } from './labels'

/** Shows where this lesson sits in the learner's route and what follows it. */
export function LessonJourney({
  topic,
  category,
  routeTopics,
  path,
}: {
  topic: Topic
  category?: Category
  routeTopics: Topic[]
  path?: PathProgress
}) {
  const completed = useProgress((s) => s.completed)
  const currentIndex = routeTopics.findIndex((item) => item.id === topic.id)
  const next = routeTopics.slice(currentIndex + 1).find((item) => !completed[item.id])
  const isComplete = !!completed[topic.id]
  const completedCount = routeTopics.filter((item) => !!completed[item.id]).length
  const percent = routeTopics.length ? Math.round((completedCount / routeTopics.length) * 100) : 0
  const routeTitle = path ? displayPathTitle(path.path) : category?.title ?? 'Lesson sequence'
  const allComplete = routeTopics.length > 0 && completedCount === routeTopics.length

  return (
    <section aria-label="Your place in this learning route" className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-5 sm:p-5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {path ? <Route aria-hidden className="size-4 text-amber" /> : null}
          <p className="eyebrow">{path ? 'Your learning path' : 'Suggested lesson order'}</p>
          <span className="text-xs text-steel-500">·</span>
          <p className="text-xs text-steel-300">
            Step {currentIndex + 1} of {routeTopics.length}
          </p>
        </div>
        <p className="mt-1 font-medium text-paper">
          {routeTitle}
        </p>
        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-steel-300">
          <p aria-live="polite" aria-atomic="true">
            {allComplete
              ? path
                ? 'Learning path complete — every lesson is done.'
                : 'Sequence complete — every lesson is done.'
              : isComplete
                ? `Lesson complete · ${completedCount} of ${routeTopics.length} lessons done.`
                : `You’re on step ${currentIndex + 1}. Mark it complete when you’re finished.`}
          </p>
          <span className="shrink-0 font-mono tabular-nums">{percent}%</span>
        </div>
        <Progress value={percent} aria-label={`${routeTitle} progress`} className="mt-1.5 h-1.5 bg-graphite-700" />
      </div>
      {next ? (
        <Link
          to={topicHref(next)}
          className={cn(
            'group flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-white/[0.08] px-3 py-2 text-sm transition-colors hover:border-cyan/40',
            'sm:max-w-64',
          )}
        >
          <span className="min-w-0">
            <span className="eyebrow block">{isComplete ? 'Next lesson' : 'After this lesson'}</span>
            <span className="block truncate font-medium text-paper group-hover:text-cyan">{next.title}</span>
          </span>
          <ArrowRight aria-hidden className="size-4 shrink-0 text-steel-400 group-hover:text-cyan" />
        </Link>
      ) : allComplete ? (
        <span className="inline-flex min-h-11 shrink-0 items-center gap-2 text-sm text-ok">
          <CircleCheck aria-hidden className="size-4" /> {path ? 'Path complete' : 'Sequence complete'}
        </span>
      ) : null}
    </section>
  )
}
