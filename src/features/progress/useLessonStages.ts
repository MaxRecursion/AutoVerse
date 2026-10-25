import { useEffect, useMemo, useRef } from 'react'
import { useProgress } from '@/stores/progress'
import { toast } from '@/stores/toasts'
import { lessonStages, summariseStages, type LessonFacts } from './stages'

/**
 * Stage state for one lesson, derived from stored evidence. Also acknowledges
 * progress as it happens: a short toast when a stage newly completes, and one
 * when the core stages are done and the lesson can be finished.
 * `facts` must be referentially stable (memoise it).
 */
export function useLessonStages(topicId: string, facts: LessonFacts) {
  const signals = useProgress((s) => s.lessons[topicId])
  const quizTaken = useProgress((s) => !!s.quizScores[topicId])
  const complete = useProgress((s) => !!s.completed[topicId])
  const stages = useMemo(() => lessonStages(facts, signals, quizTaken), [facts, signals, quizTaken])
  const summary = useMemo(() => summariseStages(stages), [stages])

  const previous = useRef(new Map(stages.map((s) => [s.id, s.done])))
  const wasReady = useRef(summary.ready)
  useEffect(() => {
    const newlyDone = stages.filter((s) => s.done && !previous.current.get(s.id))
    previous.current = new Map(stages.map((s) => [s.id, s.done]))
    const becameReady = summary.ready && !wasReady.current
    wasReady.current = summary.ready
    if (complete) return
    if (becameReady) {
      toast({
        tone: 'success',
        title: 'Core stages complete',
        description: 'You have covered everything this lesson needs. Finish it from the bar above whenever you are ready.',
        duration: 7000,
      })
      return
    }
    for (const stage of newlyDone) {
      toast({
        tone: 'success',
        title: stage.optional ? `${stage.label}: explored` : `${stage.label}: done`,
        description: summary.next ? `Next: ${summary.next.label}. ${summary.next.detail}` : undefined,
        duration: 4000,
      })
    }
  }, [stages, summary, complete])

  return { stages, summary, complete }
}
