import { useMemo } from 'react'
import { CircleCheck } from 'lucide-react'
import { Link } from 'react-router'
import { CategoryIcon } from '@/components/learning/CategoryIcon'
import { topicHref } from '@/components/learning/labels'
import { formatDate, formatRelativeTime } from '@/features/progress/time'
import { getCategory, getTopic } from '@/lib/content'
import { useProgress } from '@/stores/progress'
import { HomeSection } from './HomeSection'
import { resolveRecent } from './homeData'

/** Recently viewed lessons from local progress. Renders nothing until the reader has opened a lesson. */
export function ContinueLearning() {
  const recent = useProgress((s) => s.recent)
  const completed = useProgress((s) => s.completed)
  const items = useMemo(() => resolveRecent(recent, getTopic, 3), [recent])
  if (items.length === 0) return null

  return (
    <HomeSection id="continue" eyebrow="Recently viewed" title="Your recent lessons" action={{ to: '/progress', label: 'All progress' }}>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {items.map(({ topic, at }) => {
          const category = getCategory(topic.categoryId)
          const done = !!completed[topic.id]
          return (
            <li key={topic.id}>
              <Link
                to={topicHref(topic)}
                className="group panel flex h-full flex-col gap-2 p-4 transition-colors hover:border-cyan/35 hover:bg-graphite-850/90"
              >
                <span className="text-base font-medium leading-snug text-paper transition-colors group-hover:text-cyan">{topic.title}</span>
                {category && (
                  <span className="flex items-center gap-1.5 text-xs text-steel-400">
                    <CategoryIcon name={category.icon} className="size-3.5" />
                    {category.title}
                  </span>
                )}
                <span className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-steel-400">
                  <span>
                    Viewed{' '}
                    <time dateTime={at} title={formatDate(at)}>
                      {formatRelativeTime(at)}
                    </time>
                  </span>
                  {done && (
                    <span className="inline-flex items-center gap-1 text-ok">
                      <CircleCheck aria-hidden className="size-3.5" />
                      Completed
                    </span>
                  )}
                  {!done && <span className="text-steel-300">In progress</span>}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </HomeSection>
  )
}
