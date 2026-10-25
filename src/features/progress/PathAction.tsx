import { ArrowRight, CircleCheck, Route } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { displayPathTitle } from '@/features/home/homeData'
import type { PathProgress } from './paths'
import { topicHref } from '@/components/learning/labels'

/** Shared start, continue, and completion states for home and progress path cards. */
export function PathAction({ progress, nextPath, started = false }: { progress: PathProgress; nextPath?: PathProgress; started?: boolean }) {
  const { next } = progress

  if (next) {
    return (
      <Button asChild className="h-auto min-h-11 justify-start whitespace-normal py-2.5 text-left">
        <Link to={topicHref(next)}>
          <Route aria-hidden />
          <span className="flex-1">{started || progress.completed ? 'Continue with' : 'Start with'} {next.title}</span>
          <ArrowRight aria-hidden />
        </Link>
      </Button>
    )
  }

  return (
    <div role="status" className="flex flex-col items-start gap-3 rounded-lg border border-ok/20 bg-ok/[0.04] p-4">
      <div>
        <p className="inline-flex items-center gap-2 font-medium text-ok">
          <CircleCheck aria-hidden className="size-4" />
          {progress.missing ? 'All available lessons complete' : 'Path complete'}
        </p>
        <p className="mt-1 text-sm text-steel-300">
          You finished {progress.completed} {progress.completed === 1 ? 'lesson' : 'lessons'} in {displayPathTitle(progress.path)}.
        </p>
        {progress.missing > 0 && (
          <p className="mt-1 text-xs text-steel-400">
            {progress.missing} planned {progress.missing === 1 ? 'lesson is' : 'lessons are'} still being written.
          </p>
        )}
      </div>
      {nextPath?.next ? (
        <Button asChild variant="outline" className="h-auto min-h-10 justify-start whitespace-normal text-left">
          <Link to={topicHref(nextPath.next)}>
            <Route aria-hidden />
            <span>Start next path: {displayPathTitle(nextPath.path)}</span>
            <ArrowRight aria-hidden />
          </Link>
        </Button>
      ) : (
        <Link to="/learn" className="inline-flex min-h-10 items-center gap-1.5 text-sm text-cyan hover:underline">
          Explore more lessons <ArrowRight aria-hidden className="size-4" />
        </Link>
      )}
    </div>
  )
}
