import { topicHref } from '@/components/learning/labels'
import { getTopic, learningPaths, topics } from '@/lib/content'
import { usePreferences } from '@/stores/preferences'
import { progressSnapshot, useProgress } from '@/stores/progress'
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

/** How long Undo stays on offer (the toast pauses while hovered or focused). */
export const UNDO_MS = { bookmark: 6000, clearAll: 10_000 }

/** Removes a bookmark straight away; Undo puts it back in the same place. */
export function removeBookmark(topicId: string, { fromKeyboard = false } = {}) {
  const index = useProgress.getState().bookmarks.indexOf(topicId)
  if (index < 0) return
  useProgress.getState().toggleBookmark(topicId)
  toast({
    title: 'Bookmark removed',
    description: getTopic(topicId)?.title,
    action: { label: 'Undo', onClick: () => useProgress.getState().restoreBookmark(topicId, index) },
    duration: UNDO_MS.bookmark,
    focusAction: fromKeyboard,
  })
}

/**
 * Clears every lesson record and the certificate name straight away, with no
 * confirm step. What was there is held in memory while the Undo toast is up;
 * once it closes, the clear is final.
 */
export function clearAllProgress({ fromKeyboard = false } = {}) {
  const before = progressSnapshot()
  const learnerName = usePreferences.getState().learnerName
  useProgress.getState().clearAll()
  usePreferences.getState().setLearnerName('')
  toast({
    title: 'Progress cleared',
    description: 'Lessons, bookmarks, quiz scores and certificates were removed from this browser.',
    action: {
      label: 'Undo',
      onClick: () => {
        useProgress.getState().restore(before)
        usePreferences.getState().setLearnerName(learnerName)
      },
    },
    duration: UNDO_MS.clearAll,
    focusAction: fromKeyboard,
  })
}
