import type { TourStatus } from '@/stores/preferences'
import type { LessonSignals, QuizResult } from '@/stores/progress'

export type GettingStartedId = 'tour' | 'lesson' | 'lab' | 'quiz' | 'finish' | 'certificate'

/** What the learner has done so far: read from the same stores everything else uses, never set on their behalf. */
export interface GettingStartedEvidence {
  tourStatus: TourStatus
  recent: readonly unknown[]
  lessons: Record<string, LessonSignals>
  quizScores: Record<string, QuizResult>
  completed: Record<string, string>
  certificates: Record<string, unknown>
}

export interface GettingStartedStep {
  id: GettingStartedId
  label: string
  hint: string
  done: boolean
}

/**
 * The first things worth doing in AutoVerse, in order. A step is done only
 * when the stored record shows the learner did it: waving the tour away does
 * not count as taking it, and opening a lab's page does not count as trying it
 * (only doing something in a lesson's lab does).
 */
export function gettingStartedSteps(e: GettingStartedEvidence): GettingStartedStep[] {
  return [
    { id: 'tour', label: 'Take the tour', hint: 'A short walk through lessons, labs and search.', done: e.tourStatus === 'completed' },
    { id: 'lesson', label: 'Open a lesson', hint: 'Start with the big picture: every lesson begins at the surface.', done: e.recent.length > 0 },
    { id: 'lab', label: 'Try a 3D lab', hint: 'Play, scrub or select a part in a lesson’s lab.', done: Object.values(e.lessons).some((l) => l.lab) },
    { id: 'quiz', label: 'Answer a quiz', hint: 'Every lesson ends with a short one; your best score is kept.', done: Object.keys(e.quizScores).length > 0 },
    { id: 'finish', label: 'Finish a lesson', hint: 'Work through its stages, then press Finish.', done: Object.keys(e.completed).length > 0 },
    { id: 'certificate', label: 'Earn a certificate', hint: 'Finish every lesson and quiz in a learning path.', done: Object.keys(e.certificates).length > 0 },
  ]
}

export const gettingStartedDone = (steps: readonly GettingStartedStep[]) => steps.filter((s) => s.done).length
