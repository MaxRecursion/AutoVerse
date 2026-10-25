import { useMemo } from 'react'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'
import { ProgressRing } from '@/components/learning/ProgressRing'
import { topicHref } from '@/components/learning/labels'
import { overallProgress, resolveNextUp } from '@/features/progress/curriculum'
import { getTopic, learningPaths, topics } from '@/lib/content'
import { useProgress } from '@/stores/progress'

/**
 * The always-visible answer to "where am I and what next?": overall completion
 * plus a one-tap link to the next lesson. Wide screens show the lesson title;
 * narrow ones show just the ring (its accessible name carries the same text).
 */
export function ProgressPill() {
  const completed = useProgress((s) => s.completed)
  const recent = useProgress((s) => s.recent)
  const total = useMemo(() => overallProgress(topics, completed), [completed])
  const next = useMemo(() => resolveNextUp({ topics, paths: learningPaths, completed, recent, getTopic }), [completed, recent])

  const to = next.topic ? topicHref(next.topic) : '/progress'
  const eyebrow = next.kind === 'done' ? 'All lessons done' : next.label
  const title = next.topic?.title ?? 'Review your progress'
  const accessible = `${eyebrow}: ${title}. ${total.completed} of ${total.total} lessons complete.`

  return (
    <Link
      to={to}
      aria-label={accessible}
      title={accessible}
      className="group flex h-10 items-center gap-2.5 rounded-lg border border-white/[0.08] px-2 transition-colors hover:border-cyan/40 lg:px-3"
    >
      <span className="relative grid place-items-center">
        <ProgressRing percent={total.percent} size={26} />
        <span aria-hidden className="absolute font-mono text-[8px] tabular-nums text-steel-300">
          {total.percent}
        </span>
      </span>
      <span className="hidden min-w-0 flex-col leading-tight lg:flex">
        <span className="eyebrow text-[10px] tracking-[0.14em]">{eyebrow}</span>
        <span className="max-w-44 truncate text-[13px] font-medium text-paper group-hover:text-cyan">{title}</span>
      </span>
      <ArrowRight aria-hidden className="hidden size-4 text-steel-400 group-hover:text-cyan lg:block" />
    </Link>
  )
}
