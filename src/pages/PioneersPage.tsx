import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { useSearchParams } from 'react-router'
import { Breadcrumbs } from '@/components/layout/Breadcrumbs'
import { PioneerCard } from '@/components/learning/PioneerCard'
import { useDocumentTitle } from '@/components/learning/useDocumentTitle'
import { Button } from '@/components/ui/button'
import { usePrefersReducedMotion } from '@/hooks/useMediaQuery'
import { categories, getCategory, pioneers } from '@/lib/content'
import { normalizeText } from '@/lib/search'
import type { Pioneer } from '@/lib/schemas'
import { cn } from '@/lib/utils'

/** Editorial eras for the timeline spine. */
const ERAS = [
  { id: 'early', label: 'Before the car', range: 'to 1889', from: -Infinity, to: 1889 },
  { id: 'pioneering', label: 'The automobile arrives', range: '1890–1919', from: 1890, to: 1919 },
  { id: 'mass', label: 'Motoring for everyone', range: '1920–1949', from: 1920, to: 1949 },
  { id: 'modern', label: 'Modern engineering', range: '1950 onward', from: 1950, to: Infinity },
] as const

const haystack = (p: Pioneer) => normalizeText([p.name, p.role, p.headline, p.story, p.year].join(' '))

export default function PioneersPage() {
  useDocumentTitle('Pioneers · the engineers behind the parts')
  const [params, setParams] = useSearchParams()
  const reduced = usePrefersReducedMotion()
  const system = params.get('system') ?? 'all'
  const focus = params.get('focus')
  const [query, setQuery] = useState('')
  // Explicit choices only; a deep-linked card is open until the reader says otherwise.
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const isOpen = (id: string) => open[id] ?? id === focus

  const systems = useMemo(() => {
    const counts = new Map<string, number>()
    for (const p of pioneers) counts.set(p.categoryId, (counts.get(p.categoryId) ?? 0) + 1)
    return categories.filter((c) => counts.has(c.id)).map((c) => ({ category: c, count: counts.get(c.id) ?? 0 }))
  }, [])

  const q = normalizeText(query.trim())
  const visible = useMemo(
    () => pioneers.filter((p) => (system === 'all' || p.categoryId === system) && (!q || haystack(p).includes(q))),
    [system, q],
  )
  const eras = ERAS.map((era) => ({ era, items: visible.filter((p) => p.sortYear >= era.from && p.sortYear <= era.to) })).filter((e) => e.items.length > 0)

  // Deep link from search / a lesson / the part inspector: open the card and bring it into view.
  useEffect(() => {
    if (!focus) return
    // After the router's own scroll restoration (it runs later in the same commit and would reset to the top).
    const timer = setTimeout(() => {
      document.getElementById(`pioneer-${focus}`)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
    }, 80)
    return () => clearTimeout(timer)
  }, [focus, reduced])

  const setSystem = (id: string) => {
    const next = new URLSearchParams(params)
    next.delete('focus')
    if (id === 'all') next.delete('system')
    else next.set('system', id)
    setParams(next, { replace: true })
  }
  const allOpen = visible.length > 0 && visible.every((p) => isOpen(p.id))
  const years = pioneers.length ? `${pioneers[0]!.sortYear}–${pioneers[pioneers.length - 1]!.sortYear}` : ''

  return (
    <div className="mx-auto max-w-4xl px-4 pb-20 pt-6 sm:px-6 lg:pt-10">
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Pioneers' }]} />
      <header>
        <p className="eyebrow text-amber">Engineering history</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">The engineers behind the parts</h1>
        <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-steel-300">
          Every part in a car was somebody’s problem first. Here are {pioneers.length} of the people who solved them, from {years}, each linked to the
          lessons and parts they shaped.
        </p>
        <p className="mt-3 max-w-2xl text-sm text-steel-400">
          Each story is retold in our own words from the source it cites. Where historians disagree, or a popular tale is doubtful, the card says so.
        </p>
      </header>

      <div className="z-20 -mx-4 mt-8 sm:sticky sm:top-[calc(3.5rem+env(safe-area-inset-top))] border-y border-white/[0.06] bg-graphite-950/90 px-4 py-3 backdrop-blur-lg sm:-mx-6 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative block flex-1">
            <span className="sr-only">Search engineers</span>
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-steel-500" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a name, part or idea…"
              className="h-10 w-full rounded-lg border border-input bg-graphite-900 pl-9 pr-3 text-sm placeholder:text-steel-500 pointer-coarse:h-12"
            />
          </label>
          <Button
            variant="outline"
            size="sm"
            className="h-10 shrink-0"
            onClick={() => setOpen(Object.fromEntries(visible.map((p) => [p.id, !allOpen])))}
          >
            {allOpen ? 'Collapse all' : 'Open all stories'}
          </Button>
        </div>
        <div className="-mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1 pointer-coarse:py-1" role="group" aria-label="Filter by system">
          <Chip active={system === 'all'} onClick={() => setSystem('all')}>
            All systems <span className="text-steel-500">{pioneers.length}</span>
          </Chip>
          {systems.map(({ category, count }) => (
            <Chip key={category.id} active={system === category.id} onClick={() => setSystem(category.id)}>
              {category.title} <span className="text-steel-500">{count}</span>
            </Chip>
          ))}
        </div>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {visible.length} {visible.length === 1 ? 'engineer' : 'engineers'} shown
      </p>

      {eras.length === 0 ? (
        <p className="mt-12 text-center text-steel-400">No engineers match “{query}”{system !== 'all' ? ` in ${getCategory(system)?.title ?? system}` : ''}.</p>
      ) : (
        <div className="mt-10 flex flex-col gap-12">
          {eras.map(({ era, items }) => (
            <section key={era.id} aria-labelledby={`era-${era.id}`}>
              <div className="flex items-baseline gap-3">
                <h2 id={`era-${era.id}`} className="text-xl font-semibold">
                  {era.label}
                </h2>
                <span className="font-mono text-xs text-amber">{era.range}</span>
              </div>
              <ol className="relative mt-5 flex flex-col gap-4 border-l border-amber/25 pl-5 sm:pl-8">
                {items.map((p) => (
                  <li key={p.id} className="relative">
                    <span aria-hidden className="absolute -left-[27px] top-6 size-3 rounded-full border-2 border-amber bg-graphite-950 sm:-left-[39px]" />
                    <PioneerCard pioneer={p} showSystem open={isOpen(p.id)} onOpenChange={(v) => setOpen((o) => ({ ...o, [p.id]: v }))} />
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'relative hit-area inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors',
        active ? 'border-amber/60 bg-amber/10 text-amber' : 'border-white/10 text-steel-300 hover:border-white/25 hover:text-paper',
      )}
    >
      {children}
    </button>
  )
}
