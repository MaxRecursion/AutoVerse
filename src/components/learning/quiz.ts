import type { QuizQuestion } from '@/lib/schemas'

/** Chosen option index per question id. */
export type QuizAnswers = Readonly<Record<string, number>>

export interface QuizScore {
  correct: number
  answered: number
  total: number
  /** Every question has an answer. */
  finished: boolean
  /** 0–100 of the total (unanswered questions count as wrong). */
  percent: number
}

export const isCorrectAnswer = (q: Pick<QuizQuestion, 'answerIndex'>, choice: number | undefined): boolean => choice === q.answerIndex

/** Score a (possibly partial) attempt. Answers to unknown question ids are ignored. */
export function scoreQuiz(questions: readonly QuizQuestion[], answers: QuizAnswers): QuizScore {
  let correct = 0
  let answered = 0
  for (const q of questions) {
    const choice = answers[q.id]
    if (choice === undefined) continue
    answered++
    if (isCorrectAnswer(q, choice)) correct++
  }
  const total = questions.length
  return { correct, answered, total, finished: total > 0 && answered === total, percent: total ? Math.round((correct / total) * 100) : 0 }
}

/** Record an answer unless the question was already answered (answers lock for immediate feedback). */
export function answerQuestion(answers: QuizAnswers, questionId: string, choice: number): QuizAnswers {
  if (answers[questionId] !== undefined) return answers
  return { ...answers, [questionId]: choice }
}

/** Index of the first unanswered question at or after `from` (wrapping), or -1 when all are answered. */
export function nextUnanswered(questions: readonly QuizQuestion[], answers: QuizAnswers, from = 0): number {
  const n = questions.length
  for (let i = 0; i < n; i++) {
    const idx = (from + i) % n
    if (answers[questions[idx].id] === undefined) return idx
  }
  return -1
}

/** Short, honest verdict for a finished attempt. */
export function scoreVerdict(percent: number): string {
  if (percent === 100) return 'Full marks.'
  if (percent >= 75) return 'Solid understanding.'
  if (percent >= 50) return 'Getting there — review the steps above and try again.'
  return 'Worth another read — the explanations above cover each answer.'
}
