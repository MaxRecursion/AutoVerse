/** Original course outline: native nested lists and disclosures, with a Radix drawer on phones. */
import { useEffect, useId, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, Circle, LocateFixed, PanelLeftClose, PanelLeftOpen, Search, X } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { CategoryIcon } from '@/components/learning/CategoryIcon'
import { topicHref } from '@/components/learning/labels'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { categories, learningPaths, topics } from '@/lib/content'
import type { Topic } from '@/lib/schemas'
import { cn } from '@/lib/utils'
import { usePreferences } from '@/stores/preferences'
import { useProgress } from '@/stores/progress'
import { CourseNavigationContext, useCourseNavigation } from './context'
import { buildCourseNavigation, type NavigationEntry } from './navigationModel'
import { NavigationLink } from '@/components/layout/NavigationLink'
import { primaryNav } from '@/components/layout/nav'

export function CourseNavigationProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const { pathname } = location
  const completed = useProgress((state) => state.completed)
  const lessons = useProgress((state) => state.lessons)
  const recent = useProgress((state) => state.recent)
  const courseId = usePreferences((state) => state.courseId)
  const setCourseId = usePreferences((state) => state.setCourseId)
  const collapsed = usePreferences((state) => state.courseNavigationCollapsed)
  const setCollapsed = usePreferences((state) => state.setCourseNavigationCollapsed)
  const [mobile, setMobile] = useState({ pathname, open: false })
  // A course picked on this visit that leaves out the open lesson. Only shown, never saved, and ended by any navigation:
  // a later visit to the same lesson, through a link or the browser's Back button, has a different location key.
  const [picked, setPicked] = useState({ key: location.key, courseId: '' })
  if (picked.courseId && picked.key !== location.key) setPicked({ key: location.key, courseId: '' })
  const desktop = useMediaQuery('(min-width: 1280px)')
  const input = useMemo(() => ({ pathname, topics, paths: learningPaths, categories, completed, lessons, recent, preferredCourseId: courseId }), [pathname, completed, lessons, recent, courseId])
  const current = useMemo(() => buildCourseNavigation(input), [input])
  const previewId = picked.key === location.key ? picked.courseId : ''
  // Seen from outside any lesson: the picked course's own outline, progress and resume point.
  const previewed = useMemo(() => (previewId ? buildCourseNavigation({ ...input, pathname: '', preferredCourseId: previewId }) : undefined), [input, previewId])
  const preview = previewed && current.currentTopic ? { lesson: current.currentTopic, from: current.activeCourse } : undefined
  const model = preview && previewed ? previewed : current
  const closeMobile = () => setMobile({ pathname, open: false })
  const collapse = (value: boolean) => {
    setCollapsed(value)
    // The pressed button unmounts, so hand focus to the control that replaces it once it has rendered.
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-course-nav-toggle="${value ? 'expand' : 'collapse'}"]`)?.focus())
  }
  const chooseCourse = (id: string) => {
    const lesson = current.currentTopic
    const chosen = current.courses.find((course) => course.id === id)
    // Choosing never leaves the page (on Windows the arrow keys change a closed list one course at a time). A course
    // with the open lesson is saved at once; one without it is previewed until the learner opens one of its lessons.
    if (lesson && chosen && !chosen.topics.some((topic) => topic.id === lesson.id)) {
      setPicked({ key: location.key, courseId: id })
    } else {
      setPicked({ key: location.key, courseId: '' })
      setCourseId(id)
    }
  }
  const keepPreview = () => {
    if (preview) setCourseId(model.activeCourse.id)
  }
  const endPreview = () => setPicked({ key: location.key, courseId: '' })

  return (
    <CourseNavigationContext.Provider value={{ model, preview, collapsed, collapse, chooseCourse, keepPreview, endPreview, closeMobile }}>
      <Sheet open={mobile.open && mobile.pathname === pathname && !desktop} onOpenChange={(open) => setMobile({ pathname, open })}>
        {children}
        <SheetContent side="left" className="w-[min(22rem,calc(100vw-1rem))] gap-0 border-line/10 bg-graphite-950 sm:max-w-[22rem] motion-reduce:animate-none motion-reduce:transition-none">
          <SheetHeader className="shrink-0 border-b border-line/[0.07] pr-14">
            <SheetTitle className="flex items-center gap-2"><BookOpen aria-hidden className="size-4 text-nav-learn" />Course navigation</SheetTitle>
            <SheetDescription>Choose a course and find your place.</SheetDescription>
          </SheetHeader>
          <CourseOutline key={`${pathname}:mobile`} />
        </SheetContent>
      </Sheet>
    </CourseNavigationContext.Provider>
  )
}

/** Course and app menus have separate names and focus handling. */
export function CourseNavigationTrigger() {
  const navigation = useCourseNavigation()
  if (!navigation) return null
  return (
    <>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="shrink-0 xl:hidden" aria-label="Open course navigation" title="Course navigation"><PanelLeftOpen aria-hidden /></Button>
      </SheetTrigger>
      {navigation.collapsed && (
        <Button data-course-nav-toggle="expand" variant="ghost" size="icon" className="hidden shrink-0 xl:inline-flex" aria-label="Expand course navigation" title="Expand course navigation" onClick={() => navigation.collapse(false)}><PanelLeftOpen aria-hidden /></Button>
      )}
    </>
  )
}

export function CourseNavigationSidebar() {
  const navigation = useCourseNavigation()
  const { pathname } = useLocation()
  if (!navigation) return null
  return (
    <aside aria-label="Course navigation" data-testid="course-sidebar" className={cn('sticky top-[calc(3.5rem+env(safe-area-inset-top))] h-[calc(100dvh-3.5rem-env(safe-area-inset-top))] w-[280px] shrink-0 self-start flex-col border-r border-line/[0.07] bg-graphite-950/80 print:hidden', navigation.collapsed ? 'hidden' : 'hidden xl:flex')}>
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line/[0.06] px-4">
        <BookOpen aria-hidden className="size-4 text-nav-learn" />
        <p className="flex-1 text-sm font-semibold text-paper">Your learning space</p>
        <Button data-course-nav-toggle="collapse" variant="ghost" size="icon" className="size-8" aria-label="Collapse course navigation" title="Collapse course navigation" onClick={() => navigation.collapse(true)}><PanelLeftClose aria-hidden className="size-4" /></Button>
      </div>
      <CourseOutline key={`${pathname}:desktop`} />
    </aside>
  )
}

function CourseOutline() {
  const navigation = useCourseNavigation()!
  const { model, preview, chooseCourse, keepPreview, endPreview, closeMobile } = navigation
  const { activeCourse, currentTopic, position, nextUp } = model
  const uid = useId()
  const [query, setQuery] = useState('')
  const [closedGroups, setClosedGroups] = useState<ReadonlySet<string>>(new Set())
  const [locateRequest, setLocateRequest] = useState(0)
  const scroller = useRef<HTMLDivElement>(null)
  const select = useRef<HTMLSelectElement>(null)
  const normalized = query.trim().toLocaleLowerCase()
  const groups = model.groups.map((group) => ({ ...group, entries: group.entries.filter((entry) => !normalized || `${entry.topic.title} ${group.title}`.toLocaleLowerCase().includes(normalized)) })).filter((group) => group.entries.length > 0)
  const resultCount = groups.reduce((count, group) => count + group.entries.length, 0)
  const outlineStatus = query
    ? `${resultCount} ${resultCount === 1 ? 'lesson matches' : 'lessons match'}`
    : `${activeCourse.title}: ${activeCourse.total} lessons.${preview ? ` ${preview.lesson.title} is not part of this course.` : ''}`

  // A different course starts at the top of its outline; the effect below then brings the current lesson into view.
  const resetOutline = () => {
    setQuery('')
    setClosedGroups(new Set())
    if (scroller.current) scroller.current.scrollTop = 0
  }
  const openLesson = (event: MouseEvent, topic?: Topic) => {
    // A new tab or window leaves this page, and its preview, as they are.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    // Only a lesson of the previewed course keeps it; the footer can also lead to another course or to progress.
    if (topic && activeCourse.topics.some((item) => item.id === topic.id)) keepPreview()
    setQuery('')
    closeMobile()
  }

  const revealCurrent = () => {
    const container = scroller.current
    const row = container?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!container || !row || !row.getClientRects().length) return
    const bounds = container.getBoundingClientRect()
    const rect = row.getBoundingClientRect()
    // Move only the outline. Never scroll the lesson or fight router restoration.
    if (rect.top < bounds.top + 12) container.scrollTop += rect.top - bounds.top - 12
    else if (rect.bottom > bounds.bottom - 12) container.scrollTop += rect.bottom - bounds.bottom + 12
  }
  useEffect(() => {
    if (!query) revealCurrent()
  }, [currentTopic?.id, activeCourse.id, query, locateRequest, navigation.collapsed])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-3 p-4">
        <div>
          <label htmlFor={`${uid}-course`} className="eyebrow block text-[10px]">Course</label>
          <div className="relative mt-2">
            <select ref={select} id={`${uid}-course`} value={activeCourse.id} onChange={(event) => { resetOutline(); chooseCourse(event.target.value) }} className="tactile h-11 w-full min-w-0 appearance-none truncate rounded-lg border border-line/10 bg-graphite-900 pl-3 pr-8 text-sm font-medium text-paper focus-visible:border-nav-learn focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nav-learn/25">
              {model.courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
            </select>
            <ChevronDown aria-hidden className="pointer-events-none absolute right-3 top-3.5 size-4 text-steel-400" />
          </div>
        </div>
        <div className="rounded-lg border border-nav-learn/15 bg-nav-learn/[0.035] p-2.5" data-testid="course-position">
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono text-[11px] font-medium text-nav-learn">{position ? `Lesson ${position} of ${activeCourse.total}` : `${activeCourse.total} lessons in this course`}</p>
            {currentTopic && <Button variant="ghost" size="icon" className="size-7 shrink-0 text-nav-learn" aria-label="Find current lesson" title="Find current lesson" onClick={() => { setQuery(''); setClosedGroups(new Set()); setLocateRequest((request) => request + 1) }}><LocateFixed aria-hidden className="size-3.5" /></Button>}
          </div>
          <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-steel-400">
            <span>{activeCourse.completed} of {activeCourse.total} complete</span><span className="font-mono">{activeCourse.percent}%</span>
          </div>
          <Progress value={activeCourse.percent} aria-label={`${activeCourse.title} course progress`} className="mt-1.5 h-1 bg-graphite-700" />
        </div>
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-3 size-3.5 text-steel-500" />
          <input aria-label="Filter course lessons" type="search" value={query} onChange={(event) => { setQuery(event.target.value); setClosedGroups(new Set()) }} placeholder="Find a lesson in this course" className="h-10 w-full min-w-0 rounded-lg border border-line/[0.08] bg-graphite-900/60 pl-8 pr-8 text-base text-paper placeholder:text-steel-500 focus-visible:border-nav-learn focus-visible:outline-none xl:text-xs" />
          {query && <button type="button" aria-label="Clear lesson filter" onClick={() => setQuery('')} className="absolute right-1 top-1 grid size-8 place-items-center rounded text-steel-400 hover:text-paper"><X aria-hidden className="size-3.5" /></button>}
        </div>
      </div>

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-4 [scrollbar-width:thin]">
        {/* Inside the scrolling list, so on a short phone the note never squeezes out the lessons being previewed. */}
        {preview && (
          <div data-testid="course-preview" className="mx-1 mb-2 rounded-lg border border-amber/25 bg-amber/[0.06] px-2.5 py-2 text-[11px] leading-relaxed text-steel-300">
            <p>You’re reading <span className="font-medium text-paper">{preview.lesson.title}</span>, which isn’t part of this course.</p>
            <button
              type="button"
              onClick={(event) => {
                // Hand focus back only if the button had it: focusing a select during a tap opens its picker on iOS.
                const hadFocus = document.activeElement === event.currentTarget
                resetOutline()
                endPreview()
                if (hadFocus) select.current?.focus()
              }}
              className="relative hit-area mt-1 inline-flex min-h-8 items-center gap-1.5 font-medium text-nav-learn hover:text-paper"
            >
              <ArrowLeft aria-hidden className="size-3" />Back to {preview.from.title}
            </button>
          </div>
        )}
        <nav aria-label="Course lessons">
          <p className={cn('px-3 pb-2 text-[11px] text-steel-500', !query && 'sr-only')} role="status" aria-live="polite">{outlineStatus}</p>
          {groups.length && activeCourse.kind === 'path' ? (
            <ol className="px-1">{groups.flatMap((group) => group.entries).map((entry) => <LessonRow key={entry.topic.id} entry={entry} onNavigate={openLesson} />)}</ol>
          ) : groups.length ? (
            <ul className="space-y-2">
              {groups.map((group) => {
                const expanded = !closedGroups.has(group.id)
                const groupId = `${uid}-${group.id}`
                return (
                  <li key={group.id}>
                    <button type="button" aria-expanded={expanded} aria-controls={groupId} onClick={() => setClosedGroups((previous) => { const next = new Set(previous); if (expanded) next.add(group.id); else next.delete(group.id); return next })} className="relative hit-area flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-[11px] font-semibold text-steel-300 hover:bg-tint/[0.04] hover:text-paper">
                      <ChevronDown aria-hidden className={cn('size-3 shrink-0 transition-transform motion-reduce:transition-none', !expanded && '-rotate-90')} />
                      {group.category && <CategoryIcon name={group.category.icon} className="size-3.5 shrink-0 text-steel-500" />}
                      <span className="min-w-0 flex-1">{group.title}</span>
                      <span className="font-mono text-[10px] font-normal text-steel-500">{group.entries.filter((entry) => entry.status === 'done').length}/{group.entries.length}</span>
                    </button>
                    <ol id={groupId} hidden={!expanded} className="ml-3 border-l border-line/[0.08] py-1 pl-2" style={!expanded ? { display: 'none' } : undefined}>
                      {group.entries.map((entry) => <LessonRow key={entry.topic.id} entry={entry} onNavigate={openLesson} />)}
                    </ol>
                  </li>
                )
              })}
            </ul>
          ) : <p className="px-3 py-6 text-sm leading-relaxed text-steel-400">No lessons match “{query}”. Try another word or clear the filter.</p>}
        </nav>
      </div>

      <div className="shrink-0 space-y-2 border-t border-line/[0.07] bg-graphite-950 p-3">
        <Link to={nextUp.topic ? topicHref(nextUp.topic) : '/progress'} onClick={(event) => openLesson(event, nextUp.topic)} className="tactile relative hit-area flex min-h-12 items-center gap-3 rounded-lg border border-nav-learn/20 bg-nav-learn/[0.06] px-3 py-2.5 hover:border-nav-learn/50">
          <span className="min-w-0 flex-1"><span className="block text-[10px] font-medium text-nav-learn">{nextUp.topic ? nextUp.label : activeCourse.completed === activeCourse.total ? 'Course complete' : 'Course progress'}</span><span className="mt-0.5 block text-xs font-medium leading-relaxed text-paper">{nextUp.topic?.title ?? 'Review your progress'}</span></span><ArrowRight aria-hidden className="size-4 shrink-0 text-nav-learn" />
        </Link>
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <NavigationLink item={{ ...primaryNav[2], label: 'Browse lessons' }} variant="footer" onClick={closeMobile} />
          <NavigationLink item={primaryNav[5]} variant="footer" onClick={closeMobile} />
        </div>
      </div>
    </div>
  )
}

function LessonRow({ entry, onNavigate }: { entry: NavigationEntry; onNavigate: (event: MouseEvent, topic: Topic) => void }) {
  const { topic, position, status, isCurrent } = entry
  const label = status === 'done' ? 'Completed' : status === 'started' ? 'In progress' : 'Not started'
  return (
    <li>
      <Link to={topicHref(topic)} aria-current={isCurrent ? 'page' : undefined} aria-label={`${position}. ${topic.title}. ${isCurrent ? 'Current lesson. ' : ''}${label}.`} onClick={(event) => onNavigate(event, topic)} className={cn('relative hit-area my-0.5 flex min-h-11 items-start gap-2 rounded-md border px-2 py-2.5 text-xs transition-colors', isCurrent ? 'navigation-course-current border-l-[3px]' : 'border-transparent text-steel-300 hover:bg-tint/[0.04] hover:text-paper')}>
        <span aria-hidden className={cn('mt-0.5 grid size-4 shrink-0 place-items-center font-mono text-[10px]', status === 'done' ? 'text-ok' : isCurrent ? 'text-nav-learn' : status === 'started' ? 'text-amber' : 'text-steel-500')}>
          {status === 'done' ? <Check className="size-3.5" /> : status === 'started' ? <Circle className="size-2.5 fill-current" /> : String(position).padStart(2, '0')}
        </span>
        <span className="min-w-0 flex-1"><span className="block leading-relaxed">{topic.title}</span>{isCurrent ? <span className="mt-1 block text-[10px] text-nav-learn">You are here{status === 'done' ? ' · Completed' : ''}</span> : status === 'started' ? <span className="mt-1 block text-[10px] text-amber">In progress</span> : null}</span>
      </Link>
    </li>
  )
}
