import { useState } from 'react'
import { Search } from 'lucide-react'
import { Link } from 'react-router'
import { Breadcrumbs } from '@/components/layout/Breadcrumbs'
import { useDocumentTitle } from '@/components/learning/useDocumentTitle'
import { PracticeButton } from '@/features/practice/PracticeButton'
import { groupByLetter } from '@/lib/glossary'
import { glossary } from '@/lib/glossaryData'
import { normalizeText } from '@/lib/search'
import { cn } from '@/lib/utils'

/** /glossary — every key concept from every lesson, defined in plain language and linked to where it is explained. */
export default function GlossaryPage() {
  useDocumentTitle('Car glossary')
  const all = glossary
  const [query, setQuery] = useState('')
  const q = normalizeText(query.trim())
  const shown = q ? all.filter((e) => normalizeText(`${e.term} ${e.definition}`).includes(q)) : all
  const groups = groupByLetter(shown)

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-12 pt-5 sm:px-6 lg:pt-6">
      <Breadcrumbs items={[{ label: 'Learn', to: '/learn' }, { label: 'Glossary' }]} />
      <header>
        <p className="eyebrow">Reference</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-paper sm:text-3xl">Car glossary: automotive terms explained</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-steel-300">
          {all.length} terms from across the lessons, each defined in plain language and linked to the lesson that explains it properly.
        </p>
      </header>

      <div className="panel mt-4 flex flex-col gap-3 p-3">
        <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <label className="relative block min-w-0">
          <span className="sr-only">Filter terms</span>
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-steel-500" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter terms, e.g. torque, slip, camshaft…"
            className="h-9 pointer-coarse:h-11 w-full rounded-md border border-input bg-graphite-950 pl-9 pr-3 text-base placeholder:text-steel-500 sm:text-sm"
          />
        </label>
          <PracticeButton entries={shown} label={q ? 'Practise these terms' : 'Practise all terms'} className="h-9 pointer-coarse:h-11" />
        </div>
        <nav aria-label="Jump to letter" className="flex flex-wrap gap-1">
          {groupByLetter(all).map((g) => (
            <a
              key={g.letter}
              href={`#letter-${g.letter === '#' ? 'num' : g.letter}`}
              className="relative hit-area grid size-9 place-items-center rounded-md border border-line/10 pointer-coarse:size-11 font-mono text-sm text-steel-300 hover:border-cyan/50 hover:text-cyan"
            >
              {g.letter}
            </a>
          ))}
        </nav>
      </div>

      <p className="mt-3 text-xs text-steel-400" role="status" aria-live="polite">
        {shown.length} {shown.length === 1 ? 'term' : 'terms'} shown
      </p>
      {groups.length === 0 ? (
        <p className="mt-12 text-center text-steel-400">No terms match “{query}”.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-5" data-testid="glossary-catalog">
          {groups.map((g) => (
            <section key={g.letter} id={`letter-${g.letter === '#' ? 'num' : g.letter}`} aria-labelledby={`heading-${g.letter}`} className="scroll-mt-20">
              <h2 id={`heading-${g.letter}`} className="flex items-baseline gap-2 border-b border-line/[0.06] pb-2 font-mono text-base text-cyan">
                {g.letter}<span className="text-xs text-steel-500">{g.entries.length} {g.entries.length === 1 ? 'term' : 'terms'}</span>
              </h2>
              <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {g.entries.map((e) => (
                  <div key={e.slug} id={`term-${e.slug}`} className={cn('panel min-w-0 scroll-mt-20 p-3', e.equation && 'sm:col-span-2')}>
                    <dt className="text-base font-semibold text-paper">{e.term}</dt>
                    <dd className="mt-1.5 text-sm leading-relaxed text-steel-300">
                      {e.definition}
                      {e.equation && <code className="mt-2 block w-fit max-w-full break-words rounded-md border border-amber/20 bg-amber/[0.06] px-2 py-1.5 font-mono text-[13px] text-amber">{e.equation}</code>}
                    </dd>
                    <dd className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                      <span className="text-steel-500">Explained in:</span>
                      {e.topics.map((t, i) => (
                        <span key={t.id}>
                          <Link to={`/topics/${t.slug}`} className="relative hit-area inline-flex min-h-8 items-center text-cyan underline-offset-4 hover:underline pointer-coarse:min-h-11">
                            {t.title}
                          </Link>
                          {i < e.topics.length - 1 && <span className="text-steel-500">,</span>}
                        </span>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
