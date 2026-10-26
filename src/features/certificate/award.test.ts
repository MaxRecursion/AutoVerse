import { beforeEach, describe, expect, it } from 'vitest'
import { completeLesson } from '@/features/progress/actions'
import { useProgress } from '@/stores/progress'
import { useToasts } from '@/stores/toasts'
import { checkCertificates, getCourse, getCourses } from './award'
import { CURRICULUM_COURSE_ID } from './courses'

const path = () => getCourses()[0]!
/** Completes every lesson of a course and takes every quiz (as a learner would), without awarding yet. */
function finishAllButLast(courseId: string) {
  const course = getCourse(courseId)!
  const s = useProgress.getState()
  const last = course.topics.at(-1)!
  for (const t of course.topics) {
    if (t.id !== last.id) s.setCompleted(t.id, true)
    if (t.quiz.length) s.recordQuiz(t.id, t.quiz.length, t.quiz.length)
  }
  return last
}

describe('certificates', () => {
  beforeEach(() => {
    useProgress.getState().clearAll()
    useToasts.getState().clear()
  })

  it('awards nothing for a new learner', () => {
    expect(checkCertificates()).toEqual([])
    expect(useProgress.getState().certificates).toEqual({})
    expect(useToasts.getState().toasts).toEqual([])
  })

  it('awards the certificate the moment the last lesson of a course is finished, and says so', () => {
    const last = finishAllButLast(path().id)
    expect(useProgress.getState().certificates).toEqual({})
    completeLesson(last.id)
    const earned = useProgress.getState().certificates[path().id]
    expect(earned?.earnedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    const toast = useToasts.getState().toasts.find((t) => t.title.startsWith('Course complete'))
    expect(toast).toMatchObject({ title: `Course complete: ${path().title}`, action: { to: `/certificate/${path().id}` } })
  })

  it('awards only the courses actually finished', () => {
    const last = finishAllButLast(path().id)
    completeLesson(last.id)
    const held = Object.keys(useProgress.getState().certificates)
    expect(held).toContain(path().id)
    expect(held).not.toContain(CURRICULUM_COURSE_ID)
  })

  it('is idempotent: the date is fixed at first award and there is no second announcement', () => {
    const last = finishAllButLast(path().id)
    completeLesson(last.id)
    const first = useProgress.getState().certificates[path().id]!.earnedAt
    useToasts.getState().clear()
    expect(checkCertificates()).toEqual([])
    expect(useProgress.getState().certificates[path().id]!.earnedAt).toBe(first)
    expect(useToasts.getState().toasts).toEqual([])
  })

  it('does not award on lessons alone — a skipped quiz holds it back until the quiz is taken', () => {
    const course = path()
    const s = useProgress.getState()
    for (const t of course.topics) s.setCompleted(t.id, true)
    expect(checkCertificates()).toEqual([])
    const quizzed = course.topics.filter((t) => t.quiz.length)
    for (const t of quizzed) s.recordQuiz(t.id, 1, t.quiz.length)
    expect(checkCertificates().map((c) => c.id)).toContain(course.id)
  })

  it('catches up on progress made before certificates existed', () => {
    const course = path()
    const s = useProgress.getState()
    for (const t of course.topics) {
      s.setCompleted(t.id, true)
      if (t.quiz.length) s.recordQuiz(t.id, 1, t.quiz.length)
    }
    expect(useProgress.getState().certificates).toEqual({})
    expect(checkCertificates().map((c) => c.id)).toContain(course.id)
  })

  it('keeps the certificate if a lesson is later reopened', () => {
    const last = finishAllButLast(path().id)
    completeLesson(last.id)
    useProgress.getState().setCompleted(last.id, false)
    expect(useProgress.getState().certificates[path().id]).toBeDefined()
  })

  it('is removed with the rest of the learner’s progress', () => {
    const last = finishAllButLast(path().id)
    completeLesson(last.id)
    useProgress.getState().clearAll()
    expect(useProgress.getState().certificates).toEqual({})
  })
})
