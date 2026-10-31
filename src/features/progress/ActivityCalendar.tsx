/*
 * Adapted from Watermelon UI "calendar-widget" (MIT), see THIRD_PARTY_NOTICES.md:
 * a month grid whose days light up, with the chosen day's details below.
 * The days are real buttons with a spoken summary, and everything shown is
 * read from the local progress record (activity.ts).
 */
import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Flame } from 'lucide-react'
import { AnimatedNumber } from '@/components/ui/animated-number'
import { Button } from '@/components/ui/button'
import { getCourses } from '@/features/certificate/award'
import { getTopic } from '@/lib/content'
import { cn } from '@/lib/utils'
import { useProgress } from '@/stores/progress'
import { collectActivity, dayKey, monthGrid, streaks, type ActivityItem } from './activity'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const monthName = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' })
const longDay = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
const spokenDay = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long' })
const parseKey = (key: string) => {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number]
  return new Date(y, m - 1, d)
}

const SHADE = ['bg-white/[0.035]', 'bg-cyan/20', 'bg-cyan/35', 'bg-cyan/55']

/** A month of what the learner did, by day, with the current and best streak. */
export function ActivityCalendar() {
  const completed = useProgress((s) => s.completed)
  const quizScores = useProgress((s) => s.quizScores)
  const certificates = useProgress((s) => s.certificates)
  const practice = useProgress((s) => s.practice)
  const recent = useProgress((s) => s.recent)

  const today = dayKey(new Date())
  const [cursor, setCursor] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const [chosen, setChosen] = useState<string | null>(null)

  const activity = useMemo(() => {
    const courseTitle = new Map(getCourses().map((c) => [c.id, c.title]))
    return collectActivity(
      { completed, quizScores, certificates, practice, recent },
      { topic: (id) => getTopic(id)?.title ?? id, course: (id) => courseTitle.get(id) ?? id },
    )
  }, [completed, quizScores, certificates, practice, recent])
  const { current, best } = useMemo(() => streaks(new Set(activity.keys()), today), [activity, today])
  const weeks = monthGrid(cursor.year, cursor.month)
  const shown = chosen ?? (activity.has(today) ? today : null)
  const shownItems: ActivityItem[] = shown ? (activity.get(shown) ?? []) : []
  const move = (by: number) => {
    const d = new Date(cursor.year, cursor.month + by, 1)
    setCursor({ year: d.getFullYear(), month: d.getMonth() })
  }
  const nowMonth = new Date()
  const atCurrentMonth = cursor.year === nowMonth.getFullYear() && cursor.month === nowMonth.getMonth()

  return (
    <div className="panel flex flex-col gap-5 p-4 sm:p-5" data-testid="activity-calendar">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-lg text-paper" aria-live="polite">
          {monthName.format(new Date(cursor.year, cursor.month, 1))}
        </h3>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="icon" className="relative hit-area" aria-label="Previous month" onClick={() => move(-1)}>
            <ChevronLeft aria-hidden />
          </Button>
          <Button variant="ghost" size="sm" className="relative hit-area" disabled={atCurrentMonth} onClick={() => setCursor({ year: nowMonth.getFullYear(), month: nowMonth.getMonth() })}>
            This month
          </Button>
          <Button variant="ghost" size="icon" className="relative hit-area" aria-label="Next month" onClick={() => move(1)}>
            <ChevronRight aria-hidden />
          </Button>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3">
        <div className="track flex items-center gap-3 rounded-lg border border-white/[0.06] px-3 py-2">
          <Flame aria-hidden className={cn('size-5', current > 0 ? 'text-amber' : 'text-steel-500')} />
          <div>
            <dt className="text-xs text-steel-400">Current streak</dt>
            <dd className="font-display text-xl text-paper">
              <AnimatedNumber value={current} /> <span className="text-sm text-steel-400">{current === 1 ? 'day' : 'days'}</span>
            </dd>
          </div>
        </div>
        <div className="track flex items-center gap-3 rounded-lg border border-white/[0.06] px-3 py-2">
          <div>
            <dt className="text-xs text-steel-400">Best streak</dt>
            <dd className="font-display text-xl text-paper">
              <AnimatedNumber value={best} /> <span className="text-sm text-steel-400">{best === 1 ? 'day' : 'days'}</span>
            </dd>
          </div>
        </div>
      </dl>

      <div>
        <div aria-hidden className="mb-1.5 grid grid-cols-7 gap-1.5 text-center font-mono text-[11px] uppercase tracking-wider text-steel-500">
          {WEEKDAYS.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <ul className="grid grid-cols-7 gap-1.5">
          {weeks.flat().map((cell) => {
            const items = activity.get(cell.key) ?? []
            const when = spokenDay.format(parseKey(cell.key))
            const label = items.length ? `${when}: ${items.map((i) => i.text).join('; ')}` : `${when}: no activity`
            return (
              <li key={cell.key}>
                <button
                  type="button"
                  aria-label={label}
                  aria-pressed={shown === cell.key}
                  aria-current={cell.key === today ? 'date' : undefined}
                  disabled={!cell.inMonth}
                  onClick={() => setChosen(cell.key)}
                  className={cn(
                    'relative flex aspect-square w-full items-center justify-center rounded-lg font-mono text-xs tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-cyan',
                    cell.inMonth ? SHADE[Math.min(items.length, 3)] : 'opacity-25',
                    items.length > 0 ? 'text-paper' : 'text-steel-400',
                    cell.inMonth && 'hover:ring-1 hover:ring-white/30',
                    cell.key === today && 'ring-1 ring-amber/70',
                    shown === cell.key && 'ring-2 ring-cyan',
                  )}
                >
                  {cell.day}
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      <div aria-live="polite" className="min-h-14">
        {shown ? (
          <>
            <p className="eyebrow">{longDay.format(parseKey(shown))}</p>
            {shownItems.length ? (
              <ul className="mt-2 flex flex-col gap-1 text-sm text-steel-300">
                {shownItems.map((i, n) => (
                  <li key={n}>{i.text}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-steel-400">Nothing recorded this day.</p>
            )}
          </>
        ) : (
          <p className="text-sm text-steel-400">Choose a day to see what you did.</p>
        )}
      </div>
      <p className="text-xs leading-relaxed text-steel-500">
        Built from your progress in this browser. Finished lessons, quizzes, certificates and practised terms are kept with their dates, but only your last 12
        lesson visits are, so days further back can look quieter than they were.
      </p>
    </div>
  )
}
