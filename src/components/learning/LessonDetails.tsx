import { ArrowUpRight, CircleAlert, CircleCheck, ExternalLink } from 'lucide-react'
import type { Topic } from '@/lib/schemas'
import { TopicCard } from './TopicCard'
import { ORIGINAL_LICENCE_NAME } from './labels'

/* Small presentational sections of the lesson template (all pure props → markup). */

export function KeyConcepts({ concepts }: { concepts: Topic['keyConcepts'] }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {concepts.map((k) => (
        <div key={k.term} data-anchor className="panel flex min-w-0 flex-col gap-2 p-4">
          <dt className="font-medium text-paper">{k.term}</dt>
          <dd className="text-sm leading-relaxed text-steel-300">{k.definition}</dd>
          {k.equation && (
            <dd>
              <code className="block overflow-x-auto whitespace-pre rounded-md border border-white/[0.06] bg-graphite-950 px-3 py-2 font-mono text-[13px] text-amber">
                {k.equation}
              </code>
            </dd>
          )}
        </div>
      ))}
    </dl>
  )
}

export function Misconceptions({ items }: { items: Topic['misconceptions'] }) {
  return (
    <ul className="flex flex-col gap-3">
      {items.map((m) => (
        <li key={m.myth} data-anchor className="grid overflow-hidden rounded-xl border border-white/[0.07] sm:grid-cols-2">
          <div className="flex gap-3 bg-danger/[0.05] p-4">
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-danger" />
            <p className="text-sm leading-relaxed text-steel-300">
              <span className="eyebrow mb-1 block text-danger">Myth</span>
              {m.myth}
            </p>
          </div>
          <div className="flex gap-3 border-t border-white/[0.06] bg-ok/[0.04] p-4 sm:border-l sm:border-t-0">
            <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-ok" />
            <p className="text-sm leading-relaxed text-steel-300">
              <span className="eyebrow mb-1 block text-ok">Reality</span>
              {m.reality}
            </p>
          </div>
        </li>
      ))}
    </ul>
  )
}

export function PracticalExamples({ items }: { items: readonly string[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((ex) => (
        <li key={ex} data-anchor className="flex gap-3 rounded-lg border border-white/[0.06] bg-graphite-900/60 px-4 py-3 text-[15px] leading-relaxed text-steel-300">
          <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-amber" />
          {ex}
        </li>
      ))}
    </ul>
  )
}

export function RelatedTopics({ prerequisites, related }: { prerequisites: readonly Topic[]; related: readonly Topic[] }) {
  return (
    <div className="flex flex-col gap-6">
      {prerequisites.length > 0 && (
        <div>
          <h3 className="mb-1 text-base font-semibold text-paper">Read first</h3>
          <p className="mb-3 text-sm text-steel-400">These lessons introduce ideas this one builds on.</p>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {prerequisites.map((t) => (
              <li key={t.id}>
                <TopicCard topic={t} headingLevel="h4" />
              </li>
            ))}
          </ul>
        </div>
      )}
      {related.length > 0 && (
        <div>
          <h3 className="mb-3 text-base font-semibold text-paper">Related lessons</h3>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((t) => (
              <li key={t.id}>
                <TopicCard topic={t} headingLevel="h4" />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** Sources, licence and attribution — always shown, so the provenance of every lesson is explicit. */
export function SourcesAndAttribution({ topic }: { topic: Topic }) {
  const original = topic.licence.name === ORIGINAL_LICENCE_NAME
  return (
    <div className="flex flex-col gap-5 text-sm">
      {topic.sourceReferences.length > 0 ? (
        <div>
          <h3 className="mb-2 text-base font-semibold text-paper">Further reading</h3>
          <ul className="flex flex-col gap-2">
            {topic.sourceReferences.map((s) => (
              <li key={s.url}>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex min-h-9 flex-wrap items-baseline gap-x-2 text-cyan hover:underline"
                >
                  <span>{s.title}</span>
                  <span className="text-xs text-steel-400 group-hover:no-underline">
                    {s.publisher ?? hostOf(s.url)}
                    {s.accessed && ` · consulted ${s.accessed}`}
                  </span>
                  <ExternalLink aria-hidden className="size-3.5 self-center" />
                  <span className="sr-only">(external site, opens in a new tab)</span>
                </a>
                {s.note && <p className="text-xs text-steel-400">{s.note}</p>}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-steel-400">No external sources are listed for this lesson.</p>
      )}

      <dl className="grid gap-x-6 gap-y-2 rounded-xl border border-white/[0.07] bg-graphite-900/60 p-4 sm:grid-cols-[auto_1fr]">
        <dt className="annotation text-steel-400">Licence</dt>
        <dd className="text-steel-300">
          {topic.licence.url ? (
            <a href={topic.licence.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-cyan hover:underline">
              {topic.licence.name} <ArrowUpRight aria-hidden className="size-3.5" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          ) : (
            topic.licence.name
          )}
          {topic.licence.holder && <span className="text-steel-400"> · {topic.licence.holder}</span>}
        </dd>
        {topic.attribution && (
          <>
            <dt className="annotation text-steel-400">Attribution</dt>
            <dd className="text-steel-300">{topic.attribution}</dd>
          </>
        )}
        {topic.modelAsset && (
          <>
            <dt className="annotation text-steel-400">3D model</dt>
            <dd className="text-steel-300">Uses the third-party model asset “{topic.modelAsset}”; its author and licence are recorded in the model manifest.</dd>
          </>
        )}
      </dl>

      {original && (
        <p className="leading-relaxed text-steel-400">
          This lesson is original AutoVerse writing.
          {topic.sourceReferences.length > 0 && ' The links above are suggestions for further reading, not the source of this text.'}
          {topic.labId && ' Numbers shown in the 3D simulation are illustrative, not measured engineering data.'}
        </p>
      )}
    </div>
  )
}
