import { useEffect } from 'react'
import { ArrowRight, Check, Circle, Printer } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { Breadcrumbs } from '@/components/layout/Breadcrumbs'
import { topicHref } from '@/components/learning/labels'
import { useDocumentTitle } from '@/components/learning/useDocumentTitle'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { checkCertificates, getCourse, getCourses } from '@/features/certificate/award'
import { CertificateDocument } from '@/features/certificate/CertificateDocument'
import { courseStatus } from '@/features/certificate/courses'
import { usePreferences } from '@/stores/preferences'
import { useProgress } from '@/stores/progress'

/** /certificate/:courseId — the certificate if earned; otherwise exactly what is left to earn it. */
export default function CertificatePage() {
  const { courseId = '' } = useParams()
  const course = getCourse(courseId)
  useDocumentTitle(course ? `Certificate · ${course.title}` : 'Certificate not found')
  const completed = useProgress((s) => s.completed)
  const quizScores = useProgress((s) => s.quizScores)
  const earned = useProgress((s) => s.certificates[courseId])

  // Cover progress made before certificates existed: award anything already earned.
  useEffect(() => {
    checkCertificates()
  }, [])

  if (!course) return <NotFound id={courseId} />
  const status = courseStatus(course, completed, quizScores)

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
      <div>
        <Breadcrumbs items={[{ label: 'My progress', to: '/progress' }, { label: 'Certificate' }]} />
      </div>
      {earned ? <Earned course={course} earnedAt={earned.earnedAt} averageScore={status.averageScore} /> : <Locked status={status} />}
    </div>
  )
}

function Earned({ course, earnedAt, averageScore }: { course: NonNullable<ReturnType<typeof getCourse>>; earnedAt: string; averageScore: number | null }) {
  const name = usePreferences((s) => s.learnerName)
  const setName = usePreferences((s) => s.setLearnerName)
  const ready = name.trim().length > 0

  const print = () => {
    const previous = document.title
    document.title = `AutoVerse certificate – ${course.title} – ${name.trim()}`
    window.addEventListener('afterprint', () => (document.title = previous), { once: true })
    window.print()
  }

  return (
    <>
      <header className="max-w-2xl">
        <p className="eyebrow text-amber">Course complete</p>
        <h1 className="mt-2 text-3xl font-semibold text-paper sm:text-4xl">Your certificate</h1>
        <p className="mt-3 text-steel-300">
          You finished <span className="text-paper">{course.title}</span>. Add your name, then print it or save it as a PDF from your browser’s print dialog.
        </p>
      </header>

      <div className="panel mt-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium text-paper">Name on the certificate</span>
          <input
            type="text"
            value={name}
            maxLength={60}
            autoComplete="name"
            onChange={(e) => setName(e.target.value)}
            placeholder="Your full name"
            className="h-11 rounded-lg border border-input bg-graphite-900 px-3 text-base placeholder:text-steel-500"
          />
        </label>
        <Button className="h-11" onClick={print} disabled={!ready}>
          <Printer aria-hidden /> Print or save as PDF
        </Button>
      </div>
      <p className="mt-2 text-xs text-steel-400" role="status">
        {ready ? 'Your name is stored only in this browser.' : 'Enter your name to enable printing.'} The certificate is not independently verifiable: progress is
        kept in your own browser.
      </p>

      <div className="mt-8">
        <CertificateDocument name={name} course={course} earnedAt={earnedAt} averageScore={averageScore} />
      </div>

      <p className="mt-8">
        <Link to="/progress" className="inline-flex min-h-10 items-center gap-1.5 text-sm text-cyan underline-offset-4 hover:underline">
          Back to my progress <ArrowRight aria-hidden className="size-4" />
        </Link>
      </p>
    </>
  )
}

function Locked({ status }: { status: ReturnType<typeof courseStatus> }) {
  const { course } = status
  const next = status.remainingLessons[0] ?? status.remainingQuizzes[0]
  return (
    <>
      <header className="max-w-2xl">
        <p className="eyebrow">Not earned yet</p>
        <h1 className="mt-2 text-3xl font-semibold text-paper sm:text-4xl">{course.title}</h1>
        <p className="mt-3 text-steel-300">{course.summary}</p>
      </header>

      <section aria-labelledby="needed-heading" className="panel mt-8 max-w-2xl p-5">
        <h2 id="needed-heading" className="text-lg font-semibold text-paper">
          What it takes
        </h2>
        <p className="mt-1 text-sm text-steel-300">Finish every lesson in the course and take every quiz. Your quiz scores appear on the certificate.</p>
        <Progress value={status.percent} aria-label={`${status.percent}% of the way to the certificate`} className="mt-4 h-1.5 bg-graphite-700" />
        <p className="mt-2 text-sm tabular-nums text-steel-300">
          {status.lessonsDone} of {status.lessonsTotal} lessons · {status.quizzesTaken} of {status.quizzesTotal} quizzes
        </p>

        {status.remainingLessons.length > 0 && (
          <Checklist title="Lessons to complete" items={status.remainingLessons.map((t) => ({ id: t.id, label: t.title, to: topicHref(t) }))} />
        )}
        {status.remainingQuizzes.length > 0 && (
          <Checklist title="Quizzes to take" items={status.remainingQuizzes.map((t) => ({ id: t.id, label: t.title, to: `${topicHref(t)}#quiz` }))} />
        )}

        {next && (
          <Button asChild className="mt-5 h-11">
            <Link to={status.remainingLessons.length ? topicHref(next) : `${topicHref(next)}#quiz`}>
              {status.remainingLessons.length ? 'Next lesson' : 'Take the quiz'}: {next.title} <ArrowRight aria-hidden />
            </Link>
          </Button>
        )}
      </section>
    </>
  )
}

function Checklist({ title, items }: { title: string; items: { id: string; label: string; to: string }[] }) {
  return (
    <div className="mt-5">
      <h3 className="eyebrow">{title}</h3>
      <ul className="mt-2 flex flex-col">
        {items.map((i) => (
          <li key={i.id}>
            <Link to={i.to} className="flex min-h-10 items-center gap-2.5 text-sm text-steel-300 hover:text-cyan">
              <Circle aria-hidden className="size-4 shrink-0 text-steel-500" />
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

function NotFound({ id }: { id: string }) {
  return (
    <div className="max-w-2xl">
      <Breadcrumbs items={[{ label: 'My progress', to: '/progress' }, { label: 'Certificate' }]} />
      <h1 className="text-3xl font-semibold text-paper">No course called “{id}”</h1>
      <p className="mt-3 text-steel-300">Here are the courses you can earn a certificate for:</p>
      <ul className="mt-4 flex flex-col">
        {getCourses().map((c) => (
          <li key={c.id}>
            <Link to={`/certificate/${c.id}`} className="flex min-h-11 items-center gap-2 text-cyan underline-offset-4 hover:underline">
              <Check aria-hidden className="size-4 opacity-0" />
              {c.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
