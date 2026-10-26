import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { ArrowRight, BookOpen, Box, CircleHelp, Clock, Cpu, FileText, FolderTree, Gauge, History, Search, type LucideIcon } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { labs } from '@/features/labs/registry'
import { topicHref } from '@/components/learning/labels'
import { resolveNextUp } from '@/features/progress/curriculum'
import { getTopic, learningPaths, topics } from '@/lib/content'
import { groupByKind, type SearchDoc, type SearchKind } from '@/lib/search'
import type { Topic } from '@/lib/schemas'
import { usePreferences } from '@/stores/preferences'
import { useProgress } from '@/stores/progress'
import { toast } from '@/stores/toasts'
import { matchCommands, PAGES, type Command as MenuCommand } from './commands'
import { OPEN_SEARCH_EVENT, type OpenSearchDetail } from './events'
import { isApplePlatform, matchSearchShortcut } from './shortcuts'
import { searchSite } from './siteIndex'
import { useStartTour } from '@/features/tour/useStartTour'

const GROUPS: { kind: SearchKind; heading: string; limit: number; icon: typeof BookOpen }[] = [
  { kind: 'topic', heading: 'Topics', limit: 8, icon: BookOpen },
  { kind: 'lab', heading: 'Labs', limit: 4, icon: Box },
  { kind: 'component', heading: 'Components', limit: 6, icon: Cpu },
  { kind: 'category', heading: 'Categories', limit: 4, icon: FolderTree },
  { kind: 'pioneer', heading: 'Engineers', limit: 4, icon: History },
]

const KIND_LABEL: Record<SearchKind, string> = { topic: 'Lesson', lab: 'Lab', component: 'Component', category: 'Category', pioneer: 'Engineer' }

const ITEM = 'min-h-11 pointer-coarse:min-h-12 gap-3 rounded-md px-2.5 py-2 data-[selected=true]:bg-white/[0.06] data-[selected=true]:text-paper'

/** Something the menu can do rather than a page it opens. */
interface ActionCommand extends MenuCommand {
  icon: LucideIcon
  run: () => void
}

/**
 * Global search and command menu: a header button plus a palette opened with
 * ⌘K / Ctrl+K (anywhere) or "/" (when not typing). It reaches every page and
 * the app's actions as well as lessons, labs, parts and engineers. Ranking
 * comes from lib/search; cmdk only provides the accessible listbox and
 * keyboard navigation.
 */
export function SearchCommand() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const navigate = useNavigate()
  const startTour = useStartTour()
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

  // An empty href only closes the menu (an action that stays on this page).
  const go = useCallback(
    (href: string) => {
      setOpen(false)
      if (href) navigate(href)
    },
    [navigate],
  )
  const tour = useCallback(() => {
    setOpen(false)
    // Let the palette finish closing so it does not take focus back from the tour.
    setTimeout(startTour, 150)
  }, [startTour])

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="h-9 gap-2 border-white/10 bg-graphite-900/60 px-2.5 text-steel-300 hover:text-paper sm:w-44 sm:justify-start lg:w-56"
        aria-label="Search lessons, labs and components"
        aria-keyshortcuts={apple ? 'Meta+K /' : 'Control+K /'}
        data-tour="search"
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
            {open && (
              <SearchResults query={query} onSelect={go} onTour={tour} />
            )}
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

function SearchResults({ query, onSelect, onTour }: { query: string; onSelect: (href: string) => void; onTour: () => void }) {
  const deferred = useDeferredValue(query)
  const trimmed = deferred.trim()
  const grouped = useMemo(() => (trimmed ? groupByKind(searchSite(trimmed, { limit: 40 })) : null), [trimmed])
  const recent = useProgress((s) => s.recent)
  const recentTopics = useMemo(() => recent.map((r) => getTopic(r.topicId)).filter((t): t is Topic => !!t).slice(0, 6), [recent])
  const actions = useActions(onSelect, onTour)
  const pages = useMemo(() => (trimmed ? matchCommands(PAGES, trimmed) : PAGES), [trimmed])
  const matchedActions = useMemo(() => (trimmed ? matchCommands(actions, trimmed) : actions), [actions, trimmed])

  const commandGroups = (
    <>
      {matchedActions.length > 0 && (
        <CommandGroup heading="Actions">
          {matchedActions.map((a) => (
            <CommandItem key={a.id} value={a.id} onSelect={a.run} className={ITEM}>
              <a.icon aria-hidden className="text-cyan" />
              <span className="truncate">{a.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      )}
      {pages.length > 0 && (
        <CommandGroup heading="Pages">
          {pages.map((p) => (
            <CommandItem key={p.id} value={p.id} onSelect={() => onSelect(p.href)} className={ITEM}>
              <FileText aria-hidden className="text-steel-400" />
              <span className="truncate">{p.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      )}
    </>
  )

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
        {commandGroups}
        <CommandGroup heading="Labs">
          {labs.map((l) => (
            <CommandItem key={l.id} value={`lab:${l.id}`} onSelect={() => onSelect(`/labs/${l.id}`)} className={ITEM}>
              <Box aria-hidden className="text-cyan" />
              <span className="truncate">{l.title}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    )
  }

  return (
    <CommandList className="max-h-[min(60dvh,420px)] p-1.5">
      <CommandEmpty className="px-4 py-8 text-center text-sm text-steel-400">
        No results for “{trimmed}”. Try a shorter or different word.
      </CommandEmpty>
      {commandGroups}
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

/** What the menu can do from any page: carry on learning, change the explanation level, take the tour. */
function useActions(onSelect: (href: string) => void, onTour: () => void): ActionCommand[] {
  const completed = useProgress((s) => s.completed)
  const recent = useProgress((s) => s.recent)
  const level = usePreferences((p) => p.level)
  return useMemo(() => {
    const next = resolveNextUp({ topics, paths: learningPaths, completed, recent, getTopic })
    const other = level === 'beginner' ? 'technical' : 'beginner'
    return [
      {
        id: 'action:continue',
        label: next.topic ? `${next.label}: ${next.topic.title}` : 'Review your progress',
        keywords: 'continue resume next lesson where was i',
        icon: ArrowRight,
        run: () => onSelect(next.topic ? topicHref(next.topic) : '/progress'),
      },
      {
        id: 'action:level',
        label: `Switch to ${other} explanations`,
        keywords: 'level explanation detail depth basic beginner tech technical advanced simple',
        icon: Gauge,
        run: () => {
          usePreferences.getState().setLevel(other)
          onSelect('')
          toast({ title: other === 'technical' ? 'Technical explanations on' : 'Beginner explanations on', duration: 3000 })
        },
      },
      { id: 'action:tour', label: 'Take the tour', keywords: 'help guide introduction how to use', icon: CircleHelp, run: onTour },
    ]
  }, [completed, recent, level, onSelect, onTour])
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
