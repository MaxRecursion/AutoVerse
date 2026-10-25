import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { BookOpen, Box, Clock, Cpu, FolderTree, Search } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { labs } from '@/features/labs/registry'
import { getTopic } from '@/lib/content'
import { groupByKind, type SearchDoc, type SearchKind } from '@/lib/search'
import type { Topic } from '@/lib/schemas'
import { useProgress } from '@/stores/progress'
import { OPEN_SEARCH_EVENT, type OpenSearchDetail } from './events'
import { isApplePlatform, matchSearchShortcut } from './shortcuts'
import { searchSite } from './siteIndex'

const GROUPS: { kind: SearchKind; heading: string; limit: number; icon: typeof BookOpen }[] = [
  { kind: 'topic', heading: 'Topics', limit: 8, icon: BookOpen },
  { kind: 'lab', heading: 'Labs', limit: 4, icon: Box },
  { kind: 'component', heading: 'Components', limit: 6, icon: Cpu },
  { kind: 'category', heading: 'Categories', limit: 4, icon: FolderTree },
]

const KIND_LABEL: Record<SearchKind, string> = { topic: 'Lesson', lab: 'Lab', component: 'Component', category: 'Category' }

const ITEM = 'min-h-11 gap-3 rounded-md px-2.5 py-2 data-[selected=true]:bg-white/[0.06] data-[selected=true]:text-paper'

/**
 * Global search: a header button plus a command palette opened with ⌘K /
 * Ctrl+K (anywhere) or "/" (when not typing). Ranking comes from lib/search;
 * cmdk only provides the accessible listbox and keyboard navigation.
 */
export function SearchCommand() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const navigate = useNavigate()
  const [apple] = useState(isApplePlatform)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = matchSearchShortcut(e)
      if (!action) return
      e.preventDefault()
      if (action === 'toggle') {
        // Opening starts empty; closing clears the query (same as Escape).
        setQuery('')
        setOpen((o) => !o)
      } else setOpen(true)
    }
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<OpenSearchDetail>).detail
      setQuery(detail?.query ?? '')
      setOpen(true)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener(OPEN_SEARCH_EVENT, onOpen)
    }
  }, [])

  const go = (href: string) => {
    setOpen(false)
    navigate(href)
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="h-9 gap-2 border-white/10 bg-graphite-900/60 px-2.5 text-steel-300 hover:text-paper sm:w-44 sm:justify-start lg:w-56"
        aria-label="Search lessons, labs and components"
        aria-keyshortcuts={apple ? 'Meta+K /' : 'Control+K /'}
      >
        <Search aria-hidden />
        <span className="hidden text-sm sm:inline">Search</span>
        <kbd aria-hidden className="ml-auto hidden rounded border border-white/10 bg-graphite-800 px-1.5 font-mono text-[10px] text-steel-400 sm:inline">
          {apple ? '⌘K' : 'Ctrl K'}
        </kbd>
      </Button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o)
          if (!o) setQuery('')
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="top-3 max-w-[calc(100%-1.5rem)] translate-y-0 gap-0 overflow-hidden border-white/10 bg-graphite-900 p-0 sm:top-[12dvh] sm:max-w-xl"
        >
          <DialogTitle className="sr-only">Search AutoVerse</DialogTitle>
          <DialogDescription className="sr-only">Search lessons, labs, components and categories. Use the arrow keys to move and Enter to open.</DialogDescription>
          <Command shouldFilter={false} loop className="bg-transparent" label="Search AutoVerse">
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder="Search lessons, labs, parts…"
              className="h-12 text-base text-paper placeholder:text-steel-500 sm:text-sm"
            />
            {open && <SearchResults query={query} onSelect={go} />}
          </Command>
          <div className="hidden items-center gap-4 border-t border-white/[0.06] px-3 py-2 text-[11px] text-steel-500 sm:flex" aria-hidden>
            <span>
              <kbd className="font-mono">↑↓</kbd> move
            </span>
            <span>
              <kbd className="font-mono">Enter</kbd> open
            </span>
            <span>
              <kbd className="font-mono">Esc</kbd> close
            </span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function SearchResults({ query, onSelect }: { query: string; onSelect: (href: string) => void }) {
  const deferred = useDeferredValue(query)
  const trimmed = deferred.trim()
  const grouped = useMemo(() => (trimmed ? groupByKind(searchSite(trimmed, { limit: 40 })) : null), [trimmed])
  const recent = useProgress((s) => s.recent)
  const recentTopics = useMemo(() => recent.map((r) => getTopic(r.topicId)).filter((t): t is Topic => !!t).slice(0, 6), [recent])

  if (!grouped) {
    return (
      <CommandList className="max-h-[min(60dvh,420px)] p-1.5">
        {recentTopics.length > 0 && (
          <CommandGroup heading="Recently viewed">
            {recentTopics.map((t) => (
              <CommandItem key={t.id} value={`recent:${t.id}`} onSelect={() => onSelect(`/topics/${t.slug}`)} className={ITEM}>
                <Clock aria-hidden className="text-steel-400" />
                <span className="truncate">{t.title}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {recentTopics.length > 0 && <CommandSeparator className="my-1 bg-white/[0.06]" />}
        <CommandGroup heading="Labs">
          {labs.map((l) => (
            <CommandItem key={l.id} value={`lab:${l.id}`} onSelect={() => onSelect(`/labs/${l.id}`)} className={ITEM}>
              <Box aria-hidden className="text-cyan" />
              <span className="truncate">{l.title}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Browse">
          <CommandItem value="browse:learn" onSelect={() => onSelect('/learn')} className={ITEM}>
            <BookOpen aria-hidden className="text-steel-400" />
            All lessons
          </CommandItem>
          <CommandItem value="browse:progress" onSelect={() => onSelect('/progress')} className={ITEM}>
            <FolderTree aria-hidden className="text-steel-400" />
            My progress
          </CommandItem>
        </CommandGroup>
      </CommandList>
    )
  }

  return (
    <CommandList className="max-h-[min(60dvh,420px)] p-1.5">
      <CommandEmpty className="px-4 py-8 text-center text-sm text-steel-400">
        No results for “{trimmed}”. Try a shorter or different word.
      </CommandEmpty>
      {GROUPS.map(({ kind, heading, limit, icon }) => {
        const items = grouped[kind].slice(0, limit)
        if (!items.length) return null
        return (
          <CommandGroup key={kind} heading={heading}>
            {items.map(({ doc }) => (
              <ResultItem key={doc.key} doc={doc} icon={icon} onSelect={onSelect} />
            ))}
          </CommandGroup>
        )
      })}
    </CommandList>
  )
}

function ResultItem({ doc, icon: Icon, onSelect }: { doc: SearchDoc; icon: typeof BookOpen; onSelect: (href: string) => void }) {
  return (
    <CommandItem value={doc.key} onSelect={() => onSelect(doc.href)} className={ITEM}>
      <Icon aria-hidden className={doc.interactive ? 'text-cyan' : 'text-steel-400'} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-paper">{doc.title}</span>
        <span className="truncate text-xs text-steel-400">{doc.description}</span>
      </span>
      <span className="sr-only">({KIND_LABEL[doc.kind]})</span>
      {doc.interactive && doc.kind !== 'lab' && (
        <span className="hidden shrink-0 font-mono text-[10px] uppercase tracking-wider text-cyan sm:inline" aria-hidden>
          3D
        </span>
      )}
    </CommandItem>
  )
}
