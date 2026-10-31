import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TopicSchema } from '@/lib/schemas'
import { useProgress } from '@/stores/progress'
import { fixtureTopic } from './__fixtures__/content'
import { LessonQuiz } from './LessonQuiz'

// Question 1 is answered by option 2 ("Four"), question 2 by option 2 ("Expanding gas").
const quiz = TopicSchema.parse(fixtureTopic).quiz

function setup() {
  return render(<LessonQuiz topicId="fixture-engine-cycle" questions={quiz} />)
}
const option = (name: RegExp | string) => screen.getByRole('button', { name })
const burst = () => screen.queryByTestId('burst')

function reduceMotion(reduce: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) => ({ matches: reduce && query.includes('reduce'), media: query, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList,
  )
}

describe('LessonQuiz feedback', () => {
  beforeEach(() => useProgress.getState().clearAll())
  afterEach(() => vi.restoreAllMocks())

  it('shows one dot per question, marks answers right or wrong, and jumps between questions', async () => {
    setup()
    const dots = within(screen.getByRole('list', { name: 'Questions' }))
    expect(dots.getAllByRole('button')).toHaveLength(2)
    expect(dots.getByRole('button', { name: 'Question 1, not answered' })).toHaveAttribute('aria-current', 'true')
    await userEvent.click(option(/Two/))
    expect(dots.getByRole('button', { name: 'Question 1, answered incorrectly' })).toBeInTheDocument()
    await userEvent.click(dots.getByRole('button', { name: /Question 2/ }))
    expect(screen.getByRole('heading', { name: /What pushes the piston down/ })).toBeInTheDocument()
    await userEvent.click(option(/Expanding gas/))
    expect(dots.getByRole('button', { name: 'Question 2, answered correctly' })).toHaveAttribute('aria-current', 'true')
  })

  it('throws sparks for a correct answer given now, not for a wrong one', async () => {
    reduceMotion(false)
    setup()
    await userEvent.click(option(/Two/))
    expect(burst()).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Next question' }))
    await userEvent.click(option(/Expanding gas/))
    expect(burst()).toBeInTheDocument()
  })

  it('does not replay the sparks when you come back to an answered question', async () => {
    reduceMotion(false)
    setup()
    await userEvent.click(option(/Four/))
    expect(burst()).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Next question' }))
    await userEvent.click(screen.getByRole('button', { name: 'Previous' }))
    expect(screen.getByRole('button', { name: /Four/ })).toBeInTheDocument()
    expect(burst()).not.toBeInTheDocument()
  })

  it('draws no sparks for readers who ask for reduced motion', async () => {
    reduceMotion(true)
    setup()
    await userEvent.click(option(/Four/))
    expect(burst()).not.toBeInTheDocument()
    // The result of the answer is still shown in words.
    expect(screen.getByText('Correct.')).toBeInTheDocument()
  })

  it('marks a score that beats the previous best, and only then', async () => {
    reduceMotion(true)
    useProgress.setState({ quizScores: { 'fixture-engine-cycle': { score: 1, total: 2, at: '2026-10-01T00:00:00.000Z' } } })
    const { unmount } = setup()
    await userEvent.click(option(/Four/))
    await userEvent.click(screen.getByRole('button', { name: 'Next question' }))
    await userEvent.click(option(/Expanding gas/))
    await userEvent.click(screen.getByRole('button', { name: 'See your score' }))
    expect(screen.getByLabelText('Quiz result')).toHaveTextContent('New best')
    unmount()

    // The same 2 of 2 again no longer beats the (now equal) best.
    setup()
    await userEvent.click(option(/Four/))
    await userEvent.click(screen.getByRole('button', { name: 'Next question' }))
    await userEvent.click(option(/Expanding gas/))
    await userEvent.click(screen.getByRole('button', { name: 'See your score' }))
    expect(screen.getByLabelText('Quiz result')).not.toHaveTextContent('New best')
  })
})
