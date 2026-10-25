import { BookmarkCheck, CircleCheck } from 'lucide-react'
import { Link } from 'react-router'
import type { Topic } from '@/lib/schemas'
import { cn } from '@/lib/utils'
import { useProgress } from '@/stores/progress'
import { topicHref } from './labels'
import { DifficultyMeter, Duration, InteractiveBadge, StatusBadge } from './TopicMeta'

interface TopicCardProps {
  topic: Topic
  className?: string
  /** Heading level for the title inside the card (keeps the page outline valid). */
  headingLevel?: 'h2' | 'h3' | 'h4'
}

/** Linked summary card for a lesson, with local progress indicators. */
export function TopicCard({ topic, className, headingLevel: Heading = 'h3' }: TopicCardProps) {
  const completed = useProgress((s) => !!s.completed[topic.id])
  const bookmarked = useProgress((s) => s.bookmarks.includes(topic.id))

  return (
    <Link
      to={topicHref(topic)}
      className={cn(
        'group panel relative flex h-full flex-col gap-2.5 p-4 transition-colors hover:border-cyan/35 hover:bg-graphite-850/90 focus-visible:border-cyan/60',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <DifficultyMeter difficulty={topic.difficulty} />
        <span className="flex items-center gap-1.5">
          {bookmarked && (
            <span className="text-cyan" title="Bookmarked">
              <BookmarkCheck aria-hidden className="size-4" />
              <span className="sr-only">Bookmarked.</span>
            </span>
          )}
          {completed && (
            <span className="text-ok" title="Completed">
              <CircleCheck aria-hidden className="size-4" />
              <span className="sr-only">Completed.</span>
            </span>
          )}
        </span>
      </div>
      <Heading className="text-base font-semibold leading-snug text-paper transition-colors group-hover:text-cyan">{topic.title}</Heading>
      <p className="line-clamp-2 text-sm leading-relaxed text-steel-400">{topic.summary}</p>
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        <Duration minutes={topic.estimatedDuration} />
        {topic.labId && <InteractiveBadge />}
        <StatusBadge status={topic.contentStatus} />
      </div>
    </Link>
  )
}
