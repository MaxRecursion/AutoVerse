import type { LessonSignals } from '@/stores/progress'

export type LessonStatus = 'done' | 'started' | 'todo'

/** done = completed; started = the learner has left evidence in the lesson (read, played, explored). */
export function lessonStatus(topicId: string, completed: Record<string, string>, lessons: Record<string, LessonSignals>): LessonStatus {
  if (completed[topicId]) return 'done'
  const s = lessons[topicId]
  return s && (s.overview || s.lab || s.deeper || s.story || s.flow || s.steps.length > 0) ? 'started' : 'todo'
}
