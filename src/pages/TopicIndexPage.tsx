import { useId, useMemo, type ReactNode } from 'react'
import { ArrowRight, ChevronDown, Search, X } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { CategoryIcon } from '@/components/learning/CategoryIcon'
import { DIFFICULTIES, DIFFICULTY_LABEL, isDifficulty, sortForLearning, topicHref } from '@/components/learning/labels'
import { TopicCard } from '@/components/learning/TopicCard'
import { useDocumentTitle } from '@/components/learning/useDocumentTitle'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { searchSite } from '@/features/search/siteIndex'
import { categories, getCategory, getTopic, topics } from '@/lib/content'
import type { Category, Topic } from '@/lib/schemas'
import { cn } from '@/lib/utils'

const PARAM = { query: 'q', category: 'category', difficulty: 'difficulty', interactive: 'interactive' } as const

interface Group {
  category: Category | undefined
  topics: Topic[]
}

/** /learn — searchable, filterable index of every lesson (filters live in the URL so results are shareable). */
export default function TopicIndexPage() {
  useDocumentTitle('Learn')
  const [params, setParams] = useSearchParams()
  const query = params.get(PARAM.query) ?? ''
  const rawCategory = params.get(PARAM.category)
  const categoryId = rawCategory && getCategory(rawCategory) ? rawCategory : undefined
  const rawDifficulty = params.get(PARAM.difficulty)
  const difficulty = isDifficulty(rawDifficulty) ? rawDifficulty : undefined
  const interactiveOnly = params.get(PARAM.interactive) === '1'
  const filtered = !!(query.trim() || categoryId || difficulty || interactiveOnly)

  const update = (patch: Partial<Record<keyof typeof PARAM, string | null>>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const [key, value] of Object.entries(patch) as [keyof typeof PARAM, string | null][]) {
          if (value) next.set(PARAM[key], value)
          else next.delete(PARAM[key])
        }
        return next
      },
      { replace: true, preventScrollReset: true },
    )

  const results = useMemo<Topic[]>(() => {
    if (query.trim()) {
      return searchSite(query, { kinds: ['topic'], categoryId, difficulty, interactiveOnly, limit: 500 })
        .map((r) => getTopic(r.doc.id))
        .filter((t): t is Topic => !!t)
    }
    return sortForLearning(
      topics.filter(
        (t) => (!categoryId || t.categoryId === categoryId) && (!difficulty || t.difficulty === difficulty) && (!interactiveOnly || !!t.labId),
      ),
    )
  }, [query, categoryId, difficulty, interactiveOnly])

  // Group by category: category order when browsing, best-ranked first when searching.
  const groups = useMemo<Group[]>(() => {
    const byCategory = new Map<string, Topic[]>()
    for (const t of results) byCategory.set(t.categoryId, [...(byCategory.get(t.categoryId) ?? []), t])
    const ids = query.trim() ? [...byCategory.keys()] : [...byCategory.keys()].sort((a, b) => (getCategory(a)?.order ?? 99) - (getCategory(b)?.order ?? 99))
    return ids.map((id) => ({ category: getCategory(id), topics: byCategory.get(id) ?? [] }))
  }, [results, query])

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of topics) m.set(t.categoryId, (m.get(t.categoryId) ?? 0) + 1)
    return m
  }, [])

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
      <header className="max-w-3xl">
        <p className="eyebrow">Learn</p>
        <h1 className="mt-2 text-3xl font-semibold text-paper sm:text-4xl">Every lesson, one place</h1>
        <p className="mt-3 leading-relaxed text-steel-300">
          {topics.length} {topics.length === 1 ? 'lesson' : 'lessons'} across {categories.length} categories, from first principles to
          engineering detail. Lessons marked “Interactive 3D” include a working laboratory.
        </p>
      </header>

      <FilterBar
        query={query}
        categoryId={categoryId}
        difficulty={difficulty}
        interactiveOnly={interactiveOnly}
        filtered={filtered}
        counts={counts}
        onChange={update}
      />

      <p className="mt-6 text-sm text-steel-400" role="status" aria-live="polite">
        {results.length === 0
          ? 'No lessons match these filters.'
          : filtered
            ? `${results.length} ${results.length === 1 ? 'lesson matches' : 'lessons match'}.`
            : `Showing all ${results.length} lessons.`}
      </p>

      {results.length === 0 ? (
        <EmptyResults query={query} onClear={() => update({ query: null, category: null, difficulty: null, interactive: null })} />
      ) : (
        <div className="mt-4 flex flex-col gap-10">
          {groups.map(({ category, topics: list }) => (
            <section key={category?.id ?? 'other'} aria-labelledby={`group-${category?.id ?? 'other'}`}>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2 border-b border-white/[0.06] pb-2">
                <h2 id={`group-${category?.id ?? 'other'}`} className="flex items-center gap-2 text-lg font-semibold text-paper">
                  {category && <CategoryIcon name={category.icon} className="size-4 text-cyan" />}
                  {category?.title ?? 'Other lessons'}
                  <span className="font-mono text-xs font-normal text-steel-500">{list.length}</span>
                </h2>
                {category && (
                  <Link to={`/learn/${category.slug}`} className="inline-flex min-h-9 items-center gap-1 text-sm text-steel-300 hover:text-cyan">
                    View category <ArrowRight aria-hidden className="size-3.5" />
                  </Link>
                )}
              </div>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((t) => (
                  <li key={t.id}>
                    <TopicCard topic={t} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <CategoryDirectory counts={counts} />
      <AtoZIndex />
    </div>
  )
}

interface FilterBarProps {
  query: string
  categoryId?: string
  difficulty?: string
  interactiveOnly: boolean
  filtered: boolean
  counts: Map<string, number>
  onChange: (patch: Partial<Record<keyof typeof PARAM, string | null>>) => void
}

function FilterBar({ query, categoryId, difficulty, interactiveOnly, filtered, counts, onChange }: FilterBarProps) {
  const uid = useId()
  return (
    <form
      role="search"
      aria-label="Filter lessons"
      className="panel mt-8 grid gap-3 p-3 sm:p-4 md:grid-cols-[minmax(0,1fr)_auto_auto_auto] md:items-end"
      onSubmit={(e) => {
        // Results update as you type; submitting just dismisses the on-screen keyboard.
        e.preventDefault()
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
      }}
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${uid}-q`} className="text-xs font-medium text-steel-300">
          Search lessons
        </label>
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-steel-400" />
          <input
            id={`${uid}-q`}
            type="search"
            value={query}
            onChange={(e) => onChange({ query: e.target.value || null })}
            placeholder="e.g. camshaft, torque, brake fluid"
            autoComplete="off"
            enterKeyHint="search"
            className="h-11 w-full rounded-lg border border-white/10 bg-graphite-950 pl-9 pr-3 text-base text-paper placeholder:text-steel-500 focus-visible:border-cyan/60 sm:text-sm"
          />
        </div>
      </div>

      <FilterSelect id={`${uid}-cat`} label="Category" value={categoryId ?? ''} onChange={(v) => onChange({ category: v || null })}>
        <option value="">All categories</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.title} ({counts.get(c.id) ?? 0})
          </option>
        ))}
      </FilterSelect>

      <FilterSelect id={`${uid}-diff`} label="Difficulty" value={difficulty ?? ''} onChange={(v) => onChange({ difficulty: v || null })}>
        <option value="">Any difficulty</option>
        {DIFFICULTIES.map((d) => (
          <option key={d} value={d}>
            {DIFFICULTY_LABEL[d]}
          </option>
        ))}
      </FilterSelect>

      <div className="flex items-center justify-between gap-3 md:h-11 md:justify-start">
        <label htmlFor={`${uid}-int`} className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm text-steel-300">
          <Switch id={`${uid}-int`} checked={interactiveOnly} onCheckedChange={(v) => onChange({ interactive: v ? '1' : null })} />
          Interactive 3D only
        </label>
        {filtered && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 text-steel-300"
            onClick={() => onChange({ query: null, category: null, difficulty: null, interactive: null })}
          >
            <X aria-hidden /> Clear
          </Button>
        )}
      </div>
    </form>
  )
}

function FilterSelect({ id, label, value, onChange, children }: { id: string; label: string; value: string; onChange: (v: string) => void; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-steel-300">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-full min-w-44 appearance-none rounded-lg border border-white/10 bg-graphite-950 pl-3 pr-9 text-base text-paper focus-visible:border-cyan/60 sm:text-sm"
        >
          {children}
        </select>
        <ChevronDown aria-hidden className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-steel-400" />
      </div>
    </div>
  )
}

function EmptyResults({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <div className="panel mt-4 flex flex-col items-start gap-3 p-6">
      <p className="text-paper">{query.trim() ? `Nothing found for “${query.trim()}”.` : 'No lessons fit this combination of filters yet.'}</p>
      <p className="text-sm text-steel-400">Try a broader term, another category, or clear the filters. New lessons are added regularly.</p>
      <Button variant="outline" className="h-10" onClick={onClear}>
        Clear search and filters
      </Button>
    </div>
  )
}

function CategoryDirectory({ counts }: { counts: Map<string, number> }) {
  return (
    <section aria-labelledby="categories-heading" className="mt-16">
      <h2 id="categories-heading" className="text-lg font-semibold text-paper">
        Browse by category
      </h2>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((c) => {
          const n = counts.get(c.id) ?? 0
          return (
            <li key={c.id}>
              <Link
                to={`/learn/${c.slug}`}
                className="group flex min-h-12 items-center gap-3 rounded-lg border border-white/[0.06] bg-graphite-900/60 px-3 py-2.5 transition-colors hover:border-cyan/35"
              >
                <CategoryIcon name={c.icon} className="size-4 shrink-0 text-steel-400 group-hover:text-cyan" />
                <span className="min-w-0 flex-1 truncate text-sm text-paper">{c.title}</span>
                <span className={cn('font-mono text-xs', n ? 'text-steel-400' : 'text-steel-500')}>{n ? `${n}` : 'soon'}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function AtoZIndex() {
  const letters = useMemo(() => {
    const m = new Map<string, Topic[]>()
    for (const t of [...topics].sort((a, b) => a.title.localeCompare(b.title))) {
      const first = t.title.trim().charAt(0).toUpperCase()
      const key = /[A-Z]/.test(first) ? first : '#'
      m.set(key, [...(m.get(key) ?? []), t])
    }
    return [...m.entries()]
  }, [])
  if (!letters.length) return null

  return (
    <section aria-labelledby="az-heading" className="mt-16">
      <h2 id="az-heading" className="text-lg font-semibold text-paper">
        A–Z index
      </h2>
      <nav aria-label="A to Z letters" className="mt-3 flex flex-wrap gap-1">
        {letters.map(([letter]) => (
          <a
            key={letter}
            href={`#az-${letter}`}
            className="grid size-9 place-items-center rounded-md border border-white/[0.06] font-mono text-xs text-steel-300 hover:border-cyan/40 hover:text-cyan"
          >
            {letter}
          </a>
        ))}
      </nav>
      <div className="mt-5 gap-8 sm:columns-2 lg:columns-3">
        {letters.map(([letter, list]) => (
          <div key={letter} id={`az-${letter}`} className="mb-5 scroll-mt-20 break-inside-avoid">
            <h3 className="font-mono text-xs text-cyan">{letter}</h3>
            <ul className="mt-1.5">
              {list.map((t) => (
                <li key={t.id}>
                  <Link to={topicHref(t)} className="flex min-h-9 items-center text-sm text-steel-300 hover:text-paper">
                    {t.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
