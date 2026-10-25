/**
 * Interactive SVG of one drivetrain layout: the power path down the centre
 * (amber, with a moving dash showing the direction of drive), supporting
 * systems at the sides, and dashed relationship links. Every node is a
 * keyboard-focusable toggle button that selects it.
 */
import { useId, type KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'
import { GROUP_FILL } from './mapStyles'
import {
  GROUP_LABEL,
  NODE_HEIGHT,
  edgePath,
  groupOf,
  labelLines,
  type FlowEdge,
  type GraphLayout,
  type MapLink,
  type PlacedNode,
} from './systemMapModel'

const FLOW_CSS = `
@keyframes av-map-flow { to { stroke-dashoffset: -32; } }
.av-map-flow { animation: av-map-flow 1.1s linear infinite; }
@media (prefers-reduced-motion: reduce) { .av-map-flow { animation: none; } }
`

interface SystemMapGraphProps {
  graph: GraphLayout
  /** Accessible name, e.g. "Front-wheel drive power flow". */
  label: string
  selectedId: string | null
  onSelect: (id: string | null) => void
  /** Move the dashes along the power flow (off when paused or with reduced motion). */
  animate: boolean
}

export function SystemMapGraph({ graph, label, selectedId, onSelect, animate }: SystemMapGraphProps) {
  const uid = useId().replace(/:/g, '')
  const byId = new Map(graph.nodes.map((n) => [n.node.id, n]))
  const touches = (from: string, to: string) => selectedId !== null && (from === selectedId || to === selectedId)
  const steps = graph.nodes.filter((n) => n.role === 'path').length

  return (
    <svg
      viewBox={`0 0 ${graph.width} ${graph.height}`}
      className="mx-auto block h-auto w-full max-w-[560px] select-none"
      role="group"
      aria-label={label}
    >
      <style>{FLOW_CSS}</style>
      <defs>
        <marker id={`${uid}-flow`} viewBox="0 0 8 8" refX="7" refY="4" markerUnits="userSpaceOnUse" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
          <path d="M0 0 L8 4 L0 8 z" className="fill-amber" />
        </marker>
        <marker id={`${uid}-rel`} viewBox="0 0 8 8" refX="7" refY="4" markerUnits="userSpaceOnUse" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L8 4 L0 8 z" className="fill-steel-400" />
        </marker>
        <marker id={`${uid}-rel-on`} viewBox="0 0 8 8" refX="7" refY="4" markerUnits="userSpaceOnUse" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L8 4 L0 8 z" className="fill-cyan" />
        </marker>
      </defs>

      {/* Relationships (behind everything). */}
      <g aria-hidden="true">
        {graph.relations.map((l: MapLink) => {
          const a = byId.get(l.from)
          const b = byId.get(l.to)
          if (!a || !b) return null
          const on = touches(l.from, l.to)
          return (
            <path
              key={`${l.from}>${l.to}`}
              d={edgePath(a, b)}
              fill="none"
              strokeWidth={on ? 1.6 : 1.1}
              strokeDasharray={on ? undefined : '3 4'}
              markerEnd={`url(#${uid}-${on ? 'rel-on' : 'rel'})`}
              className={cn('transition-colors', on ? 'stroke-cyan' : selectedId ? 'stroke-steel-500/25' : 'stroke-steel-500/55')}
            />
          )
        })}
      </g>

      {/* The power flow: a steady line, plus moving dashes for direction. */}
      <g aria-hidden="true">
        {graph.flow.map((e: FlowEdge) => {
          const a = byId.get(e.from)
          const b = byId.get(e.to)
          if (!a || !b) return null
          const d = edgePath(a, b)
          return (
            <g key={`${e.from}>${e.to}`}>
              <path
                d={d}
                fill="none"
                strokeWidth={e.kind === 'path' ? 3 : 2.2}
                strokeDasharray={e.kind === 'branch' ? '6 4' : undefined}
                markerEnd={`url(#${uid}-flow)`}
                className={touches(e.from, e.to) ? 'stroke-amber/70' : 'stroke-amber/30'}
              />
              <path
                d={d}
                fill="none"
                strokeWidth={e.kind === 'path' ? 3 : 2.2}
                strokeLinecap="round"
                strokeDasharray="4 12"
                className={cn('stroke-amber', animate && 'av-map-flow')}
              />
            </g>
          )
        })}
      </g>

      {/* Nodes, in reading order (this is also the Tab order). */}
      {graph.nodes.map((n) => (
        <MapNodeButton key={n.node.id} placed={n} steps={steps} selected={selectedId === n.node.id} dimmed={!!selectedId && selectedId !== n.node.id} onSelect={onSelect} />
      ))}
    </svg>
  )
}

function MapNodeButton({
  placed,
  steps,
  selected,
  dimmed,
  onSelect,
}: {
  placed: PlacedNode
  steps: number
  selected: boolean
  dimmed: boolean
  onSelect: (id: string | null) => void
}) {
  const { node, x, y, width, role, step } = placed
  const h = NODE_HEIGHT
  const group = groupOf(node)
  const lines = labelLines(node.label)
  const where =
    role === 'path' ? `step ${step} of ${steps} in the power flow` : role === 'branch' ? 'branch of the power flow' : GROUP_LABEL[group].toLowerCase()
  const toggle = () => onSelect(selected ? null : node.id)
  const onKeyDown = (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      toggle()
    } else if (e.key === 'Escape' && selected) {
      e.preventDefault()
      onSelect(null)
    }
  }

  return (
    <g
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${node.label}, ${where}`}
      onClick={toggle}
      onKeyDown={onKeyDown}
      className="group cursor-pointer outline-none"
      data-node={node.id}
    >
      {/* Generous invisible hit area (touch). */}
      <rect x={x - width / 2 - 4} y={y - h / 2 - 6} width={width + 8} height={h + 12} fill="transparent" />
      <rect
        x={x - width / 2 - 4}
        y={y - h / 2 - 4}
        width={width + 8}
        height={h + 8}
        rx={11}
        fill="none"
        strokeWidth={2}
        className="stroke-cyan opacity-0 group-focus-visible:opacity-100"
      />
      <rect
        x={x - width / 2}
        y={y - h / 2}
        width={width}
        height={h}
        rx={8}
        strokeWidth={selected ? 1.6 : 1.1}
        strokeDasharray={role === 'branch' && !selected ? '4 3' : undefined}
        className={cn(
          'transition-colors',
          selected
            ? 'fill-cyan/15 stroke-cyan'
            : role === 'support'
              ? 'fill-graphite-900 stroke-white/15 group-hover:stroke-cyan/60'
              : 'fill-graphite-850 stroke-amber/55 group-hover:stroke-cyan/60',
          dimmed && 'opacity-70',
        )}
      />
      <rect x={x - width / 2 + 5} y={y - h / 2 + 8} width={3} height={h - 16} rx={1.5} className={GROUP_FILL[group]} />
      <text
        x={x + 3}
        y={y + (lines.length === 1 ? 4.5 : -2.5)}
        textAnchor="middle"
        className={cn('text-[13px] font-medium', selected ? 'fill-cyan' : 'fill-paper', dimmed && 'opacity-80')}
      >
        {lines.map((line, i) => (
          <tspan key={i} x={x + 3} dy={i === 0 ? 0 : 14}>
            {line}
          </tspan>
        ))}
      </text>
      {step !== undefined && (
        <g aria-hidden="true">
          <circle cx={x - width / 2} cy={y - h / 2} r={8} className="fill-graphite-950 stroke-amber/80" strokeWidth={1} />
          <text x={x - width / 2} y={y - h / 2 + 3.5} textAnchor="middle" className="fill-amber font-mono text-[9px]">
            {step}
          </text>
        </g>
      )}
    </g>
  )
}
