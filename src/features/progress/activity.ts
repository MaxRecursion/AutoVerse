import type { ProgressData } from '@/stores/progress'

/**
 * What the learner did, by calendar day (in their own time zone), built only
 * from what the progress record keeps: finished lessons, quiz scores,
 * certificates, practised terms, and the last few lesson visits.
 */
export type DayKey = string // "YYYY-MM-DD", local
export type ActivityKind = 'lesson' | 'quiz' | 'certificate' | 'terms' | 'visit'
export interface ActivityItem {
  kind: ActivityKind
  text: string
}

const pad = (n: number) => String(n).padStart(2, '0')
export const dayKey = (d: Date): DayKey => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** The local calendar day of an ISO timestamp, or null when it is not a date. */
export function localDayKey(iso: string): DayKey | null {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : dayKey(d)
}

/** Day arithmetic on calendar days, not milliseconds, so a daylight-saving change never skips or repeats a day. */
export function addDays(key: DayKey, n: number): DayKey {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number]
  return dayKey(new Date(y, m - 1, d + n))
}

type Titles = { topic: (id: string) => string; course: (id: string) => string }

export function collectActivity(data: Pick<ProgressData, 'completed' | 'quizScores' | 'certificates' | 'practice' | 'recent'>, titles: Titles): Map<DayKey, ActivityItem[]> {
  const days = new Map<DayKey, ActivityItem[]>()
  const add = (iso: string, item: ActivityItem) => {
    const key = localDayKey(iso)
    if (key) days.set(key, [...(days.get(key) ?? []), item])
  }
  for (const [id, at] of Object.entries(data.completed)) add(at, { kind: 'lesson', text: `Finished ${titles.topic(id)}` })
  for (const [id, q] of Object.entries(data.quizScores)) add(q.at, { kind: 'quiz', text: `Quiz: ${titles.topic(id)}, ${q.score} of ${q.total}` })
  for (const [id, c] of Object.entries(data.certificates)) add(c.earnedAt, { kind: 'certificate', text: `Earned the ${titles.course(id)} certificate` })
  // Terms are summed per day: one line, not one per card.
  const terms = new Map<DayKey, number>()
  for (const r of Object.values(data.practice)) {
    const key = localDayKey(r.reviewedAt)
    if (key) terms.set(key, (terms.get(key) ?? 0) + 1)
  }
  for (const [key, n] of terms) days.set(key, [...(days.get(key) ?? []), { kind: 'terms', text: `Practised ${n} ${n === 1 ? 'term' : 'terms'}` }])
  for (const r of data.recent) add(r.at, { kind: 'visit', text: `Opened ${titles.topic(r.topicId)}` })
  return days
}

/**
 * Days in a row with something done. The current run counts back from today,
 * or from yesterday while today is still empty (the day is not over).
 */
export function streaks(active: ReadonlySet<DayKey>, today: DayKey): { current: number; best: number } {
  let current = 0
  for (let k = active.has(today) ? today : addDays(today, -1); active.has(k); k = addDays(k, -1)) current++
  let best = 0
  for (const day of active) {
    if (active.has(addDays(day, -1))) continue // not the start of a run
    let run = 0
    for (let k = day; active.has(k); k = addDays(k, 1)) run++
    best = Math.max(best, run)
  }
  return { current, best }
}

export interface MonthCell {
  key: DayKey
  day: number
  inMonth: boolean
}

/** Weeks (Monday first) covering a month; days from the neighbouring months fill the first and last row. */
export function monthGrid(year: number, month: number): MonthCell[][] {
  const first = new Date(year, month, 1)
  const lead = (first.getDay() + 6) % 7
  const length = new Date(year, month + 1, 0).getDate()
  const rows = Math.ceil((lead + length) / 7)
  const weeks: MonthCell[][] = []
  for (let r = 0; r < rows; r++) {
    weeks.push(
      Array.from({ length: 7 }, (_, c) => {
        const d = new Date(year, month, 1 - lead + r * 7 + c)
        return { key: dayKey(d), day: d.getDate(), inMonth: d.getMonth() === month }
      }),
    )
  }
  return weeks
}
