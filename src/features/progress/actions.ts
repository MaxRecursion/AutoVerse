import { topicHref } from '@/components/learning/labels'
import { getTopic, learningPaths, topics } from '@/lib/content'
import { useProgress } from '@/stores/progress'
import { toast } from '@/stores/toasts'
import { checkCertificates } from '@/features/certificate/award'
import { overallProgress, resolveNextUp } from './curriculum'

/** Marks a lesson complete and tells the learner what it changed and where to go next. */
export function completeLesson(topicId: string) {
  useProgress.getState().setCompleted(topicId, true)
  const { completed, recent } = useProgress.getState()
  const total = overallProgress(topics, completed)
  const next = resolveNextUp({ topics, paths: learningPaths, completed, recent, getTopic, currentTopicId: topicId })
  const done = getTopic(topicId)
  const routeNote =
    next.kind === 'new-route' ? 'You finished this learning path. ' : next.kind === 'done' ? 'Every lesson is complete. ' : ''
  toast({
    tone: 'success',
    title: `Lesson complete${done ? `: ${done.title}` : ''}`,
    description: `${routeNote}${total.completed} of ${total.total} lessons done.`,
    action: next.topic ? { label: `${next.label}: ${next.topic.title}`, to: topicHref(next.topic) } : { label: 'See your progress', to: '/progress' },
    duration: 9000,
  })
  checkCertificates()
}

export function reopenLesson(topicId: string) {
  useProgress.getState().setCompleted(topicId, false)
}
