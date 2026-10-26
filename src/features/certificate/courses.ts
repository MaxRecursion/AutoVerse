import { displayPathTitle } from '@/features/home/homeData'
import type { LearningPath, Topic } from '@/lib/schemas'

/**
 * A "course" is something a learner can finish and be certified for: each
 * learning path, plus the whole curriculum. Pure — content and progress are
 * passed in.
 *
 * Earning a certificate takes two things for every lesson in the course:
 * the lesson is completed AND its quiz has been taken. (Marking a lesson
 * complete early is allowed, but it cannot skip the knowledge check.)
 */

export const CURRICULUM_COURSE_ID = 'complete-curriculum'

export interface Course {
  id: string
  title: string
  summary: string
  kind: 'path' | 'curriculum'
  topics: Topic[]
}

export function buildCourses(paths: readonly LearningPath[], topics: readonly Topic[], getTopic: (id: string) => Topic | undefined): Course[] {
  const fromPaths = [...paths]
    .sort((a, b) => a.order - b.order)
    .map((p): Course => {
      const seen = new Set<string>()
      const resolved: Topic[] = []
      for (const id of p.topicIds) {
        const t = getTopic(id)
        if (t && !seen.has(id)) {
          seen.add(id)
          resolved.push(t)
        }
      }
      return { id: p.id, title: displayPathTitle(p), summary: p.summary, kind: 'path', topics: resolved }
    })
    .filter((c) => c.topics.length > 0)
  return [
    ...fromPaths,
    {
      id: CURRICULUM_COURSE_ID,
      title: 'The Complete Car',
      summary: 'Every AutoVerse lesson, from the big picture of how a car works to the engineering detail of each system.',
      kind: 'curriculum',
      topics: [...topics],
    },
  ]
}

export interface QuizScore {
  score: number
  total: number
}

export interface CourseStatus {
  course: Course
  lessonsDone: number
  lessonsTotal: number
  quizzesTaken: number
  quizzesTotal: number
  /** Mean of the best quiz scores taken so far, 0–100; null before any quiz. */
  averageScore: number | null
  /** Lessons and quizzes together, 0–100. */
  percent: number
  eligible: boolean
  remainingLessons: Topic[]
  remainingQuizzes: Topic[]
}

export function courseStatus(course: Course, completed: Readonly<Record<string, string>>, quizScores: Readonly<Record<string, QuizScore>>): CourseStatus {
  const quizzed = course.topics.filter((t) => t.quiz.length > 0)
  const remainingLessons = course.topics.filter((t) => !completed[t.id])
  const remainingQuizzes = quizzed.filter((t) => !quizScores[t.id])
  const taken = quizzed.flatMap((t) => (quizScores[t.id] && quizScores[t.id]!.total > 0 ? [quizScores[t.id]!.score / quizScores[t.id]!.total] : []))
  const lessonsTotal = course.topics.length
  const quizzesTotal = quizzed.length
  const lessonsDone = lessonsTotal - remainingLessons.length
  const quizzesTaken = quizzesTotal - remainingQuizzes.length
  const all = lessonsTotal + quizzesTotal
  return {
    course,
    lessonsDone,
    lessonsTotal,
    quizzesTaken,
    quizzesTotal,
    averageScore: taken.length ? Math.round((taken.reduce((a, b) => a + b, 0) / taken.length) * 100) : null,
    percent: all ? Math.round(((lessonsDone + quizzesTaken) / all) * 100) : 0,
    eligible: remainingLessons.length === 0 && remainingQuizzes.length === 0,
    remainingLessons,
    remainingQuizzes,
  }
}

/** Total reading time of the course's lessons, in minutes. */
export const studyMinutes = (course: Course) => course.topics.reduce((sum, t) => sum + t.estimatedDuration, 0)

/** "1 h 59 min" / "45 min". */
export function formatStudyTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`
}

/**
 * A short reference code for a certificate, derived from the course, the date
 * earned and the name. It makes a printed copy easy to refer to; it is NOT a
 * signature, and nothing can verify it (progress is local to the browser).
 */
export function certificateCode(courseId: string, earnedAt: string, name: string): string {
  const input = `autoverse-certificate-v1|${courseId}|${earnedAt}|${name.trim().toLowerCase()}`
  let h = 0x811c9dc5 // FNV-1a, 32-bit
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  const code = h.toString(36).toUpperCase().padStart(7, '0').slice(-7)
  return `AV-${code.slice(0, 3)}-${code.slice(3)}`
}
