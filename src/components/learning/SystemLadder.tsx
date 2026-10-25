import { Box, Check, Circle, CircleDot } from 'lucide-react'
import { Link } from 'react-router'
import { Progress } from '@/components/ui/progress'
import type { LadderRung } from '@/features/progress/curriculum'
import { lessonStatus, type LessonStatus as Status } from '@/features/progress/status'
import type { Topic } from '@/lib/schemas'
import { cn } from '@/lib/utils'
import { useProgress } from '@/stores/progress'
import { topicHref } from './labels'

const STATUS_LABEL: Record<Status, string> = { done: 'Completed', started: 'In progress', todo: 'Not started' }

/**
 * One system taught as a descent: each rung is a depth, each row a lesson with
 * its own status. The rung that holds the learner's next lesson is marked so
 * "where do I go?" never needs thinking about.
 */
export function SystemLadder({ rungs, nextId }: { rungs: readonly LadderRung[]; nextId?: string }) {
  const completed = useProgress((s) => s.completed)
  const lessons = useProgress((s) => s.lessons)

  return (
    <ol className="relative flex flex-col gap-8">
      {rungs.map((rung, i) => {
        const percent = Math.round((rung.completed / rung.topics.length) * 100)
        const done = rung.completed === rung.topics.length
        return (
          <li key={rung.layer.id} className="relative pl-11 sm:pl-14">
            {i < rungs.length - 1 && <span aria-hidden className="absolute bottom-[-2rem] left-[15px] top-9 w-px bg-white/[0.12] sm:left-[19px]" />}
            <span
              aria-hidden
              className={cn(
                'absolute left-0 top-0 grid size-8 place-items-center rounded-full border font-mono text-xs sm:size-10 sm:text-sm',
                done ? 'border-ok/50 bg-ok/10 text-ok' : 'border-cyan/50 bg-cyan/10 text-cyan',
              )}
            >
              {done ? <Check className="size-4" /> : i + 1}
            </span>
            <section aria-labelledby={`rung-${rung.layer.id}`}>
              <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 id={`rung-${rung.layer.id}`} className="text-xl font-semibold text-paper">
                  {rung.layer.label}
                </h3>
                <span className="eyebrow text-cyan">{rung.layer.action}</span>
                <span className="ml-auto font-mono text-xs text-steel-400">
                  {rung.completed}/{rung.topics.length} done
                </span>
              </header>
              <p className="mt-1 max-w-2xl text-sm text-steel-400">{rung.layer.description}</p>
              <Progress value={percent} aria-label={`${rung.layer.label}: ${rung.completed} of ${rung.topics.length} lessons complete`} className="mt-2 h-1 max-w-xs bg-graphite-700" />
              <ul className="mt-4 flex flex-col gap-2">
                {rung.topics.map((t) => (
                  <li key={t.id}>
                    <LessonRow topic={t} status={lessonStatus(t.id, completed, lessons)} isNext={t.id === nextId} />
                  </li>
                ))}
              </ul>
            </section>
          </li>
        )
      })}
    </ol>
  )
}

function LessonRow({ topic, status, isNext }: { topic: Topic; status: Status; isNext: boolean }) {
  const Icon = status === 'done' ? Check : status === 'started' ? CircleDot : Circle
  return (
    <Link
      to={topicHref(topic)}
      aria-current={isNext ? 'true' : undefined}
      className={cn(
        'group flex min-h-14 items-start gap-3 rounded-xl border p-3 transition-colors sm:p-3.5',
        isNext ? 'border-cyan/50 bg-cyan/[0.06]' : 'border-white/[0.07] bg-graphite-900/60 hover:border-white/20',
      )}
    >
      <Icon
        aria-hidden
        className={cn('mt-0.5 size-4 shrink-0', status === 'done' ? 'text-ok' : status === 'started' ? 'text-amber' : 'text-steel-500')}
      />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2">
          <span className="font-medium text-paper group-hover:text-cyan">{topic.title}</span>
          {isNext && <span className="eyebrow text-cyan">Up next</span>}
        </span>
        <span className="mt-0.5 line-clamp-2 block text-sm leading-snug text-steel-400">{topic.summary}</span>
        <span className="sr-only">
          {STATUS_LABEL[status]}. {topic.estimatedDuration} minutes.{topic.labId ? ' Includes an interactive lab.' : ''}
        </span>
      </span>
      <span aria-hidden className="flex shrink-0 flex-col items-end gap-1 text-xs text-steel-400">
        <span>{topic.estimatedDuration} min</span>
        {topic.labId && <Box className="size-3.5 text-cyan" />}
      </span>
    </Link>
  )
}
