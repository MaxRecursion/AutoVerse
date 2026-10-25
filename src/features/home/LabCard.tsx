import { ArrowRight, BookOpen } from 'lucide-react'
import { Link } from 'react-router'
import { topicHref } from '@/components/learning/labels'
import { Button } from '@/components/ui/button'
import type { LabDefinition } from '@/features/labs/types'
import { cn } from '@/lib/utils'
import { LabGlyph } from './LabGlyph'
import { LAB_STATUS_LABEL, labPath, type LabOverview } from './labOverview'

const labNumber = (lab: Pick<LabDefinition, 'order'>) => `Lab ${String(lab.order).padStart(2, '0')}`

/** Honest depth marker. `complete` is only shown when `showComplete` (it is the norm). */
export function LabStatus({ status, showComplete = false, className }: { status: LabDefinition['status']; showComplete?: boolean; className?: string }) {
  if (status === 'complete' && !showComplete) return null
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider',
        status === 'complete' ? 'border-ok/30 text-ok' : 'border-amber/40 text-amber',
        className,
      )}
    >
      <span className="sr-only">Status: </span>
      {LAB_STATUS_LABEL[status]}
    </span>
  )
}

function LessonLink({ overview, className }: { overview: LabOverview; className?: string }) {
  const { lesson } = overview
  if (!lesson) return <span className={cn('text-xs text-steel-500', className)}>Lesson coming soon</span>
  return (
    <Link
      to={topicHref(lesson)}
      aria-label={`Lesson: ${lesson.title}`}
      className={cn('inline-flex min-h-9 items-center gap-1.5 text-xs text-steel-300 transition-colors hover:text-paper', className)}
    >
      <BookOpen aria-hidden className="size-3.5 shrink-0" />
      {lesson.title}
    </Link>
  )
}

/**
 * Compact lab card (homepage). The whole card opens the lab (stretched title
 * link); the lesson link sits above it so both stay separately focusable.
 */
export function LabCard({ overview, headingLevel: Heading = 'h3' }: { overview: LabOverview; headingLevel?: 'h2' | 'h3' }) {
  const { lab, system } = overview
  return (
    <article className="group panel relative flex h-full flex-col overflow-hidden transition-colors hover:border-cyan/35 hover:bg-graphite-850/90">
      <div className="relative h-36 border-b border-white/[0.06] bg-graphite-950 bg-blueprint">
        <LabGlyph labId={lab.id} className="absolute inset-0 m-auto h-[70%] w-auto transition-transform duration-500 motion-safe:group-hover:scale-[1.04]" />
        <span className="annotation absolute left-3 top-3 uppercase text-steel-500">{labNumber(lab)}</span>
        <LabStatus status={lab.status} className="absolute right-3 top-3" />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        {system && <p className="eyebrow">{system.title}</p>}
        <Heading className="text-lg font-semibold leading-snug text-paper transition-colors group-hover:text-cyan">
          <Link
            to={labPath(lab)}
            className="outline-none after:absolute after:inset-0 after:rounded-xl after:content-[''] focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-cyan"
          >
            {lab.title}
          </Link>
        </Heading>
        <p className="line-clamp-3 text-sm leading-relaxed text-steel-400">{lab.summary}</p>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pt-3">
          <span aria-hidden className="inline-flex items-center gap-1 text-sm font-medium text-cyan">
            Open lab
            <ArrowRight className="size-4 transition-transform motion-safe:group-hover:translate-x-0.5" />
          </span>
          <LessonLink overview={overview} className="relative z-10" />
        </div>
      </div>
    </article>
  )
}

const PART_PREVIEW = 6

/** Detailed lab card (labs index): systems and parts covered, lessons, and actions. */
export function LabIndexCard({ overview }: { overview: LabOverview }) {
  const { lab, lesson, system, parts, lessons } = overview
  const titleId = `lab-${lab.id}-title`
  const more = parts.length - PART_PREVIEW
  return (
    <article aria-labelledby={titleId} className="panel flex h-full flex-col overflow-hidden sm:flex-row">
      <div className="relative h-40 shrink-0 border-b border-white/[0.06] bg-graphite-950 bg-blueprint sm:h-auto sm:min-h-56 sm:w-48 sm:border-b-0 sm:border-r lg:w-60">
        <LabGlyph labId={lab.id} className="absolute inset-0 m-auto h-[72%] w-auto sm:h-auto sm:w-[78%]" />
        <span className="annotation absolute left-3 top-3 uppercase text-steel-500">{labNumber(lab)}</span>
      </div>

      <div className="grid min-w-0 flex-1 grid-cols-1 gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-8 lg:p-6">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {system ? <p className="eyebrow">{system.title}</p> : <span />}
            <LabStatus status={lab.status} showComplete />
          </div>
          <h2 id={titleId} className="text-xl font-semibold leading-snug text-paper">
            {lab.title}
          </h2>
          <p className="text-sm leading-relaxed text-steel-300">{lab.summary}</p>
          <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
            <Button asChild className="h-10">
              <Link to={labPath(lab)}>
                Open {lab.shortTitle} lab
                <ArrowRight aria-hidden />
              </Link>
            </Button>
            {lesson ? (
              <Button asChild variant="outline" className="h-auto min-h-10 whitespace-normal py-2 text-left">
                <Link to={topicHref(lesson)} aria-label={`Lesson: ${lesson.title}`}>
                  <BookOpen aria-hidden />
                  {lesson.title}
                </Link>
              </Button>
            ) : (
              <span className="text-xs text-steel-500">Lesson coming soon</span>
            )}
          </div>
        </div>

        <dl className="grid min-w-0 content-start gap-3 border-t border-white/[0.06] pt-4 text-sm lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          <div>
            <dt className="eyebrow mb-1">System covered</dt>
            <dd>
              {system ? (
                <Link
                  to={`/learn/${system.slug}`}
                  aria-label={`${system.title} lessons`}
                  className="inline-flex min-h-9 items-center gap-1 text-steel-300 hover:text-cyan"
                >
                  {system.title}
                  <ArrowRight aria-hidden className="size-3.5" />
                </Link>
              ) : (
                <span className="text-steel-300">{lab.systemId}</span>
              )}
            </dd>
          </div>
          {parts.length > 0 && (
            <div>
              <dt className="eyebrow mb-1.5">
                Parts explained <span className="text-steel-500">· {parts.length}</span>
              </dt>
              <dd>
                <ul className="flex flex-wrap gap-1.5">
                  {parts.slice(0, PART_PREVIEW).map((p) => (
                    <li key={p.id} className="rounded-md border border-white/[0.08] bg-graphite-950/60 px-2 py-0.5 text-xs text-steel-300">
                      {p.name}
                    </li>
                  ))}
                  {more > 0 && <li className="px-1 py-0.5 text-xs text-steel-500">+{more} more</li>}
                </ul>
              </dd>
            </div>
          )}
          {lessons.length > 0 && (
            <div>
              <dt className="eyebrow mb-1">Also used in</dt>
              <dd>
                <ul className="flex flex-col">
                  {lessons.map((t) => (
                    <li key={t.id}>
                      <Link to={topicHref(t)} className="inline-flex min-h-9 items-center py-1 leading-snug text-steel-300 hover:text-cyan">
                        {t.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          )}
        </dl>
      </div>
    </article>
  )
}
