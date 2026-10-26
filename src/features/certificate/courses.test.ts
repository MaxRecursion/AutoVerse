import { describe, expect, it } from 'vitest'
import { learningPaths, topics, getTopic } from '@/lib/content'
import type { Topic } from '@/lib/schemas'
import { buildCourses, certificateCode, courseStatus, CURRICULUM_COURSE_ID, formatStudyTime, studyMinutes } from './courses'

const done = (...ids: string[]) => Object.fromEntries(ids.map((i) => [i, '2026-10-26T10:00:00.000Z']))
const scores = (o: Record<string, [number, number]>) => Object.fromEntries(Object.entries(o).map(([k, [score, total]]) => [k, { score, total }]))

describe('courses', () => {
  const courses = buildCourses(learningPaths, topics, getTopic)

  it('offers each learning path plus the whole curriculum, last', () => {
    expect(courses.map((c) => c.id)).toEqual([...learningPaths.map((p) => p.id), CURRICULUM_COURSE_ID])
    expect(courses.at(-1)!.topics).toHaveLength(topics.length)
    expect(courses.at(-1)!.kind).toBe('curriculum')
  })

  it('skips lessons a path names that do not exist, and repeats', () => {
    const path = { id: 'p', title: 'Beginner: demo', summary: 's', level: 'beginner' as const, order: 0, topicIds: ['how-a-car-works', 'nope', 'how-a-car-works', 'torque-and-power'] }
    const [c] = buildCourses([path], topics, getTopic)
    expect(c!.topics.map((t) => t.id)).toEqual(['how-a-car-works', 'torque-and-power'])
    expect(c!.title).toBe('Demo')
  })

  it('drops a path with no resolvable lessons', () => {
    const path = { id: 'p', title: 'X', summary: 's', level: 'beginner' as const, order: 0, topicIds: ['nope', 'nada'] }
    expect(buildCourses([path], topics, getTopic).map((c) => c.id)).toEqual([CURRICULUM_COURSE_ID])
  })
})

describe('courseStatus', () => {
  const quizzed = (id: string): Topic => ({ ...topics[0]!, id, quiz: [{ id: 'q', prompt: 'p', options: ['a', 'b'], answerIndex: 0, explanation: 'e' }] })
  const plain = (id: string): Topic => ({ ...topics[0]!, id, quiz: [] })
  const course = { id: 'c', title: 'C', summary: 's', kind: 'path' as const, topics: [quizzed('a'), quizzed('b'), plain('c')] }

  it('starts at nothing, with everything left to do', () => {
    const s = courseStatus(course, {}, {})
    expect(s).toMatchObject({ lessonsDone: 0, lessonsTotal: 3, quizzesTaken: 0, quizzesTotal: 2, percent: 0, eligible: false, averageScore: null })
    expect(s.remainingLessons.map((t) => t.id)).toEqual(['a', 'b', 'c'])
    expect(s.remainingQuizzes.map((t) => t.id)).toEqual(['a', 'b'])
  })

  it('needs the quizzes too: completing every lesson is not enough', () => {
    const s = courseStatus(course, done('a', 'b', 'c'), {})
    expect(s.eligible).toBe(false)
    expect(s.remainingLessons).toEqual([])
    expect(s.remainingQuizzes.map((t) => t.id)).toEqual(['a', 'b'])
    expect(s.percent).toBe(60)
  })

  it('needs the lessons too: taking every quiz is not enough', () => {
    expect(courseStatus(course, done('a'), scores({ a: [1, 1], b: [1, 1] })).eligible).toBe(false)
  })

  it('is eligible when every lesson is complete and every quiz taken — lessons without a quiz need none', () => {
    const s = courseStatus(course, done('a', 'b', 'c'), scores({ a: [3, 4], b: [4, 4] }))
    expect(s.eligible).toBe(true)
    expect(s.percent).toBe(100)
    expect(s.averageScore).toBe(88) // (0.75 + 1) / 2 = 87.5 → 88
  })

  it('averages only the quizzes that belong to the course', () => {
    const s = courseStatus(course, done('a', 'b', 'c'), scores({ a: [2, 4], b: [4, 4], elsewhere: [0, 4] }))
    expect(s.averageScore).toBe(75)
  })
})

describe('study time and certificate code', () => {
  it('formats minutes as hours and minutes', () => {
    expect(formatStudyTime(45)).toBe('45 min')
    expect(formatStudyTime(120)).toBe('2 h')
    expect(formatStudyTime(119)).toBe('1 h 59 min')
  })

  it('sums lesson durations', () => {
    const c = buildCourses(learningPaths, topics, getTopic)[0]!
    expect(studyMinutes(c)).toBe(c.topics.reduce((s, t) => s + t.estimatedDuration, 0))
  })

  it('is stable, readable and sensitive to every input', () => {
    const base = certificateCode('c', '2026-10-26T10:00:00.000Z', 'Ada Lovelace')
    expect(base).toMatch(/^AV-[0-9A-Z]{3}-[0-9A-Z]{4}$/)
    expect(certificateCode('c', '2026-10-26T10:00:00.000Z', 'Ada Lovelace')).toBe(base)
    expect(certificateCode('c', '2026-10-26T10:00:00.000Z', '  ada lovelace ')).toBe(base) // case and padding do not matter
    expect(certificateCode('d', '2026-10-26T10:00:00.000Z', 'Ada Lovelace')).not.toBe(base)
    expect(certificateCode('c', '2026-10-27T10:00:00.000Z', 'Ada Lovelace')).not.toBe(base)
    expect(certificateCode('c', '2026-10-26T10:00:00.000Z', 'Grace Hopper')).not.toBe(base)
  })
})
