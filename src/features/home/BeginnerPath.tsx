import { useMemo } from 'react'
import { ArrowRight, CircleCheck, Clock, Route } from 'lucide-react'
import { Link } from 'react-router'
import { DifficultyMeter } from '@/components/learning/TopicMeta'
import { DIFFICULTY_LABEL, topicHref } from '@/components/learning/labels'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { resolvePathProgress } from '@/features/progress/paths'
import { getTopic, learningPaths } from '@/lib/content'
import { cn } from '@/lib/utils'
import { useProgress } from '@/stores/progress'
import { HomeSection } from './HomeSection'
import { displayPathTitle, pickBeginnerPath, totalMinutes } from './homeData'

/** Homepage band: the curated beginner path as a numbered route, with local progress. */
export function BeginnerPath() {
  const completed = useProgress((s) => s.completed)
  const path = useMemo(() => pickBeginnerPath(learningPaths), [])
  const progress = useMemo(() => (path ? resolvePathProgress(path, getTopic, completed) : null), [path, completed])
  if (!path || !progress || progress.total === 0) return null

  const { topics: stops, next, missing, percent } = progress
  const started = progress.completed > 0
  const minutes = totalMinutes(stops)
  const title = displayPathTitle(path)

  return (
    <HomeSection id="path" eyebrow={`${DIFFICULTY_LABEL[path.level]} learning path`} title={title} description={path.summary}>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-8">
        <div className="panel flex flex-col gap-5 self-start p-5 lg:sticky lg:top-20">
          <dl className="grid grid-cols-2 gap-3">
            <div>
              <dt className="eyebrow">Lessons</dt>
              <dd className="mt-1 font-display text-2xl tabular-nums text-paper">{stops.length}</dd>
            </div>
            <div>
              <dt className="eyebrow">Reading time</dt>
              <dd className="mt-1 font-display text-2xl tabular-nums text-paper">
                ~{minutes}
                <span className="ml-1 text-sm text-steel-400">min</span>
              </dd>
            </div>
          </dl>
          <div>
            <div className="mb-1.5 flex justify-between text-xs text-steel-300">
              <span>
                {progress.completed} of {progress.total} completed
              </span>
              <span className="font-mono">{percent}%</span>
            </div>
            <Progress value={percent} aria-label={`${title} progress`} className="h-1.5 bg-graphite-700" />
          </div>
          {next ? (
            <Button asChild className="h-auto min-h-11 justify-start whitespace-normal py-2.5 text-left">
              <Link to={topicHref(next)}>
                <Route aria-hidden />
                <span className="flex-1">
                  {started ? 'Continue with' : 'Start with'} {next.title}
                </span>
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          ) : (
            <Button asChild variant="outline" className="h-11">
              <Link to="/progress">
                <CircleCheck aria-hidden className="text-ok" />
                Path complete · review your progress
              </Link>
            </Button>
          )}
          {missing > 0 && (
            <p className="text-xs leading-relaxed text-steel-400">
              {missing === 1 ? 'One more lesson' : `${missing} more lessons`} on this path {missing === 1 ? 'is' : 'are'} still being written and will
              appear here when ready.
            </p>
          )}
        </div>

        <ol className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {stops.map((t, i) => {
            const done = !!completed[t.id]
            const isNext = next?.id === t.id
            return (
              <li key={t.id}>
                <Link
                  to={topicHref(t)}
                  aria-current={isNext ? 'step' : undefined}
                  className={cn(
                    'group panel flex h-full gap-3 p-4 transition-colors hover:border-cyan/35 hover:bg-graphite-850/90',
                    isNext && 'border-amber/35',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'grid size-9 shrink-0 place-items-center rounded-full border font-mono text-xs tabular-nums',
                      done ? 'border-ok/40 text-ok' : isNext ? 'border-amber/60 text-amber' : 'border-white/10 text-steel-400',
                    )}
                  >
                    {done ? <CircleCheck className="size-4" /> : String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="sr-only">Step {i + 1}: </span>
                    <span className="font-medium leading-snug text-paper transition-colors group-hover:text-cyan">{t.title}</span>
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-steel-400">
                      <DifficultyMeter difficulty={t.difficulty} className="text-[11px] text-steel-400" />
                      <span className="inline-flex items-center gap-1">
                        <Clock aria-hidden className="size-3.5" />
                        {t.estimatedDuration} min
                      </span>
                      {done && <span className="text-ok">Completed</span>}
                      {isNext && !done && <span className="text-amber">{started ? 'Up next' : 'Start here'}</span>}
                    </span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ol>
      </div>
    </HomeSection>
  )
}
