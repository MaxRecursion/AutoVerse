import { useState } from 'react'
import { Search } from 'lucide-react'
import { openSearch } from '@/features/search/events'
import { isApplePlatform } from '@/features/search/shortcuts'
import { cn } from '@/lib/utils'
import { SEARCH_SUGGESTIONS } from './homeData'

interface SearchEntryProps {
  /** Pre-fills the palette when the main field is activated. */
  query?: string
  /** Visible text of the field-style button. */
  placeholder?: string
  suggestions?: readonly string[]
  className?: string
}

/**
 * A field-shaped button that opens the site's search palette (the one in the
 * header, via the open-search event), with example searches as chips.
 */
export function SearchEntry({ query, placeholder = 'Search lessons, labs and parts…', suggestions = SEARCH_SUGGESTIONS, className }: SearchEntryProps) {
  const [apple] = useState(isApplePlatform)
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <button
        type="button"
        onClick={() => openSearch(query)}
        aria-haspopup="dialog"
        aria-keyshortcuts={apple ? 'Meta+K /' : 'Control+K /'}
        className="group flex min-h-13 w-full items-center gap-3 rounded-xl border border-white/10 bg-graphite-950/80 px-4 text-left text-steel-400 shadow-[inset_0_1px_0_0_rgb(255_255_255/0.03)] transition-colors hover:border-cyan/40 hover:text-steel-300"
      >
        <Search aria-hidden className="size-5 shrink-0 text-steel-400 transition-colors group-hover:text-cyan" />
        <span className="min-w-0 flex-1 truncate text-[15px]">{placeholder}</span>
        <kbd aria-hidden className="hidden shrink-0 rounded border border-white/10 bg-graphite-800 px-1.5 py-0.5 font-mono text-[11px] text-steel-400 sm:inline">
          {apple ? '⌘K' : 'Ctrl K'}
        </kbd>
      </button>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="eyebrow mr-1">Try</span>
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              aria-haspopup="dialog"
              aria-label={`Search for ${s}`}
              onClick={() => openSearch(s)}
              className="inline-flex min-h-9 items-center rounded-full border border-white/[0.08] bg-graphite-900/70 px-3.5 text-sm text-steel-300 transition-colors hover:border-cyan/40 hover:text-paper"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Homepage band: global search entry. */
export function HomeSearch() {
  return (
    <section aria-labelledby="home-search-heading" className="mx-auto w-full max-w-[1400px] px-4 sm:px-6">
      <div className="panel grid grid-cols-1 gap-5 p-4 sm:p-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:items-center lg:gap-10">
        <div>
          <h2 id="home-search-heading" className="text-lg font-semibold text-paper sm:text-xl">
            Looking for something specific?
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-steel-400">Search every lesson, lab and documented part in one place.</p>
        </div>
        <SearchEntry />
      </div>
    </section>
  )
}
