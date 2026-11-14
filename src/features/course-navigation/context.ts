import { createContext, useContext } from 'react'
import type { Topic } from '@/lib/schemas'
import type { CourseNavigationModel, NavigationCourse } from './navigationModel'

/** A course picked on this page that leaves out the open lesson: shown in the outline, not yet saved. */
export interface CoursePreview {
  lesson: Topic
  /** The course the open lesson was shown in; going back returns to it. */
  from: NavigationCourse
}

export interface CourseNavigationState {
  model: CourseNavigationModel
  preview?: CoursePreview
  collapsed: boolean
  collapse: (collapsed: boolean) => void
  /** Never navigates, so stepping through the course list with the arrow keys stays on the page. */
  chooseCourse: (courseId: string) => void
  /** Saves the previewed course; called as the learner opens one of its lessons. */
  keepPreview: () => void
  /** Returns the outline to the open lesson's course. */
  endPreview: () => void
  closeMobile: () => void
}

export const CourseNavigationContext = createContext<CourseNavigationState | null>(null)
export const useCourseNavigation = () => useContext(CourseNavigationContext)
