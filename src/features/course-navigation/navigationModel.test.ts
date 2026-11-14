import { describe, expect, it } from 'vitest'
import { CURRICULUM_COURSE_ID } from '@/features/certificate/courses'
import { resolveNextUp } from '@/features/progress/curriculum'
import { categories, learningPaths, topics, getTopic } from '@/lib/content'
import { buildCourseNavigation, resolveNavigationCourseId, type CourseNavigationInput } from './navigationModel'

const input = (overrides: Partial<CourseNavigationInput> = {}): CourseNavigationInput => ({ pathname: '/learn', topics, paths: learningPaths, categories, completed: {}, recent: [], ...overrides })

describe('course navigation model', () => {
  it('offers the three courses and every lesson without inventing a current page for a new visitor', () => {
    const model = buildCourseNavigation(input())
    expect(model.courses.map((course) => course.id)).toEqual([...learningPaths.map((path) => path.id), CURRICULUM_COURSE_ID])
    expect(model.activeCourse.id).toBe('how-a-car-moves')
    expect(model.position).toBeNull()
    expect(model.entries.some((entry) => entry.isCurrent)).toBe(false)
    expect(model.courses.at(-1)?.topics).toHaveLength(topics.length)
  })

  it('opens the current lesson’s course and exposes its one-based position', () => {
    const model = buildCourseNavigation(input({ pathname: '/topics/manual-gearbox' }))
    expect(model.activeCourse.id).toBe('how-a-car-moves')
    expect(model.position).toBe(5)
    expect(model.entries.filter((entry) => entry.isCurrent).map((entry) => entry.topic.id)).toEqual(['manual-gearbox'])
  })

  it('honors a chosen course when a lesson belongs to more than one course', () => {
    const model = buildCourseNavigation(input({ pathname: '/topics/four-stroke-cycle', preferredCourseId: 'inside-the-engine' }))
    expect(model.activeCourse.id).toBe('inside-the-engine')
    expect(model.position).toBe(1)
    expect(model.nextUp.topic?.id).toBe('pistons-and-crankshaft')
  })

  it('shows an unrelated lesson in its own course and keeps outside-path lessons reachable', () => {
    const unrelated = buildCourseNavigation(input({ pathname: '/topics/disc-brakes', preferredCourseId: 'inside-the-engine' }))
    expect(unrelated.activeCourse.id).toBe('stopping-steering-and-grip')
    const outside = buildCourseNavigation(input({ pathname: '/topics/alternator-and-charging' }))
    expect(outside.currentTopic?.id).toBe('alternator-and-charging')
    expect(outside.activeCourse.id).toBe(CURRICULUM_COURSE_ID)
    expect(outside.position).not.toBeNull()
  })

  it('follows recent course activity away from lessons without claiming its lesson is currently open', () => {
    const model = buildCourseNavigation(input({ pathname: '/progress', recent: [{ topicId: 'disc-brakes' }] }))
    expect(model.activeCourse.id).toBe('stopping-steering-and-grip')
    expect(model.position).toBeNull()
    expect(model.entries.some((entry) => entry.isCurrent)).toBe(false)
    expect(buildCourseNavigation(input({ pathname: '/progress', preferredCourseId: 'inside-the-engine', recent: [{ topicId: 'disc-brakes' }] })).activeCourse.id).toBe('inside-the-engine')
  })

  it('groups All lessons by system, highlights a system hub and preserves course order', () => {
    const model = buildCourseNavigation(input({ pathname: '/learn/engine', preferredCourseId: CURRICULUM_COURSE_ID }))
    expect(model.activeCourse.id).toBe(CURRICULUM_COURSE_ID)
    expect(model.currentCategory?.id).toBe('engine')
    expect(model.groups.map((group) => group.category?.order)).toEqual([...model.groups.map((group) => group.category!.order)].sort((a, b) => a - b))
    expect(model.groups.flatMap((group) => group.entries.map((entry) => entry.position))).toEqual(model.entries.map((entry) => entry.position))
  })

  it('derives complete and started markers only from recorded evidence, not from visiting', () => {
    const completed = { 'how-a-car-works': '2026-11-14' }
    const lessons = { 'four-stroke-cycle': { overview: true as const, steps: [] } }
    const model = buildCourseNavigation(input({ pathname: '/topics/manual-gearbox', completed, lessons }))
    expect(model.entries.slice(0, 3).map((entry) => entry.status)).toEqual(['done', 'started', 'todo'])
    expect(model.entries.find((entry) => entry.isCurrent)?.status).toBe('todo')
    expect([model.activeCourse.completed, model.activeCourse.total, model.activeCourse.percent]).toEqual([1, 9, 11])
    expect(completed).toEqual({ 'how-a-car-works': '2026-11-14' })
    expect(lessons).toEqual({ 'four-stroke-cycle': { overview: true, steps: [] } })
  })

  it('uses the same next-step resolver and course preference as the rest of the app', () => {
    const values = input({ pathname: '/topics/four-stroke-cycle', preferredCourseId: 'inside-the-engine' })
    const model = buildCourseNavigation(values)
    expect(model.nextUp).toEqual(resolveNextUp({ ...values, getTopic, currentTopicId: 'four-stroke-cycle' }))
  })

  it('uses one All-lessons position for both the sidebar and journey on a lesson outside the curated paths', () => {
    const model = buildCourseNavigation(input({ pathname: '/topics/alternator-and-charging' }))
    expect(model.activeCourse.id).toBe(CURRICULUM_COURSE_ID)
    expect(model.nextUp.route?.kind).toBe('curriculum')
    expect(model.nextUp.route?.topics.map((topic) => topic.id)).toEqual(model.entries.map((entry) => entry.topic.id))
    expect(model.position).toBe(model.nextUp.route!.index + 1)
    expect(model.activeCourse.total).toBe(model.nextUp.route?.topics.length)
  })

  it('resumes a recent outside-path lesson globally instead of forcing the beginner course', () => {
    const values = input({ pathname: '/progress', recent: [{ topicId: 'alternator-and-charging' }] })
    const context = { ...values, getTopic }
    const model = buildCourseNavigation(values)
    expect(resolveNavigationCourseId(context)).toBe(CURRICULUM_COURSE_ID)
    expect(model.activeCourse.id).toBe(CURRICULUM_COURSE_ID)
    expect(model.nextUp.topic?.id).toBe('alternator-and-charging')
    expect(model.nextUp.kind).toBe('continue')
    expect(model.nextUp).toEqual(resolveNextUp({ ...context, preferredCourseId: resolveNavigationCourseId(context) }))
  })

  it('retains the selected or resumed course while browsing a system hub', () => {
    const model = buildCourseNavigation(input({ pathname: '/learn/engine', recent: [{ topicId: 'disc-brakes' }] }))
    expect(model.currentCategory?.id).toBe('engine')
    expect(model.activeCourse.id).toBe('stopping-steering-and-grip')
  })

  it('keeps course, journey order and position aligned for every lesson and course choice', () => {
    for (const topic of topics) {
      for (const preferredCourseId of [undefined, ...learningPaths.map((path) => path.id), CURRICULUM_COURSE_ID]) {
        const model = buildCourseNavigation(input({ pathname: `/topics/${topic.slug}`, preferredCourseId }))
        expect(model.nextUp.route?.topics.map((item) => item.id)).toEqual(model.entries.map((entry) => entry.topic.id))
        expect(model.position).toBe(model.nextUp.route!.index + 1)
      }
    }
  })

  it('ignores unknown routes and invalid preferences and skips unwritten/duplicate path ids', () => {
    const sparse = { ...learningPaths[0]!, topicIds: ['missing', 'how-a-car-works', 'how-a-car-works'] }
    const model = buildCourseNavigation(input({ pathname: '/topics/%broken', paths: [sparse], preferredCourseId: 'deleted' }))
    expect(model.currentTopic).toBeUndefined()
    expect(model.activeCourse.topics.map((topic) => topic.id)).toEqual(['how-a-car-works'])
    expect(model.activeCourse.total).toBe(1)
  })
})
