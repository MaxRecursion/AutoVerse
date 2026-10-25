import { useId, useState } from 'react'
import { ArrowLeft, ArrowRight, Box, ChevronDown, ExternalLink } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { Breadcrumbs } from '@/components/layout/Breadcrumbs'
import { CategoryIcon } from '@/components/learning/CategoryIcon'
import { sortForLearning } from '@/components/learning/labels'
import { TopicCard } from '@/components/learning/TopicCard'
import { useDocumentTitle } from '@/components/learning/useDocumentTitle'
import { Button } from '@/components/ui/button'
import { labs } from '@/features/labs/registry'
import { categories, getCategoryBySlug, getTopicsInCategory, sourceArticles } from '@/lib/content'
import type { Category, SourceArticle } from '@/lib/schemas'

/** Only links whose page was actually retrieved (metadata recorded) are offered as further reading. */
const LINKABLE: ReadonlySet<SourceArticle['importStatus']> = new Set(['metadata-only', 'imported'])

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** /learn/:categorySlug — lessons, related lab and further reading for one category. */
export default function CategoryPage() {
  const { categorySlug = '' } = useParams()
  const category = getCategoryBySlug(categorySlug)
  useDocumentTitle(category ? category.title : 'Category not found')

  if (!category) return <CategoryNotFound slug={categorySlug} />

  const list = sortForLearning(getTopicsInCategory(category.id))
  const relatedLabs = category.systemId ? labs.filter((l) => l.systemId === category.systemId).sort((a, b) => a.order - b.order) : []
  const reading = sourceArticles
    .filter((a) => a.mappedCategoryId === category.id && LINKABLE.has(a.importStatus))
    .sort((a, b) => a.title.localeCompare(b.title))
  const index = categories.findIndex((c) => c.id === category.id)
  const prev: Category | undefined = categories[index - 1]
  const next: Category | undefined = categories[index + 1]

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
      <Breadcrumbs items={[{ label: 'Learn', to: '/learn' }, { label: category.title }]} />
      <header className="max-w-3xl">
        <p className="eyebrow flex items-center gap-2">
          <CategoryIcon name={category.icon} className="size-3.5 text-cyan" />
          Category
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-paper sm:text-4xl">{category.title}</h1>
        <p className="mt-3 text-lg leading-relaxed text-steel-300">{category.summary}</p>
      </header>

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section aria-labelledby="lessons-heading">
          <h2 id="lessons-heading" className="mb-4 text-lg font-semibold text-paper">
            Lessons <span className="font-mono text-xs font-normal text-steel-500">{list.length}</span>
          </h2>
          {list.length ? (
            <ul className="grid gap-3 sm:grid-cols-2">
              {list.map((t) => (
                <li key={t.id}>
                  <TopicCard topic={t} />
                </li>
              ))}
            </ul>
          ) : (
            <div className="panel p-6">
              <p className="text-paper">Lessons for this category are still being written.</p>
              <p className="mt-1 text-sm text-steel-400">In the meantime, browse the other categories or try one of the interactive labs.</p>
              <Button asChild variant="outline" className="mt-4 h-10">
                <Link to="/learn">Browse all lessons</Link>
              </Button>
            </div>
          )}
        </section>

        <aside className="flex flex-col gap-8" aria-label="More for this category">
          {relatedLabs.length > 0 && (
            <section aria-labelledby="lab-heading">
              <h2 id="lab-heading" className="mb-3 text-lg font-semibold text-paper">
                Try it in 3D
              </h2>
              <ul className="flex flex-col gap-3">
                {relatedLabs.map((lab) => (
                  <li key={lab.id}>
                    <Link
                      to={`/labs/${lab.id}`}
                      className="group panel flex flex-col gap-2 p-4 transition-colors hover:border-cyan/40"
                    >
                      <span className="flex items-center gap-2 text-cyan">
                        <Box aria-hidden className="size-4" />
                        <span className="eyebrow text-cyan">Laboratory</span>
                      </span>
                      <span className="font-medium text-paper group-hover:text-cyan">{lab.title}</span>
                      <span className="text-sm leading-relaxed text-steel-400">{lab.summary}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="reading-heading">
            <h2 id="reading-heading" className="text-lg font-semibold text-paper">
              Further reading
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-steel-400">
              Links to articles on other websites. AutoVerse lessons are written independently; these pages are not part of this site.
            </p>
            <FurtherReading key={category.id} articles={reading} />
          </section>
        </aside>
      </div>

      <nav aria-label="Other categories" className="mt-16 flex flex-col gap-2 border-t border-white/[0.06] pt-6 sm:flex-row sm:justify-between">
        {prev ? (
          <Link to={`/learn/${prev.slug}`} className="group flex min-h-11 items-center gap-2 text-sm text-steel-300 hover:text-cyan">
            <ArrowLeft aria-hidden className="size-4" />
            <span>
              <span className="eyebrow block">Previous</span>
              {prev.title}
            </span>
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link to={`/learn/${next.slug}`} className="group flex min-h-11 items-center gap-2 text-sm text-steel-300 hover:text-cyan sm:text-right">
            <span>
              <span className="eyebrow block">Next</span>
              {next.title}
            </span>
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        )}
      </nav>
    </div>
  )
}

/** Links shown before "Show all" (some categories have dozens of catalogued articles). */
const READING_PREVIEW = 8

/** Metadata-only links to articles on other sites, collapsed to a short preview when the list is long. */
function FurtherReading({ articles }: { articles: readonly SourceArticle[] }) {
  const [expanded, setExpanded] = useState(false)
  const listId = useId()
  if (!articles.length) return <p className="mt-3 text-sm text-steel-400">No external reading has been catalogued for this category yet.</p>

  const collapsible = articles.length > READING_PREVIEW + 2
  const shown = collapsible && !expanded ? articles.slice(0, READING_PREVIEW) : articles
  return (
    <>
      <ul id={listId} className="mt-3 flex flex-col">
        {shown.map((a) => (
          <li key={a.url} className="border-b border-white/[0.05] last:border-0">
            <a
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex min-h-11 items-start gap-2 py-2.5 text-sm text-steel-300 hover:text-cyan"
            >
              <span className="min-w-0 flex-1">
                <span className="block leading-snug">{a.title}</span>
                <span className="mt-0.5 block text-xs text-steel-500">{hostOf(a.url)}</span>
              </span>
              <ExternalLink aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              <span className="sr-only">(external site, opens in a new tab)</span>
            </a>
          </li>
        ))}
      </ul>
      {collapsible && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 h-9 px-2 text-steel-300"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setExpanded((v) => !v)}
        >
          <ChevronDown aria-hidden className={expanded ? 'rotate-180 transition-transform' : 'transition-transform'} />
          {expanded ? 'Show fewer' : `Show all ${articles.length} links`}
        </Button>
      )}
    </>
  )
}

function CategoryNotFound({ slug }: { slug: string }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <Breadcrumbs items={[{ label: 'Learn', to: '/learn' }, { label: 'Not found' }]} />
      <h1 className="text-3xl font-semibold text-paper">No category called “{slug}”</h1>
      <p className="mt-3 text-steel-300">It may have been renamed. Here are the categories that exist:</p>
      <ul className="mt-6 grid gap-2 sm:grid-cols-2">
        {categories.map((c) => (
          <li key={c.id}>
            <Link to={`/learn/${c.slug}`} className="flex min-h-11 items-center gap-3 rounded-lg border border-white/[0.06] px-3 text-sm text-paper hover:border-cyan/40">
              <CategoryIcon name={c.icon} className="text-steel-400" />
              {c.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
