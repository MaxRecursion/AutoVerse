import type { SignalKey, LessonSignals } from '@/stores/progress'

/**
 * A lesson is learned in stages. Each stage is derived from evidence of what
 * the learner actually did (see LessonSignals) — never ticked automatically:
 *
 *   Overview → See it work → Go deeper (optional) → Check → Story (optional)
 *
 * Optional stages never block finishing; the core stages do.
 */
export type StageId = 'overview' | 'see' | 'deeper' | 'check' | 'story'

export interface LessonFacts {
  hasLab: boolean
  stepIds: readonly string[]
  hasFlow: boolean
  hasDeeper: boolean
  hasQuiz: boolean
  hasStory: boolean
}

export interface Stage {
  id: StageId
  label: string
  optional: boolean
  done: boolean
  /** Section id to scroll to when the stage is chosen. */
  target: string
  /** What is left to do, or a short confirmation when done. */
  detail: string
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export function lessonStages(facts: LessonFacts, signals: LessonSignals | undefined, quizTaken: boolean): Stage[] {
  const sig: LessonSignals = signals ?? { steps: [] }
  const stages: Stage[] = [
    {
      id: 'overview',
      label: 'Overview',
      optional: false,
      done: !!sig.overview,
      target: 'introduction',
      detail: sig.overview ? 'You read the big picture.' : 'Read the introduction to the end.',
    },
  ]

  const needsSteps = facts.stepIds.length > 0
  const needsLab = facts.hasLab
  const needsFlow = !needsSteps && !needsLab && facts.hasFlow
  if (needsSteps || needsLab || needsFlow) {
    const seen = facts.stepIds.filter((id) => sig.steps.includes(id)).length
    const stepsDone = !needsSteps || seen === facts.stepIds.length
    const labDone = !needsLab || !!sig.lab
    const flowDone = !needsFlow || !!sig.flow
    const todo: string[] = []
    if (!stepsDone) todo.push(`${plural(facts.stepIds.length - seen, 'step')} left to read`)
    if (!labDone) todo.push('try the lab (play, scrub or select a part)')
    if (!flowDone) todo.push('look over the flow diagram')
    stages.push({
      id: 'see',
      label: 'See it work',
      optional: false,
      done: stepsDone && labDone && flowDone,
      target: needsLab ? 'scene' : needsSteps ? 'steps' : 'diagram',
      detail: todo.length ? todo.join('; ') : 'You walked through every step.',
    })
  }

  if (facts.hasDeeper) {
    stages.push({
      id: 'deeper',
      label: 'Go deeper',
      optional: true,
      done: !!sig.deeper,
      target: 'deeper',
      detail: sig.deeper ? 'You explored the engineering detail.' : 'Optional: open a deeper panel or switch to Technical.',
    })
  }

  if (facts.hasQuiz) {
    stages.push({
      id: 'check',
      label: 'Check',
      optional: false,
      done: quizTaken,
      target: 'quiz',
      detail: quizTaken ? 'Quiz finished.' : 'Answer the quiz questions.',
    })
  }

  if (facts.hasStory) {
    stages.push({
      id: 'story',
      label: 'Story',
      optional: true,
      done: !!sig.story,
      target: 'story',
      detail: sig.story ? 'You met the engineer.' : 'Optional: who worked this out?',
    })
  }
  return stages
}

export interface StageSummary {
  coreDone: number
  coreTotal: number
  /** Every non-optional stage is done: the lesson can be finished. */
  ready: boolean
  /** First stage still to do, preferring core stages — "what next". */
  next?: Stage
  /** 0–100 over all stages, optional included. */
  percent: number
}

export function summariseStages(stages: readonly Stage[]): StageSummary {
  const core = stages.filter((s) => !s.optional)
  const coreDone = core.filter((s) => s.done).length
  const done = stages.filter((s) => s.done).length
  return {
    coreDone,
    coreTotal: core.length,
    ready: coreDone === core.length,
    next: core.find((s) => !s.done) ?? stages.find((s) => !s.done),
    percent: stages.length ? Math.round((done / stages.length) * 100) : 0,
  }
}

export type { SignalKey }
