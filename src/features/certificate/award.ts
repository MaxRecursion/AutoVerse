import { getTopic, learningPaths, topics } from '@/lib/content'
import { useProgress } from '@/stores/progress'
import { toast } from '@/stores/toasts'
import { buildCourses, courseStatus, type Course } from './courses'

/** Courses in display order (paths, then the whole curriculum). */
export const getCourses = (): Course[] => buildCourses(learningPaths, topics, getTopic)
export const getCourse = (id: string) => getCourses().find((c) => c.id === id)

/**
 * Awards a certificate for every course the learner has now finished and does
 * not yet hold, and says so. Idempotent: call it after anything that can
 * complete a lesson or a quiz (and when opening a page that lists certificates,
 * to cover progress made before this feature existed).
 */
export function checkCertificates(): Course[] {
  const { completed, quizScores, certificates, awardCertificate } = useProgress.getState()
  const awarded: Course[] = []
  for (const course of getCourses()) {
    if (certificates[course.id] || !courseStatus(course, completed, quizScores).eligible) continue
    awardCertificate(course.id)
    awarded.push(course)
    toast({
      tone: 'success',
      title: `Course complete: ${course.title}`,
      description: 'Your certificate is ready.',
      action: { label: 'View certificate', to: `/certificate/${course.id}` },
      duration: 12_000,
    })
  }
  return awarded
}
