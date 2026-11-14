/** Pure course tree and route orientation. Navigation never awards learning progress. */
import { buildCourses, CURRICULUM_COURSE_ID, type Course } from '@/features/certificate/courses'
import { curriculumOrder, resolveNextUp, resolveRoute, type NextUp, type NextUpContext } from '@/features/progress/curriculum'
import { resolveCurrentPathProgress, resolvePathProgress } from '@/features/progress/paths'
import { lessonStatus, type LessonStatus } from '@/features/progress/status'
import type { Category, LearningPath, Topic } from '@/lib/schemas'
import type { LessonSignals } from '@/stores/progress'

export interface CourseNavigationInput {
  /** Router pathname, with its configured basename already removed. */
  pathname: string
  topics: readonly Topic[]
  paths: readonly LearningPath[]
  categories: readonly Category[]
  completed: Record<string, string>
  lessons?: Record<string, LessonSignals>
  recent: readonly { topicId: string }[]
  preferredCourseId?: string
}

export interface NavigationCourse extends Course {
  completed: number
  total: number
  percent: number
}

export interface NavigationEntry {
  topic: Topic
  category?: Category
  /** One-based position in the course, preserved when filtering the tree. */
  position: number
  status: LessonStatus
  isCurrent: boolean
}

export interface NavigationGroup {
  id: string
  title: string
  category?: Category
  entries: NavigationEntry[]
}

export interface CourseNavigationModel {
  courses: NavigationCourse[]
  activeCourse: NavigationCourse
  currentTopic?: Topic
  currentCategory?: Category
  /** Null outside a lesson page; recent history is never labelled "you are here". */
  position: number | null
  entries: NavigationEntry[]
  groups: NavigationGroup[]
  nextUp: NextUp
}

/**
 * Shared navigation context for the sidebar and its next-step consumers.
 * A system-only lesson belongs to All lessons here; the generic curriculum
 * resolver can retain its narrower system fallback for other callers.
 */
export function resolveNavigationCourseId(context: NextUpContext): string {
  const { preferredCourseId, paths, getTopic, completed, recent } = context
  if (preferredCourseId === CURRICULUM_COURSE_ID) return CURRICULUM_COURSE_ID
  const current = context.currentTopicId ? getTopic(context.currentTopicId) : undefined
  const preferred = paths.find((path) => path.id === preferredCourseId && resolvePathProgress(path, getTopic, completed).total > 0)
  if (preferred && (!current || preferred.topicIds.includes(current.id))) return preferred.id
  if (current) return resolveRoute(current, { ...context, preferredCourseId: undefined }).path?.path.id ?? CURRICULUM_COURSE_ID

  // Let the existing resolver identify what is being resumed, including a lesson outside all paths.
  const next = resolveNextUp({ ...context, preferredCourseId: undefined })
  if (next.topic) return resolveRoute(next.topic, { ...context, preferredCourseId: undefined }).path?.path.id ?? CURRICULUM_COURSE_ID
  if (next.kind === 'done' && context.topics.some((topic) => !completed[topic.id])) return CURRICULUM_COURSE_ID
  return resolveCurrentPathProgress(paths, recent.map((item) => item.topicId), getTopic, completed)?.path.id ?? CURRICULUM_COURSE_ID
}

function routeSlug(pathname: string, prefix: string): string | undefined {
  const path = pathname.split(/[?#]/)[0] ?? ''
  if (!path.startsWith(prefix)) return undefined
  const slug = path.slice(prefix.length).replace(/\/$/, '')
  if (!slug || slug.includes('/')) return undefined
  try {
    return decodeURIComponent(slug)
  } catch {
    return slug
  }
}

export function buildCourseNavigation(input: CourseNavigationInput): CourseNavigationModel {
  const { pathname, topics, paths, categories, completed, lessons = {}, recent, preferredCourseId } = input
  const topicById = new Map(topics.map((topic) => [topic.id, topic]))
  const categoryById = new Map(categories.map((category) => [category.id, category]))
  const getTopic = (id: string) => topicById.get(id)
  const context = { topics, paths, categories, completed, recent, getTopic, preferredCourseId }
  const currentSlug = routeSlug(pathname, '/topics/')
  const currentTopic = currentSlug ? topics.find((topic) => topic.slug === currentSlug) : undefined
  const categorySlug = routeSlug(pathname, '/learn/')
  const currentCategory = currentTopic ? categoryById.get(currentTopic.categoryId) : categories.find((category) => category.slug === categorySlug)
  const courses = buildCourses(paths, curriculumOrder(topics, categories), getTopic).map((course): NavigationCourse => {
    const done = course.topics.filter((topic) => completed[topic.id]).length
    return { ...course, title: course.kind === 'curriculum' ? 'All lessons' : course.title, completed: done, total: course.topics.length, percent: course.topics.length ? Math.round((done / course.topics.length) * 100) : 0 }
  })
  const effectiveContext = { ...context, currentTopicId: currentTopic?.id }
  const effectiveCourseId = resolveNavigationCourseId(effectiveContext)
  const all = courses.find((course) => course.id === CURRICULUM_COURSE_ID)!
  const activeCourse = courses.find((course) => course.id === effectiveCourseId) ?? all
  const entries = activeCourse.topics.map((topic, index): NavigationEntry => ({
    topic,
    category: categoryById.get(topic.categoryId),
    position: index + 1,
    status: lessonStatus(topic.id, completed, lessons),
    isCurrent: topic.id === currentTopic?.id,
  }))
  // Consecutive groups preserve a curated course's authored sequence, even if it returns to a system.
  const groups: NavigationGroup[] = []
  for (const entry of entries) {
    const previous = groups.at(-1)
    if (previous?.entries[0]?.topic.categoryId === entry.topic.categoryId) previous.entries.push(entry)
    else groups.push({ id: `${entry.topic.categoryId}-${entry.position}`, title: entry.category?.title ?? 'Other lessons', category: entry.category, entries: [entry] })
  }
  return {
    courses,
    activeCourse,
    currentTopic,
    currentCategory,
    position: entries.find((entry) => entry.isCurrent)?.position ?? null,
    entries,
    groups,
    nextUp: resolveNextUp({ ...effectiveContext, preferredCourseId: effectiveCourseId }),
  }
}
