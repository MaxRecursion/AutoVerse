import { describe, expect, it } from 'vitest'
import { QuizQuestionSchema } from '@/lib/schemas'
import { answerQuestion, isCorrectAnswer, nextUnanswered, scoreQuiz, scoreVerdict } from './quiz'

const q = (id: string, answerIndex: number) =>
  QuizQuestionSchema.parse({ id, prompt: `Question ${id}`, options: ['A', 'B', 'C'], answerIndex, explanation: 'Because.' })

const questions = [q('one', 0), q('two', 1), q('three', 2)]

describe('quiz scoring', () => {
  it('scores an empty attempt', () => {
    expect(scoreQuiz(questions, {})).toEqual({ correct: 0, answered: 0, total: 3, finished: false, percent: 0 })
  })

  it('scores a partial attempt against the total', () => {
    expect(scoreQuiz(questions, { one: 0, two: 2 })).toEqual({ correct: 1, answered: 2, total: 3, finished: false, percent: 33 })
  })

  it('finishes when every question is answered', () => {
    expect(scoreQuiz(questions, { one: 0, two: 1, three: 0 })).toMatchObject({ correct: 2, finished: true, percent: 67 })
    expect(scoreQuiz(questions, { one: 0, two: 1, three: 2 })).toMatchObject({ correct: 3, percent: 100 })
  })

  it('ignores answers to unknown questions and handles an empty quiz', () => {
    expect(scoreQuiz(questions, { nope: 1 })).toMatchObject({ answered: 0 })
    expect(scoreQuiz([], {})).toEqual({ correct: 0, answered: 0, total: 0, finished: false, percent: 0 })
  })

  it('locks the first answer to each question', () => {
    const a1 = answerQuestion({}, 'one', 2)
    expect(a1).toEqual({ one: 2 })
    const a2 = answerQuestion(a1, 'one', 0)
    expect(a2).toBe(a1)
    expect(isCorrectAnswer(questions[0], a2.one)).toBe(false)
  })

  it('finds the next unanswered question, wrapping around', () => {
    expect(nextUnanswered(questions, {})).toBe(0)
    expect(nextUnanswered(questions, { one: 0 }, 0)).toBe(1)
    expect(nextUnanswered(questions, { two: 0, three: 0 }, 1)).toBe(0)
    expect(nextUnanswered(questions, { one: 0, two: 0, three: 0 })).toBe(-1)
  })

  it('gives a verdict for every band', () => {
    expect(scoreVerdict(100)).toMatch(/full marks/i)
    expect(scoreVerdict(80)).toMatch(/solid/i)
    expect(scoreVerdict(50)).toMatch(/getting there/i)
    expect(scoreVerdict(0)).toMatch(/another read/i)
  })
})
