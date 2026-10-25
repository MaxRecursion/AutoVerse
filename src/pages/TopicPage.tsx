import { useMemo } from 'react'
import { ArrowRight, Search } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { Breadcrumbs } from '@/components/layout/Breadcrumbs'
import { LessonTemplate } from '@/components/learning/LessonTemplate'
import { TopicCard } from '@/components/learning/TopicCard'
import { useDocumentTitle } from '@/components/learning/useDocumentTitle'
import { Button } from '@/components/ui/button'
import { openSearch } from '@/features/search/events'
import { searchSite } from '@/features/search/siteIndex'
import { getTopic, getTopicBySlug } from '@/lib/content'
import type { Topic } from '@/lib/schemas'

/** /topics/:slug — one lesson. Unknown slugs get a helpful not-found state. */
export default function TopicPage() {
  const { slug = '' } = useParams()
  const topic = getTopicBySlug(slug)
  useDocumentTitle(topic ? topic.title : 'Lesson not found')

  if (!topic) return <TopicNotFound slug={slug} />
  return <LessonTemplate key={topic.id} topic={topic} />
}

function TopicNotFound({ slug }: { slug: string }) {
  const query = slug.replace(/[-_]+/g, ' ').trim()
  const suggestions = useMemo(
    () =>
      query
        ? searchSite(query, { kinds: ['topic'], limit: 6 })
            .map((r) => getTopic(r.doc.id))
            .filter((t): t is Topic => !!t)
        : [],
    [query],
  )

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:py-16">
      <Breadcrumbs items={[{ label: 'Learn', to: '/learn' }, { label: 'Lesson not found' }]} />
      <p className="eyebrow">404 · Lesson</p>
      <h1 className="mt-2 text-3xl font-semibold text-paper sm:text-4xl">We couldn’t find that lesson</h1>
      <p className="mt-3 max-w-2xl leading-relaxed text-steel-300">
        There is no lesson at <code className="rounded bg-graphite-800 px-1.5 py-0.5 font-mono text-sm text-paper">/topics/{slug}</code>. It may
        not have been written yet, or the link may be mistyped.
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        <Button className="h-10" onClick={() => openSearch(query)}>
          <Search aria-hidden /> Search for “{query || 'lessons'}”
        </Button>
        <Button asChild variant="outline" className="h-10">
          <Link to="/learn">
            Browse all lessons <ArrowRight aria-hidden />
          </Link>
        </Button>
      </div>

      {suggestions.length > 0 && (
        <section aria-labelledby="suggestions-heading" className="mt-12">
          <h2 id="suggestions-heading" className="text-lg font-semibold text-paper">
            Did you mean…
          </h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {suggestions.map((t) => (
              <li key={t.id}>
                <TopicCard topic={t} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
