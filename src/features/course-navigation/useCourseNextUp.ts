import { useMemo } from 'react'
import { useLocation } from 'react-router'
import { categories, getTopic, learningPaths, topics } from '@/lib/content'
import { usePreferences } from '@/stores/preferences'
import { useProgress } from '@/stores/progress'
import { buildCourseNavigation } from './navigationModel'

/** The same course and next-step context used by the navigation and lesson. */
export function useCourseNextUp(currentTopicId?: string) {
  const { pathname } = useLocation()
  const completed = useProgress((state) => state.completed)
  const recent = useProgress((state) => state.recent)
  const preferredCourseId = usePreferences((state) => state.courseId)
  return useMemo(() => {
    const topic = currentTopicId ? getTopic(currentTopicId) : undefined
    return buildCourseNavigation({
      pathname: topic ? `/topics/${topic.slug}` : pathname,
      topics,
      paths: learningPaths,
      categories,
      completed,
      recent,
      preferredCourseId,
    }).nextUp
  }, [completed, recent, preferredCourseId, currentTopicId, pathname])
}
