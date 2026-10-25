import { Bookmark, BookmarkCheck, CircleCheck, Circle, Info } from 'lucide-react'
import { completeLesson, reopenLesson } from '@/features/progress/actions'
import { Breadcrumbs } from '@/components/layout/Breadcrumbs'
import { Button } from '@/components/ui/button'
import type { Category, ContentStatus, Topic } from '@/lib/schemas'
import { cn } from '@/lib/utils'
import { useProgress } from '@/stores/progress'
import { CategoryIcon } from './CategoryIcon'
import { DifficultyMeter, Duration, InteractiveBadge, StatusBadge } from './TopicMeta'

interface LessonHeaderProps {
  topic: Topic
  category?: Category
  /** The lesson embeds a working lab. */
  interactive: boolean
}

/** Breadcrumbs, title, meta and the bookmark / mark-complete actions. */
export function LessonHeader({ topic, category, interactive }: LessonHeaderProps) {
  return (
    <header className="flex flex-col gap-4">
      <Breadcrumbs
        items={[
          { label: 'Learn', to: '/learn' },
          ...(category ? [{ label: category.title, to: `/learn/${category.slug}` }] : []),
          { label: topic.title },
        ]}
      />
      {category && (
        <p className="eyebrow flex items-center gap-2">
          <CategoryIcon name={category.icon} className="size-3.5 text-cyan" />
          {category.title}
        </p>
      )}
      <h1 className="max-w-4xl text-3xl font-semibold leading-[1.1] text-paper sm:text-4xl lg:text-5xl">{topic.title}</h1>
      <p className="max-w-3xl text-base leading-relaxed text-steel-300 sm:text-lg">{topic.summary}</p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <DifficultyMeter difficulty={topic.difficulty} />
        <Duration minutes={topic.estimatedDuration} />
        {interactive && <InteractiveBadge />}
        <StatusBadge status={topic.contentStatus} showComplete />
      </div>
      <LessonActions topicId={topic.id} />
      <StatusBanner status={topic.contentStatus} />
    </header>
  )
}

/** Bookmark + mark-complete toggles (stored locally). */
export function LessonActions({ topicId, className, showComplete = true }: { topicId: string; className?: string; /** Hide the complete toggle where a dedicated finish control is shown. */ showComplete?: boolean }) {
  const completed = useProgress((s) => !!s.completed[topicId])
  const bookmarked = useProgress((s) => s.bookmarks.includes(topicId))
  const toggleBookmark = useProgress((s) => s.toggleBookmark)

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      <Button
        variant="outline"
        className={cn('h-10', bookmarked && 'border-cyan/50 text-cyan hover:text-cyan')}
        aria-pressed={bookmarked}
        onClick={() => toggleBookmark(topicId)}
      >
        {bookmarked ? <BookmarkCheck aria-hidden /> : <Bookmark aria-hidden />}
        {bookmarked ? 'Bookmarked' : 'Bookmark'}
      </Button>
      {showComplete && <Button
        variant={completed ? 'outline' : 'default'}
        className={cn('h-10', completed && 'border-ok/50 text-ok hover:text-ok')}
        aria-pressed={completed}
        onClick={() => (completed ? reopenLesson(topicId) : completeLesson(topicId))}
      >
        {completed ? <CircleCheck aria-hidden /> : <Circle aria-hidden />}
        {completed ? 'Completed' : 'Mark complete'}
      </Button>}
    </div>
  )
}

const STATUS_COPY: Record<Exclude<ContentStatus, 'complete'>, { title: string; body: string }> = {
  draft: {
    title: 'Draft lesson',
    body: 'The core explanation is written, but some sections (such as steps, diagrams or the quiz) are still in progress.',
  },
  outline: {
    title: 'Outline only',
    body: 'This lesson currently has its summary, objectives and a short introduction. The full explanation, steps and quiz have not been written yet.',
  },
}

function StatusBanner({ status }: { status: ContentStatus }) {
  if (status === 'complete') return null
  const copy = STATUS_COPY[status]
  return (
    <div
      role="note"
      className={cn(
        'flex max-w-3xl items-start gap-3 rounded-lg border px-4 py-3 text-sm',
        status === 'draft' ? 'border-amber/35 bg-amber/[0.06]' : 'border-steel-500/50 bg-graphite-850',
      )}
    >
      <Info aria-hidden className={cn('mt-0.5 size-4 shrink-0', status === 'draft' ? 'text-amber' : 'text-steel-300')} />
      <p className="leading-relaxed text-steel-300">
        <span className="font-medium text-paper">{copy.title}. </span>
        {copy.body}
      </p>
    </div>
  )
}
