import { describe, expect, it } from 'vitest'
import { addDays, collectActivity, dayKey, localDayKey, monthGrid, streaks } from './activity'

const titles = { topic: (id: string) => `Lesson ${id}`, course: (id: string) => `Course ${id}` }
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString()

describe('day keys', () => {
  it('are the local calendar day, whatever the time of day', () => {
    expect(localDayKey(at(2026, 10, 5, 0))).toBe('2026-10-05')
    expect(localDayKey(at(2026, 10, 5, 23))).toBe('2026-10-05')
    expect(localDayKey('not a date')).toBeNull()
    expect(dayKey(new Date(2026, 0, 9))).toBe('2026-01-09')
  })

  it('step by calendar days across month, year and daylight-saving boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
    // Clocks change in late March and late October in Europe, early March and November in the US.
    for (const [start, n] of [['2026-03-28', 3], ['2026-10-24', 3], ['2026-03-07', 3], ['2026-10-31', 3]] as const) {
      const days = Array.from({ length: n + 1 }, (_, i) => addDays(start, i))
      expect(new Set(days).size).toBe(n + 1)
      expect(days.at(-1)).toBe(addDays(start, n))
    }
  })
})

describe('collectActivity', () => {
  it('files each record under the day it happened, with words for it', () => {
    const days = collectActivity(
      {
        completed: { clutch: at(2026, 10, 12) },
        quizScores: { clutch: { score: 3, total: 3, at: at(2026, 10, 12) } },
        certificates: { basics: { earnedAt: at(2026, 10, 13) } },
        practice: { torque: { known: true, reviewedAt: at(2026, 10, 12) }, slip: { known: false, reviewedAt: at(2026, 10, 12) } },
        recent: [{ topicId: 'gearbox', at: at(2026, 10, 14) }],
      },
      titles,
    )
    expect(days.get('2026-10-12')!.map((i) => i.text)).toEqual(['Finished Lesson clutch', 'Quiz: Lesson clutch, 3 of 3', 'Practised 2 terms'])
    expect(days.get('2026-10-13')!.map((i) => i.kind)).toEqual(['certificate'])
    expect(days.get('2026-10-14')![0]).toEqual({ kind: 'visit', text: 'Opened Lesson gearbox' })
    expect(days.size).toBe(3)
  })

  it('says "term" for one', () => {
    const days = collectActivity({ completed: {}, quizScores: {}, certificates: {}, practice: { a: { known: true, reviewedAt: at(2026, 10, 1) } }, recent: [] }, titles)
    expect(days.get('2026-10-01')![0]!.text).toBe('Practised 1 term')
  })
})

describe('streaks', () => {
  const days = (...keys: string[]) => new Set(keys)
  it('counts a run ending today, or yesterday while today is still empty', () => {
    expect(streaks(days('2026-10-24', '2026-10-25', '2026-10-26'), '2026-10-26')).toEqual({ current: 3, best: 3 })
    expect(streaks(days('2026-10-24', '2026-10-25'), '2026-10-26')).toEqual({ current: 2, best: 2 })
  })

  it('ends the current run after a missed day, and remembers the best one', () => {
    expect(streaks(days('2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-25'), '2026-10-26')).toEqual({ current: 1, best: 4 })
    expect(streaks(days('2026-10-20'), '2026-10-26')).toEqual({ current: 0, best: 1 })
    expect(streaks(days(), '2026-10-26')).toEqual({ current: 0, best: 0 })
  })

  it('does not break a run at a daylight-saving change', () => {
    expect(streaks(days('2026-03-27', '2026-03-28', '2026-03-29', '2026-03-30'), '2026-03-30')).toEqual({ current: 4, best: 4 })
    expect(streaks(days('2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'), '2026-11-02')).toEqual({ current: 4, best: 4 })
  })
})

describe('monthGrid', () => {
  it('lays a month out in Monday-first weeks, padded with the neighbouring months', () => {
    const weeks = monthGrid(2026, 9) // October 2026 starts on a Thursday
    expect(weeks).toHaveLength(5)
    expect(weeks.every((w) => w.length === 7)).toBe(true)
    expect(weeks[0]!.map((c) => c.key)).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
    expect(weeks[0]!.map((c) => c.inMonth)).toEqual([false, false, false, true, true, true, true])
    expect(weeks.at(-1)!.at(-1)).toEqual({ key: '2026-11-01', day: 1, inMonth: false })
    expect(weeks.flat().filter((c) => c.inMonth)).toHaveLength(31)
  })

  it('starts the first row on the 1st when the month starts on a Monday, and needs six rows when it must', () => {
    expect(monthGrid(2026, 5)[0]![0]).toEqual({ key: '2026-06-01', day: 1, inMonth: true }) // June 2026 starts on a Monday
    expect(monthGrid(2026, 2)).toHaveLength(6) // March 2026: a Sunday start spills into six rows
    expect(monthGrid(2027, 1)).toHaveLength(4) // February 2027 starts on a Monday and has 28 days: exactly four weeks
  })
})
