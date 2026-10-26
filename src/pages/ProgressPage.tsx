import { CertificatesSection } from '@/features/certificate/CertificatesSection'
import { useMemo, type ReactNode } from 'react'
import { ArrowRight, BookmarkX, CircleCheck, HardDrive, Route, Trash2 } from 'lucide-react'
import { Link } from 'react-router'
import { DifficultyMeter } from '@/components/learning/TopicMeta'
import { DIFFICULTY_LABEL, topicHref } from '@/components/learning/labels'
import { useDocumentTitle } from '@/components/learning/useDocumentTitle'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { clearAllProgress, removeBookmark } from '@/features/progress/actions'
import { PathAction } from '@/features/progress/PathAction'
import { resolveCurrentPathProgress, resolveNextPathProgress, resolvePathProgress, type PathProgress } from '@/features/progress/paths'
import { formatDate, formatRelativeTime } from '@/features/progress/time'
import { getTopic, learningPaths, topics } from '@/lib/content'
import type { Topic } from '@/lib/schemas'
import { cn } from '@/lib/utils'
import { useProgress } from '@/stores/progress'

const withTopic = <T extends { topicId: string }>(items: T[]) =>
  items.flatMap((item) => {
    const topic = getTopic(item.topicId)
    return topic ? [{ ...item, topic }] : []
  })

/** /progress — everything stored locally about the reader's learning, plus curated paths. */
export default function ProgressPage() {
  useDocumentTitle('My progress')
  const recent = useProgress((s) => s.recent)
  const completed = useProgress((s) => s.completed)
  const bookmarks = useProgress((s) => s.bookmarks)
  const quizScores = useProgress((s) => s.quizScores)

  const recentTopics = useMemo(() => withTopic(recent), [recent])
  const completedTopics = useMemo(
    () => withTopic(Object.entries(completed).map(([topicId, at]) => ({ topicId, at }))).sort((a, b) => b.at.localeCompare(a.at)),
    [completed],
  )
  const bookmarkTopics = useMemo(() => bookmarks.map(getTopic).filter((t): t is Topic => !!t), [bookmarks])
  const quizRows = useMemo(
    () => withTopic(Object.entries(quizScores).map(([topicId, r]) => ({ topicId, ...r }))).sort((a, b) => b.at.localeCompare(a.at)),
    [quizScores],
  )
  const currentPath = useMemo(
    () => resolveCurrentPathProgress(learningPaths, recent.map((item) => item.topicId), getTopic, completed),
    [recent, completed],
  )
  const paths = useMemo(
    () =>
      learningPaths
        .map((path) => resolvePathProgress(path, getTopic, completed))
        .filter((progress) => progress.total > 0)
        .sort((a, b) => Number(b.path.id === currentPath?.path.id) - Number(a.path.id === currentPath?.path.id)),
    [completed, currentPath],
  )
  const hasAny = recentTopics.length + completedTopics.length + bookmarkTopics.length + quizRows.length > 0

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <p className="eyebrow">My progress</p>
          <h1 className="mt-2 text-3xl font-semibold text-paper sm:text-4xl">Your learning so far</h1>
        </div>
        <ClearAllButton disabled={!hasAny} />
      </header>

      <p className="mt-5 flex max-w-3xl items-start gap-3 rounded-lg border border-white/[0.07] bg-graphite-900/60 px-4 py-3 text-sm leading-relaxed text-steel-300">
        <HardDrive aria-hidden className="mt-0.5 size-4 shrink-0 text-cyan" />
        <span>
          Progress is stored only in this browser on this device. There is no account and nothing is sent to a server, so it does not sync between
          devices and is lost if you clear site data.
        </span>
      </p>

      <dl className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Lessons completed" value={`${completedTopics.length}`} detail={`of ${topics.length}`} />
        <Stat label="Bookmarks" value={`${bookmarkTopics.length}`} />
        <Stat label="Quizzes taken" value={`${quizRows.length}`} />
        <Stat
          label="Average best score"
          value={quizRows.length ? `${Math.round((quizRows.reduce((s, r) => s + r.score / r.total, 0) / quizRows.length) * 100)}%` : '—'}
        />
      </dl>

      <Block id="certificates" title="Certificates" description="Finish every lesson and take every quiz in a course to earn its certificate.">
        <CertificatesSection />
      </Block>

      {paths.length > 0 && (
        <Block id="paths" title="Learning paths" description="Curated sequences of lessons. Lessons not written yet are skipped and noted.">
          <ul className="grid gap-4 lg:grid-cols-2">
            {paths.map((p) => (
              <li key={p.path.id}>
                <PathCard
                  progress={p}
                  completed={completed}
                  current={p.path.id === currentPath?.path.id}
                  started={p.completed > 0 || recent.some((item) => p.path.topicIds.includes(item.topicId))}
                  nextPath={p.path.id === currentPath?.path.id ? resolveNextPathProgress(learningPaths, p.path.id, getTopic, completed) : undefined}
                />
              </li>
            ))}
          </ul>
        </Block>
      )}

      {!hasAny && (
        <div className="panel mt-10 flex flex-col items-start gap-3 p-6">
          <p className="text-paper">Nothing here yet.</p>
          <p className="text-sm text-steel-400">Open a lesson to start tracking. Lessons you view, bookmark, complete or quiz yourself on appear here.</p>
          <Button asChild className="h-10">
            <Link to="/learn">
              Browse lessons <ArrowRight aria-hidden />
            </Link>
          </Button>
        </div>
      )}

      <div className="grid gap-x-10 lg:grid-cols-2">
        {recentTopics.length > 0 && (
          <Block id="recent" title="Recently viewed">
            <TopicList
              items={recentTopics.map((r) => ({
                topic: r.topic,
                meta: <time dateTime={r.at} title={formatDate(r.at)}>{formatRelativeTime(r.at)}</time>,
              }))}
            />
          </Block>
        )}

        {bookmarkTopics.length > 0 && (
          <Block id="bookmarks" title="Bookmarks">
            <TopicList items={bookmarkTopics.map((t) => ({ topic: t, action: <RemoveBookmark topic={t} /> }))} />
          </Block>
        )}

        {completedTopics.length > 0 && (
          <Block id="completed" title="Completed lessons">
            <TopicList
              items={completedTopics.map((c) => ({
                topic: c.topic,
                meta: (
                  <span className="inline-flex items-center gap-1.5 text-ok">
                    <CircleCheck aria-hidden className="size-3.5" />
                    <time dateTime={c.at}>{formatDate(c.at)}</time>
                  </span>
                ),
              }))}
            />
          </Block>
        )}

        {quizRows.length > 0 && (
          <Block id="quizzes" title="Quiz scores" description="Best attempt per lesson.">
            <div className="overflow-x-auto rounded-xl border border-white/[0.07]">
              <table className="w-full text-sm">
                <thead className="bg-graphite-900/80 text-left">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 font-medium text-steel-300">
                      Lesson
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium text-steel-300">
                      Best
                    </th>
                    <th scope="col" className="hidden px-4 py-2.5 text-right font-medium text-steel-300 sm:table-cell">
                      When
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {quizRows.map((r) => {
                    const pct = Math.round((r.score / r.total) * 100)
                    return (
                      <tr key={r.topicId} className="border-t border-white/[0.05]">
                        <td className="px-4 py-2.5">
                          <Link to={`${topicHref(r.topic)}#quiz`} className="relative hit-area inline-flex min-h-9 items-center text-paper hover:text-cyan">
                            {r.topic.title}
                          </Link>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono">
                          <span className={cn(pct === 100 ? 'text-ok' : pct >= 50 ? 'text-paper' : 'text-amber')}>
                            {r.score}/{r.total}
                          </span>
                          <span className="ml-2 text-xs text-steel-400">{pct}%</span>
                        </td>
                        <td className="hidden whitespace-nowrap px-4 py-2.5 text-right text-xs text-steel-400 sm:table-cell">
                          <time dateTime={r.at}>{formatDate(r.at)}</time>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Block>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="panel flex flex-col gap-1 p-4">
      <dt className="text-xs text-steel-400">{label}</dt>
      <dd className="font-display text-2xl tabular-nums text-paper">
        {value}
        {detail && <span className="ml-1 text-sm text-steel-400">{detail}</span>}
      </dd>
    </div>
  )
}

function Block({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-heading`} className="mt-12">
      <h2 id={`${id}-heading`} className="text-lg font-semibold text-paper">
        {title}
      </h2>
      {description && <p className="mt-1 text-sm text-steel-400">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

function TopicList({ items }: { items: { topic: Topic; meta?: ReactNode; action?: ReactNode }[] }) {
  return (
    <ul className="flex flex-col divide-y divide-white/[0.05] rounded-xl border border-white/[0.07] bg-graphite-900/50">
      {items.map(({ topic, meta, action }) => (
        <li key={topic.id} className="flex items-center gap-3 px-4 py-2">
          <Link to={topicHref(topic)} className="flex min-h-11 pointer-coarse:min-h-12 min-w-0 flex-1 flex-col justify-center">
            <span className="truncate text-sm text-paper hover:text-cyan">{topic.title}</span>
            <span className="mt-0.5 flex items-center gap-3 text-xs text-steel-400">
              <DifficultyMeter difficulty={topic.difficulty} className="text-[11px] text-steel-400" />
              {meta}
            </span>
          </Link>
          {action}
        </li>
      ))}
    </ul>
  )
}

function RemoveBookmark({ topic }: { topic: Topic }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-10 text-steel-400 hover:text-paper"
      // The row goes with the bookmark, so a keyboard press hands focus to the toast's Undo.
      onClick={(e) => removeBookmark(topic.id, { fromKeyboard: e.detail === 0 })}
      aria-label={`Remove bookmark: ${topic.title}`}
    >
      <BookmarkX aria-hidden />
    </Button>
  )
}

function PathCard({
  progress,
  completed,
  current,
  started,
  nextPath,
}: {
  progress: PathProgress
  completed: Readonly<Record<string, string>>
  current: boolean
  started: boolean
  nextPath?: PathProgress
}) {
  const { path, topics: list, missing, percent } = progress
  return (
    <article className="panel flex h-full flex-col gap-4 p-5" aria-labelledby={`path-${path.id}`}>
      <div>
        <p className="eyebrow flex items-center gap-2">
          <Route aria-hidden className="size-3.5 text-amber" />
          {current ? (started ? 'Current path' : 'Suggested starting path') : `${DIFFICULTY_LABEL[path.level]} path`}
        </p>
        <h3 id={`path-${path.id}`} className="mt-1.5 text-lg font-semibold text-paper">
          {path.title}
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-steel-400">{path.summary}</p>
      </div>
      <div>
        <div className="mb-1.5 flex justify-between text-xs tabular-nums text-steel-300">
          <span>
            {progress.completed} of {progress.total} lessons
          </span>
          <span className="font-mono">{percent}%</span>
        </div>
        <Progress value={percent} aria-label={`${path.title} progress`} className="h-1.5 bg-graphite-700" />
      </div>
      <ol className="flex flex-col gap-0.5">
        {list.map((t, i) => {
          const done = !!completed[t.id]
          return (
            <li key={t.id}>
              <Link to={topicHref(t)} className="flex min-h-9 pointer-coarse:min-h-12 items-center gap-3 rounded-md px-1 text-sm hover:bg-white/[0.03]">
                <span
                  aria-hidden
                  className={cn(
                    'grid size-5 shrink-0 place-items-center rounded-full border font-mono text-[10px]',
                    done ? 'border-ok/60 bg-ok/10 text-ok' : 'border-white/15 text-steel-400',
                  )}
                >
                  {done ? '✓' : i + 1}
                </span>
                <span className={cn('min-w-0 flex-1 truncate', done ? 'text-steel-400' : 'text-paper')}>{t.title}</span>
                {done && <span className="sr-only">(completed)</span>}
              </Link>
            </li>
          )
        })}
      </ol>
      {missing > 0 && progress.next && (
        <p className="text-xs text-steel-500">
          {missing} more {missing === 1 ? 'lesson is' : 'lessons are'} planned for this path and not written yet.
        </p>
      )}
      <div className="mt-auto">
        <PathAction progress={progress} nextPath={nextPath} started={started} />
      </div>
    </article>
  )
}

/** Clears at once; the toast that follows offers Undo instead of a confirm dialog up front. */
function ClearAllButton({ disabled }: { disabled: boolean }) {
  return (
    <Button
      variant="outline"
      className="h-10 self-start border-danger/40 text-danger hover:bg-danger/10 hover:text-danger"
      disabled={disabled}
      // detail is 0 when Enter / Space pressed the button: the button is about to be disabled, so the Undo takes focus.
      onClick={(e) => clearAllProgress({ fromKeyboard: e.detail === 0 })}
    >
      <Trash2 aria-hidden /> Clear all progress
    </Button>
  )
}
