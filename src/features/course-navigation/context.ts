import { createContext, useContext } from 'react'
import type { CourseNavigationModel } from './navigationModel'

export interface CourseNavigationState {
  model: CourseNavigationModel
  collapsed: boolean
  collapse: (collapsed: boolean) => void
  chooseCourse: (courseId: string) => void
  closeMobile: () => void
}

export const CourseNavigationContext = createContext<CourseNavigationState | null>(null)
export const useCourseNavigation = () => useContext(CourseNavigationContext)
