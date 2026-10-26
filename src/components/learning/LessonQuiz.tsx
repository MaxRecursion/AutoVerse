import { useEffect, useId, useRef, useState, type Ref } from 'react'
import { ArrowLeft, ArrowRight, Check, RotateCcw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { QuizQuestion } from '@/lib/schemas'
import { cn } from '@/lib/utils'
import { checkCertificates } from '@/features/certificate/award'
import { useProgress } from '@/stores/progress'
import { answerQuestion, isCorrectAnswer, nextUnanswered, scoreQuiz, scoreVerdict, type QuizAnswers } from './quiz'

type QuizMode = 'single' | 'all'

interface LessonQuizProps {
  topicId: string
  questions: readonly QuizQuestion[]
}

const LETTERS = 'ABCDEF'

/**
 * Lesson quiz: one question at a time (default) or all at once. Each answer
 * locks and shows immediate feedback with the explanation; when every
 * question is answered the score is stored locally (best attempt kept).
 */
export function LessonQuiz({ topicId, questions }: LessonQuizProps) {
  const [answers, setAnswers] = useState<QuizAnswers>({})
  const [mode, setMode] = useState<QuizMode>('single')
  const [index, setIndex] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const recordQuiz = useProgress((s) => s.recordQuiz)
  const best = useProgress((s) => s.quizScores[topicId])
  const headingRef = useRef<HTMLHeadingElement>(null)
  const summaryRef = useRef<HTMLElement>(null)
  const focusPending = useRef(false)

  const score = scoreQuiz(questions, answers)

  useEffect(() => {
    if (!focusPending.current) return
    focusPending.current = false
    // The current question's heading, or the result once the last question is done.
    ;(headingRef.current ?? summaryRef.current)?.focus()
  }, [index, attempt, mode])

  const answer = (q: QuizQuestion, choice: number) => {
    const next = answerQuestion(answers, q.id, choice)
    if (next === answers) return
    setAnswers(next)
    const s = scoreQuiz(questions, next)
    if (s.finished) {
      recordQuiz(topicId, s.correct, s.total)
      checkCertificates()
    }
  }

  const goTo = (i: number) => {
    focusPending.current = true
    setIndex(i)
  }

  const retry = () => {
    focusPending.current = true
    setAnswers({})
    setIndex(0)
    setAttempt((a) => a + 1)
  }

  const current = questions[Math.min(index, questions.length - 1)]
  const showSummary = score.finished && (mode === 'all' || index >= questions.length)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm tabular-nums text-steel-300" aria-live="polite">
          {score.answered} of {score.total} answered
          {score.answered > 0 && <span className="text-steel-400"> · {score.correct} correct</span>}
        </p>
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={mode}
          onValueChange={(v) => {
            if (!v) return
            focusPending.current = false
            setMode(v as QuizMode)
            if (v === 'single') {
              const missing = nextUnanswered(questions, answers)
              setIndex(missing === -1 ? questions.length : missing)
            }
          }}
          aria-label="Quiz layout"
        >
          <ToggleGroupItem value="single" className="h-9 px-3 text-xs data-[state=on]:bg-cyan/15 data-[state=on]:text-cyan">
            One at a time
          </ToggleGroupItem>
          <ToggleGroupItem value="all" className="h-9 px-3 text-xs data-[state=on]:bg-cyan/15 data-[state=on]:text-cyan">
            All questions
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {mode === 'single' && !showSummary && current && (
        <div className="flex flex-col gap-3">
          <QuestionCard
            key={`${attempt}-${current.id}`}
            question={current}
            number={index + 1}
            total={questions.length}
            choice={answers[current.id]}
            onAnswer={(c) => answer(current, c)}
            headingRef={headingRef}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="ghost" className="h-10" disabled={index === 0} onClick={() => goTo(index - 1)}>
              <ArrowLeft aria-hidden /> Previous
            </Button>
            {index < questions.length - 1 ? (
              <Button variant={answers[current.id] !== undefined ? 'default' : 'outline'} className="h-10" onClick={() => goTo(index + 1)}>
                {answers[current.id] !== undefined ? 'Next question' : 'Skip for now'} <ArrowRight aria-hidden />
              </Button>
            ) : (
              <Button
                className="h-10"
                onClick={() => {
                  const missing = nextUnanswered(questions, answers)
                  goTo(missing === -1 ? questions.length : missing)
                }}
              >
                {score.finished ? 'See your score' : 'Answer remaining questions'} <ArrowRight aria-hidden />
              </Button>
            )}
          </div>
        </div>
      )}

      {mode === 'all' && (
        <ol className="flex flex-col gap-3">
          {questions.map((q, i) => (
            <li key={`${attempt}-${q.id}`}>
              <QuestionCard
                question={q}
                number={i + 1}
                total={questions.length}
                choice={answers[q.id]}
                onAnswer={(c) => answer(q, c)}
                headingRef={i === 0 ? headingRef : undefined}
              />
            </li>
          ))}
        </ol>
      )}

      {showSummary && (
        <section
          ref={summaryRef}
          tabIndex={-1}
          aria-label="Quiz result"
          className="panel flex flex-col gap-3 p-5 outline-none sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p className="eyebrow">Your score</p>
            <p className="mt-1 font-display text-3xl tabular-nums text-paper">
              {score.correct}
              <span className="text-steel-400"> / {score.total}</span>
            </p>
            <p className="mt-1 text-sm text-steel-300">{scoreVerdict(score.percent)}</p>
            {best && (
              <p className="mt-1 text-xs text-steel-400">
                Best score saved in this browser: {best.score} / {best.total}
              </p>
            )}
          </div>
          <Button variant="outline" className="h-10 self-start sm:self-center" onClick={retry}>
            <RotateCcw aria-hidden /> Retry quiz
          </Button>
        </section>
      )}

      {mode === 'single' && !showSummary && best && (
        <p className="text-xs text-steel-400">
          Previous best: {best.score} / {best.total}
        </p>
      )}
    </div>
  )
}

interface QuestionCardProps {
  question: QuizQuestion
  number: number
  total: number
  choice: number | undefined
  onAnswer: (choice: number) => void
  headingRef?: Ref<HTMLHeadingElement>
}

function QuestionCard({ question, number, total, choice, onAnswer, headingRef }: QuestionCardProps) {
  const uid = useId()
  const answered = choice !== undefined
  const correct = isCorrectAnswer(question, choice)
  const promptId = `${uid}-prompt`
  const feedbackId = `${uid}-feedback`

  return (
    <div className="panel p-4 sm:p-5" role="group" aria-labelledby={promptId} data-testid={`quiz-question-${question.id}`}>
      <p className="eyebrow">
        Question {number} of {total}
      </p>
      <h3 id={promptId} ref={headingRef} tabIndex={-1} className="mt-1.5 text-base font-semibold leading-snug text-paper outline-none sm:text-lg">
        {question.prompt}
      </h3>
      <ul className="mt-4 flex flex-col gap-2">
        {question.options.map((option, i) => {
          const isChoice = choice === i
          const isAnswer = i === question.answerIndex
          const state = !answered ? 'idle' : isAnswer ? 'correct' : isChoice ? 'wrong' : 'dim'
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => onAnswer(i)}
                aria-disabled={answered || undefined}
                aria-describedby={answered ? feedbackId : undefined}
                className={cn(
                  'flex min-h-11 w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors',
                  state === 'idle' && 'border-white/[0.1] bg-graphite-850 text-paper hover:border-cyan/50 hover:bg-graphite-800',
                  state === 'correct' && 'border-ok/50 bg-ok/[0.08] text-paper',
                  state === 'wrong' && 'border-danger/50 bg-danger/[0.08] text-paper',
                  state === 'dim' && 'border-white/[0.06] text-steel-400',
                  answered && 'cursor-default',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'grid size-6 shrink-0 place-items-center rounded-md border font-mono text-[11px]',
                    state === 'correct' ? 'border-ok/60 text-ok' : state === 'wrong' ? 'border-danger/60 text-danger' : 'border-white/15 text-steel-300',
                  )}
                >
                  {state === 'correct' ? <Check className="size-3.5" /> : state === 'wrong' ? <X className="size-3.5" /> : LETTERS[i]}
                </span>
                <span className="flex-1">{option}</span>
                {answered && isAnswer && <span className="sr-only">(correct answer)</span>}
                {answered && isChoice && <span className="sr-only">(your answer)</span>}
              </button>
            </li>
          )
        })}
      </ul>
      <div id={feedbackId} aria-live="polite">
        {answered && (
          <div className={cn('mt-4 rounded-lg border-l-2 bg-graphite-850/80 px-4 py-3 text-sm leading-relaxed', correct ? 'border-ok' : 'border-danger')}>
            <p className={cn('font-medium', correct ? 'text-ok' : 'text-danger')}>{correct ? 'Correct.' : 'Not quite.'}</p>
            <p className="mt-1 text-steel-300">{question.explanation}</p>
          </div>
        )}
      </div>
    </div>
  )
}
