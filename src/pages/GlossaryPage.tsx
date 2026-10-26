import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Link } from 'react-router'
import { Breadcrumbs } from '@/components/layout/Breadcrumbs'
import { useDocumentTitle } from '@/components/learning/useDocumentTitle'
import { topics } from '@/lib/content'
import { buildGlossary, groupByLetter } from '@/lib/glossary'
import { normalizeText } from '@/lib/search'

/** /glossary — every key concept from every lesson, defined in plain language and linked to where it is explained. */
export default function GlossaryPage() {
  useDocumentTitle('Car glossary')
  const all = useMemo(() => buildGlossary(topics), [])
  const [query, setQuery] = useState('')
  const q = normalizeText(query.trim())
  const shown = q ? all.filter((e) => normalizeText(`${e.term} ${e.definition}`).includes(q)) : all
  const groups = groupByLetter(shown)

  return (
    <div className="mx-auto max-w-4xl px-4 pb-20 pt-6 sm:px-6 lg:pt-10">
      <Breadcrumbs items={[{ label: 'Learn', to: '/learn' }, { label: 'Glossary' }]} />
      <header>
        <p className="eyebrow">Reference</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">Car glossary: automotive terms explained</h1>
        <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-steel-300">
          {all.length} terms from across the lessons, each defined in plain language and linked to the lesson that explains it properly.
        </p>
      </header>

      <div className="mt-8 flex flex-col gap-4">
        <label className="relative block">
          <span className="sr-only">Filter terms</span>
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-steel-500" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter terms, e.g. torque, slip, camshaft…"
            className="h-11 pointer-coarse:h-12 w-full rounded-lg border border-input bg-graphite-900 pl-9 pr-3 text-base placeholder:text-steel-500"
          />
        </label>
        <nav aria-label="Jump to letter" className="flex flex-wrap gap-1">
          {groupByLetter(all).map((g) => (
            <a
              key={g.letter}
              href={`#letter-${g.letter === '#' ? 'num' : g.letter}`}
              className="relative hit-area grid size-9 place-items-center rounded-md border border-white/10 pointer-coarse:size-11 font-mono text-sm text-steel-300 hover:border-cyan/50 hover:text-cyan"
            >
              {g.letter}
            </a>
          ))}
        </nav>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {shown.length} {shown.length === 1 ? 'term' : 'terms'} shown
      </p>
      {groups.length === 0 ? (
        <p className="mt-12 text-center text-steel-400">No terms match “{query}”.</p>
      ) : (
        <div className="mt-10 flex flex-col gap-10">
          {groups.map((g) => (
            <section key={g.letter} id={`letter-${g.letter === '#' ? 'num' : g.letter}`} aria-labelledby={`heading-${g.letter}`} className="scroll-mt-20">
              <h2 id={`heading-${g.letter}`} className="font-mono text-xl text-cyan">
                {g.letter}
              </h2>
              <dl className="mt-4 flex flex-col divide-y divide-white/[0.06] border-y border-white/[0.06]">
                {g.entries.map((e) => (
                  <div key={e.slug} id={`term-${e.slug}`} className="scroll-mt-20 py-4">
                    <dt className="text-lg font-semibold text-paper">{e.term}</dt>
                    <dd className="mt-1.5 text-[15px] leading-relaxed text-steel-300">
                      {e.definition}
                      {e.equation && <code className="ml-2 rounded bg-graphite-800 px-1.5 py-0.5 font-mono text-[13px] text-amber">{e.equation}</code>}
                    </dd>
                    <dd className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                      <span className="text-steel-500">Explained in:</span>
                      {e.topics.map((t, i) => (
                        <span key={t.id}>
                          <Link to={`/topics/${t.slug}`} className="text-cyan underline-offset-4 hover:underline">
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
