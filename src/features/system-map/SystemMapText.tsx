import { Link } from 'react-router'
import { topicHref } from '@/components/learning/labels'
import { getTopic } from '@/lib/content'
import type { SystemMap } from '@/lib/schemas'
import { branchEdges, relationLinks, type MapLayout, type MapNode } from './systemMapModel'

const LINK = 'rounded-sm text-cyan underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-cyan'

function NodeName({ node }: { node: MapNode | undefined }) {
  if (!node) return null
  const topic = node.topicId ? getTopic(node.topicId) : undefined
  return topic ? (
    <Link to={topicHref(topic)} className={LINK}>
      {node.label}
    </Link>
  ) : (
    <span className="text-paper">{node.label}</span>
  )
}

/** The diagram in words: the active layout's power path, its branches and every other connection. */
export function SystemMapText({ map, layout }: { map: SystemMap; layout: MapLayout }) {
  const byId = new Map(map.nodes.map((n) => [n.id, n]))
  const branches = branchEdges(map, layout)
  const relations = relationLinks(map, layout)
  return (
    <section aria-labelledby="map-text-title" className="mt-12">
      <p className="eyebrow">Text version</p>
      <h2 id="map-text-title" className="mt-1 font-display text-2xl font-semibold text-paper">
        {layout.title}, in words
      </h2>
      <div className="mt-5 grid gap-6 md:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-paper">Power flow, from engine to road</h3>
          <ol className="mt-2 grid gap-1.5 text-sm text-steel-300" aria-label={`${layout.title} power path`}>
            {layout.path.map((id, i) => (
              <li key={id} className="flex gap-3">
                <span className="w-5 shrink-0 text-right font-mono text-xs leading-5 text-amber">{i + 1}</span>
                <NodeName node={byId.get(id)} />
              </li>
            ))}
          </ol>
          {branches.length > 0 && (
            <ul className="mt-3 grid gap-1 text-sm text-steel-300">
              {branches.map((e) => (
                <li key={`${e.from}>${e.to}`}>
                  Branch: <NodeName node={byId.get(e.from)} /> → <NodeName node={byId.get(e.to)} /> — {e.label}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-paper">How the other systems connect</h3>
          <ul className="mt-2 grid gap-1.5 text-sm leading-snug text-steel-300">
            {relations.map((l) => (
              <li key={`${l.from}>${l.to}`}>
                <NodeName node={byId.get(l.from)} /> → <NodeName node={byId.get(l.to)} />
                <span className="text-steel-400"> — {l.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
