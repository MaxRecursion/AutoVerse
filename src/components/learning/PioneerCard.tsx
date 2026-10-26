import { ChevronDown, ExternalLink, History, Info } from 'lucide-react'
import { Link } from 'react-router'
import { getCategory, getTopic } from '@/lib/content'
import type { Pioneer, Topic } from '@/lib/schemas'
import { cn } from '@/lib/utils'
import { topicHref } from './labels'

interface PioneerCardProps {
  pioneer: Pioneer
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Lesson being read; omitted from the "Appears in" links. */
  currentTopicId?: string
  /** Show the system (category) in the eyebrow — useful where cards from many systems mix. */
  showSystem?: boolean
}

/**
 * One engineer's story: the year and headline are always visible; the
 * retelling, caveats and sources open on demand. Every card shows where its
 * facts came from and says so when credit is disputed.
 */
export function PioneerCard({ pioneer: p, open, onOpenChange, currentTopicId, showSystem = false }: PioneerCardProps) {
  const system = getCategory(p.categoryId)
  const lessons = p.topicIds.map(getTopic).filter((t): t is Topic => !!t && t.id !== currentTopicId)
  const bodyId = `pioneer-${p.id}-body`
  return (
    <article id={`pioneer-${p.id}`} className="scroll-mt-20 rounded-xl sm:scroll-mt-44 border border-amber/20 bg-amber/[0.035] p-4 sm:p-5" aria-labelledby={`pioneer-${p.id}-name`}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full border border-amber/25 bg-amber/[0.08] text-amber">
          <History aria-hidden className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="eyebrow text-amber">
            {p.year}
            {showSystem && system ? ` · ${system.title}` : ''}
          </p>
          <h3 id={`pioneer-${p.id}-name`} className="mt-1 text-lg font-semibold text-paper">
            {p.name}
          </h3>
          <p className="text-xs text-steel-400">{p.role}</p>
          <p className="mt-2 text-[15px] leading-snug text-steel-200">{p.headline}</p>

          <button
            type="button"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => onOpenChange(!open)}
            className="relative hit-area mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-md text-sm font-medium text-amber hover:underline"
          >
            {open ? 'Hide the story' : 'Read the story'}
            <ChevronDown aria-hidden className={cn('size-4 transition-transform', open && 'rotate-180')} />
          </button>

          {/* Always rendered (hidden until opened) so the story is part of the page for search engines and AI crawlers. */}
          <div id={bodyId} hidden={!open}>
            <div className="mt-2 flex flex-col gap-3">
              <p className="text-[15px] leading-relaxed text-steel-300">{p.story}</p>
              {p.caution && (
                <p className="flex gap-2 rounded-lg border border-white/[0.08] bg-graphite-900/70 p-3 text-[13px] leading-relaxed text-steel-300">
                  <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-cyan" />
                  <span>
                    <span className="font-medium text-paper">Worth knowing: </span>
                    {p.caution}
                  </span>
                </p>
              )}
              {lessons.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="eyebrow">Appears in</span>
                  {lessons.map((t) => (
                    <Link key={t.id} to={topicHref(t)} className="rounded-full border border-white/10 px-3 py-1 text-xs text-steel-300 hover:border-cyan/50 hover:text-cyan">
                      {t.title}
                    </Link>
                  ))}
                </div>
              )}
              <div>
                <p className="eyebrow">Sources</p>
                <ul className="mt-1 flex flex-col">
                  {p.sources.map((s) => (
                    <li key={s.url}>
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className="relative hit-area inline-flex min-h-9 items-center gap-1.5 text-sm text-cyan underline-offset-4 hover:underline"
                      >
                        {s.publisher ? `${s.publisher}: ` : ''}
                        {s.title}
                        <ExternalLink aria-hidden className="size-3.5" />
                        <span className="sr-only"> (opens in a new tab{s.accessed ? `; read ${s.accessed}` : ''})</span>
                      </a>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-steel-500">Retold in our own words from the sources above.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </article>
  )
}
