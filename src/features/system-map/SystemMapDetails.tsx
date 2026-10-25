import type { Ref } from 'react'
import { Link } from 'react-router'
import { ArrowRight, BookOpen, Box, Car, X } from 'lucide-react'
import { topicHref } from '@/components/learning/labels'
import { getLab } from '@/features/labs/registry'
import { getTopic } from '@/lib/content'
import type { SystemMap } from '@/lib/schemas'
import { cn } from '@/lib/utils'
import { GROUP_LABEL, groupOf, nodeLinks, type GraphLayout, type MapLayout } from './systemMapModel'

interface SystemMapDetailsProps {
  map: SystemMap
  layout: MapLayout
  graph: GraphLayout
  selectedId: string | null
  onClear: () => void
  /** The heading receives focus when a node is chosen on small screens. */
  headingRef?: Ref<HTMLHeadingElement>
  className?: string
}

const ACTION =
  'group flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-cyan'

/** What the selected node is, what it connects to, and where to learn more or see it in 3D. */
export function SystemMapDetails({ map, layout, graph, selectedId, onClear, headingRef, className }: SystemMapDetailsProps) {
  const placed = selectedId ? graph.nodes.find((n) => n.node.id === selectedId) : undefined
  const labelOf = (id: string) => map.nodes.find((n) => n.id === id)?.label ?? id

  if (!placed) {
    return (
      <div className={cn('panel p-4', className)}>
        <p className="eyebrow">{layout.title}</p>
        <h2 ref={headingRef} tabIndex={-1} className="mt-1 scroll-mt-24 font-display text-lg font-semibold text-paper outline-none">
          Follow the power
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-steel-300">{layout.description}</p>
        {layout.notes.length > 0 && (
          <ul className="mt-3 grid gap-1.5 text-xs leading-relaxed text-steel-400">
            {layout.notes.map((note) => (
              <li key={note} className="flex gap-2">
                <span aria-hidden className="mt-1.5 size-1 shrink-0 rounded-full bg-amber" />
                {note}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 rounded-md border border-white/[0.06] bg-graphite-900/50 px-3 py-2 text-xs leading-relaxed text-steel-400">
          Select any box in the diagram to see what it connects to, open its lesson, or find it in 3D.
        </p>
      </div>
    )
  }

  const { node, role, step } = placed
  const topic = node.topicId ? getTopic(node.topicId) : undefined
  const links = nodeLinks(node)
  const lab = node.focus ? getLab(node.focus.labId) : undefined
  const flowIn = graph.flow.filter((e) => e.to === node.id).map((e) => e.from)
  const flowOut = graph.flow.filter((e) => e.from === node.id).map((e) => e.to)
  const relations = graph.relations.filter((l) => l.from === node.id || l.to === node.id)
  const steps = graph.nodes.filter((n) => n.role === 'path').length
  const primary3d = links.lab ?? links.explorer

  return (
    <div className={cn('panel p-4', className)} data-testid="map-details">
      <div className="flex items-start justify-between gap-2">
        <p className="eyebrow text-cyan">{GROUP_LABEL[groupOf(node)]}</p>
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear selection"
          className="-mr-2 -mt-2 inline-flex size-9 items-center justify-center rounded-md text-steel-400 hover:bg-white/5 hover:text-paper focus-visible:outline-2 focus-visible:outline-cyan"
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>
      <h2 ref={headingRef} tabIndex={-1} className="scroll-mt-24 font-display text-xl font-semibold text-paper outline-none">
        {node.label}
      </h2>
      <p className="annotation mt-1 text-steel-400">
        {role === 'path'
          ? `Step ${step} of ${steps} in the ${layout.title.toLowerCase()} power flow`
          : role === 'branch'
            ? 'Branch of the power flow'
            : 'Supporting system'}
      </p>

      {(flowIn.length > 0 || flowOut.length > 0) && (
        <dl className="mt-3 grid gap-1 text-sm">
          {flowIn.length > 0 && (
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-steel-400">Drive from</dt>
              <dd className="text-paper">{flowIn.map(labelOf).join(', ')}</dd>
            </div>
          )}
          {flowOut.length > 0 && (
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-steel-400">Drive to</dt>
              <dd className="text-paper">{flowOut.map(labelOf).join(', ')}</dd>
            </div>
          )}
        </dl>
      )}

      {relations.length > 0 && (
        <>
          <h3 className="eyebrow mt-4">Connections</h3>
          <ul className="mt-2 grid gap-1.5 text-sm">
            {relations.map((l) => (
              <li key={`${l.from}>${l.to}`} className="leading-snug text-steel-300">
                <span className="text-paper">{l.from === node.id ? `→ ${labelOf(l.to)}` : `← ${labelOf(l.from)}`}</span>
                <span className="text-steel-400"> — {l.label}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {node.description && <p className="mt-3 text-sm leading-relaxed text-steel-300">{node.description}</p>}

      {topic && (
        <>
          <h3 className="eyebrow mt-4">From the lesson</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-steel-300">{topic.summary}</p>
        </>
      )}

      <ul className="mt-4 grid gap-1.5">
        {topic && (
          <li>
            <Link to={topicHref(topic)} className={cn(ACTION, 'border-white/10 text-steel-200 hover:border-cyan/50 hover:text-paper')}>
              <BookOpen aria-hidden className="size-4 text-steel-400 group-hover:text-cyan" />
              <span className="min-w-0 flex-1">
                <span className="annotation block text-steel-500">Lesson</span>
                <span className="block truncate">{topic.title}</span>
              </span>
              <ArrowRight aria-hidden className="size-4 text-steel-500 group-hover:text-cyan" />
            </Link>
          </li>
        )}
        {primary3d && (
          <li>
            <Link to={primary3d} className={cn(ACTION, 'border-cyan/40 bg-cyan/[0.07] text-cyan hover:bg-cyan/15')}>
              <Box aria-hidden className="size-4" />
              <span className="min-w-0 flex-1">
                <span className="annotation block text-cyan/70">Focus in 3D</span>
                <span className="block truncate">{links.lab ? (lab?.title ?? 'Open the lab') : 'Show it in the whole car'}</span>
              </span>
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          </li>
        )}
        {links.lab && links.explorer && (
          <li>
            <Link to={links.explorer} className={cn(ACTION, 'border-white/10 text-steel-200 hover:border-cyan/50 hover:text-paper')}>
              <Car aria-hidden className="size-4 text-steel-400 group-hover:text-cyan" />
              <span className="min-w-0 flex-1">
                <span className="annotation block text-steel-500">Vehicle explorer</span>
                <span className="block truncate">Show it in the whole car</span>
              </span>
              <ArrowRight aria-hidden className="size-4 text-steel-500 group-hover:text-cyan" />
            </Link>
          </li>
        )}
      </ul>
    </div>
  )
}
