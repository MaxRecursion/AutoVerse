import { ArrowRight, Award, Box, Check, Circle } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { getCourses } from '@/features/certificate/award'
import { useProgress } from '@/stores/progress'
import type { NextUp } from '@/features/progress/curriculum'
import type { Stage, StageSummary } from '@/features/progress/stages'
import type { Topic } from '@/lib/schemas'
import { cn } from '@/lib/utils'
import { LessonActions } from './LessonHeader'
import { topicHref } from './labels'

/** End-of-lesson card: what was covered, finish, and exactly where to go next. */
export function LessonFinish({
  topic,
  stages,
  summary,
  complete,
  next,
  onFinish,
}: {
  topic: Topic
  stages: readonly Stage[]
  summary: StageSummary
  complete: boolean
  next: NextUp
  onFinish: () => void
}) {
  const target = next.topic && next.topic.id !== topic.id ? next.topic : undefined
  const held = useProgress((s) => s.certificates)
  const certificates = getCourses().filter((c) => held[c.id] && c.topics.some((t) => t.id === topic.id))
  const heading = complete ? 'Lesson complete' : summary.ready ? 'Ready to finish' : 'Almost there'
  return (
    <section id="finish" aria-labelledby="finish-heading" className="panel scroll-mt-28 p-5 sm:p-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="min-w-0">
          <h2 id="finish-heading" className="text-xl font-semibold">
            {heading}
          </h2>
          <ul className="mt-3 flex flex-col gap-1.5">
            {stages.map((s) => (
              <li key={s.id} className="flex items-start gap-2.5 text-sm">
                {s.done ? <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-ok" /> : <Circle aria-hidden className="mt-0.5 size-4 shrink-0 text-steel-500" />}
                <span className={cn(s.done ? 'text-steel-300' : 'text-paper')}>
                  <span className="font-medium">{s.label}</span>
                  {s.optional && <span className="text-steel-500"> (optional)</span>}
                  <span className="text-steel-400"> — {s.detail}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            {!complete && (
              <Button className="h-10" variant={summary.ready ? 'default' : 'outline'} onClick={onFinish}>
                {summary.ready ? 'Finish lesson' : 'Mark complete anyway'}
              </Button>
            )}
            <LessonActions topicId={topic.id} showComplete={complete} />
          </div>
          <p className="mt-3 text-xs text-steel-500">Progress is stored only in this browser — there is no account.</p>
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          {target ? (
            <Link
              to={topicHref(target)}
              className="group flex min-h-16 items-center gap-3 rounded-xl border border-white/[0.08] px-4 py-3 transition-colors hover:border-cyan/40"
            >
              <span className="min-w-0">
                <span className="eyebrow block">{next.label}</span>
                <span className="block truncate font-medium text-paper group-hover:text-cyan">{target.title}</span>
                {next.route && (
                  <span className="block truncate text-xs text-steel-400">
                    {next.route.title} · {next.route.completed} of {next.route.topics.length} done
                  </span>
                )}
              </span>
              {target.labId ? <Box aria-hidden className="ml-auto size-4 shrink-0 text-cyan" /> : null}
              <ArrowRight aria-hidden className={cn('size-4 shrink-0 text-steel-400 group-hover:text-cyan', !target.labId && 'ml-auto')} />
            </Link>
          ) : (
            <p className="rounded-xl border border-ok/30 bg-ok/[0.06] p-4 text-sm text-ok">You have finished everything on this route.</p>
          )}
          {certificates.map((c) => (
            <Link
              key={c.id}
              to={`/certificate/${c.id}`}
              className="flex min-h-11 items-center gap-2.5 rounded-xl border border-amber/30 bg-amber/[0.05] px-4 py-2.5 text-sm text-amber hover:border-amber/60"
            >
              <Award aria-hidden className="size-4 shrink-0" />
              <span>
                Certificate earned: <span className="font-medium">{c.title}</span>
              </span>
            </Link>
          ))}
          {next.skipped.length > 0 && (
            <p className="text-xs leading-relaxed text-steel-400">
              Earlier in this route you skipped{' '}
              {next.skipped.map((t, i) => (
                <span key={t.id}>
                  {i > 0 && ', '}
                  <Link to={topicHref(t)} className="text-cyan underline-offset-4 hover:underline">
                    {t.title}
                  </Link>
                </span>
              ))}
              .
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
