import { useEffect } from 'react'
import { Award, Lock } from 'lucide-react'
import { Link } from 'react-router'
import { Progress } from '@/components/ui/progress'
import { topicHref } from '@/components/learning/labels'
import { useProgress } from '@/stores/progress'
import { checkCertificates, getCourses } from './award'
import { courseStatus } from './courses'

const formatDate = (iso: string) => new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(new Date(iso))

/** One card per course: how close the learner is, or the certificate they hold. */
export function CertificatesSection() {
  const completed = useProgress((s) => s.completed)
  const quizScores = useProgress((s) => s.quizScores)
  const certificates = useProgress((s) => s.certificates)

  // Show what is already earned, including progress made before certificates existed or in another tab.
  useEffect(() => {
    checkCertificates()
  }, [completed, quizScores])

  return (
    <ul className="grid gap-4 lg:grid-cols-2">
      {getCourses().map((course) => {
        const status = courseStatus(course, completed, quizScores)
        const earned = certificates[course.id]
        const next = status.remainingLessons[0] ?? status.remainingQuizzes[0]
        return (
          <li key={course.id}>
            <article className="panel flex h-full flex-col gap-3 p-5" aria-label={`Certificate: ${course.title}`}>
              <div className="flex items-start gap-3">
                <span
                  className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-full border ${earned ? 'border-amber/40 bg-amber/10 text-amber' : 'border-white/15 text-steel-400'}`}
                >
                  {earned ? <Award aria-hidden className="size-4" /> : <Lock aria-hidden className="size-4" />}
                </span>
                <div className="min-w-0">
                  <h3 className="font-semibold text-paper">
                    {course.title}
                  </h3>
                  <p className="text-sm leading-snug text-steel-400">{course.summary}</p>
                </div>
              </div>

              {earned ? (
                <p className="text-sm text-steel-300">
                  Earned {formatDate(earned.earnedAt)}
                  {status.averageScore !== null && ` · average quiz score ${status.averageScore}%`}
                </p>
              ) : (
                <>
                  <Progress value={status.percent} aria-label={`${course.title}: ${status.percent}% of the way to the certificate`} className="h-1.5 bg-graphite-700" />
                  <p className="text-sm tabular-nums text-steel-300">
                    {status.lessonsDone} of {status.lessonsTotal} lessons · {status.quizzesTaken} of {status.quizzesTotal} quizzes
                  </p>
                </>
              )}

              <div className="mt-auto flex flex-wrap items-center gap-3 pt-1">
                {earned ? (
                  <Link to={`/certificate/${course.id}`} className="relative hit-area inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                    View certificate
                  </Link>
                ) : (
                  next && (
                    <Link to={topicHref(next)} className="relative hit-area inline-flex min-h-10 items-center text-sm text-cyan underline-offset-4 hover:underline">
                      {status.remainingLessons.length ? 'Next lesson' : 'Take the quiz'}: {next.title}
                    </Link>
                  )
                )}
                {!earned && (
                  <Link to={`/certificate/${course.id}`} className="relative hit-area inline-flex min-h-10 items-center text-sm text-steel-400 underline-offset-4 hover:text-paper hover:underline">
                    What’s needed
                  </Link>
                )}
              </div>
            </article>
          </li>
        )
      })}
    </ul>
  )
}
