/**
 * The whole explorer in words: every system, where it sits in this car, its
 * parts and where to learn more. Always rendered (not only without WebGL), so
 * it doubles as the text alternative for the 3D scene and as a quick index.
 */
import { Link } from 'react-router'
import { topicHref } from '@/components/learning/labels'
import { getLab } from '@/features/labs/registry'
import { getComponent, getTopic } from '@/lib/content'
import type { Topic } from '@/lib/schemas'
import { EXPLORER_SYSTEMS, explorerHref } from './explorerSystems'

const LINK = 'rounded-sm text-cyan underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-cyan'

export function ExplorerTextAlternative({ onFocusSystem }: { onFocusSystem?: () => void }) {
  return (
    <section aria-labelledby="explorer-text-title" className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <p className="eyebrow">Text version</p>
      <h2 id="explorer-text-title" className="mt-1 font-display text-2xl font-semibold text-paper">
        The car, system by system
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-steel-300">
        Everything the 3D explorer shows, in words. The car is laid out as a front-engined, front-wheel-drive car with the engine mounted
        across the nose — the most common arrangement for everyday cars.
      </p>
      <ol className="mt-6 grid gap-4 md:grid-cols-2">
        {EXPLORER_SYSTEMS.map((sys) => {
          const lesson = sys.topicIds.map(getTopic).find((t): t is Topic => !!t)
          const lab = sys.labId ? getLab(sys.labId) : undefined
          return (
            <li key={sys.id} className="rounded-xl border border-white/[0.07] bg-graphite-900/50 p-4">
              <h3 className="font-display text-base font-semibold text-paper">{sys.name}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-steel-300">{sys.summary}</p>
              <p className="mt-2 text-xs leading-relaxed text-steel-400">
                <span className="annotation mr-1 text-steel-300">Where</span>
                {sys.location}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-steel-400">
                <span className="annotation mr-1 text-steel-300">Parts</span>
                {sys.componentIds.map((id) => getComponent(id)?.name ?? id).join(', ')}
              </p>
              <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <Link
                  to={explorerHref({ systemId: sys.id })}
                  onClick={onFocusSystem}
                  className={LINK}
                  aria-label={`Show the ${sys.name.toLowerCase()} in the 3D explorer`}
                >
                  Show in 3D
                </Link>
                {lesson && (
                  <Link to={topicHref(lesson)} className={LINK}>
                    Lesson: {lesson.title}
                  </Link>
                )}
                {lab && (
                  <Link to={`/labs/${lab.id}`} className={LINK}>
                    {lab.title}
                  </Link>
                )}
              </p>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
