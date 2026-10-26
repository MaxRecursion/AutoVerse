import { useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { ArrowUpRight, Crosshair } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { getComponent, getTopic } from '@/lib/content'
import type { FlowDiagram as FlowDiagramData } from '@/lib/schemas'
import { cn } from '@/lib/utils'
import { layoutFlow, type FlowLayout, type FlowNodeLayout } from './flowLayout'
import { topicHref } from './labels'

interface FlowDiagramProps {
  flow: FlowDiagramData
  /** Accessible name for the diagram. */
  label: string
  /** Lesson currently shown (nodes linking to it are not treated as links). */
  currentTopicId?: string
  /** Component currently selected (e.g. in the lesson's 3D lab) — its node is highlighted. */
  selectedComponentId?: string | null
  /** Select a component (in the lab store when the lesson has a lab). */
  onSelectComponent?: (componentId: string) => void
  /** Bring the 3D scene into view; offered for component nodes when a lab is present. */
  onLocate?: () => void
  className?: string
}

/** Track an element's content width (null until measured, e.g. during prerender or in jsdom). */
function useElementWidth(ref: RefObject<HTMLElement | null>): number | null {
  const [width, setWidth] = useState<number | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const w = el.getBoundingClientRect().width
      setWidth(w > 0 ? Math.round(w) : null)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return width
}

/** Horizontal when it fits at ≥ 90% scale (keeps nodes ≥ 36px tall); otherwise a vertical stack. */
function chooseLayout(flow: FlowDiagramData, width: number | null): FlowLayout {
  if (width) {
    const horizontal = layoutFlow(flow, { orientation: 'horizontal' })
    if (horizontal.width * 0.9 <= width) return horizontal
  }
  return layoutFlow(flow, { orientation: 'vertical', maxWidth: width ?? 360 })
}

/**
 * Responsive SVG flow diagram. Nodes are keyboard-focusable: component nodes
 * select that part (synchronised with the 3D lab), nodes pointing at another
 * lesson navigate to it, other nodes reveal their detail text below.
 */
export function FlowDiagram({ flow, label, currentTopicId, selectedComponentId, onSelectComponent, onLocate, className }: FlowDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const width = useElementWidth(containerRef)
  const layout = useMemo(() => chooseLayout(flow, width), [flow, width])
  const navigate = useNavigate()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)
  const rawId = useId()
  const uid = rawId.replace(/[^a-zA-Z0-9_-]/g, '')
  const titleId = `${uid}-title`
  const detailId = `${uid}-detail`

  const nodeInfo = (n: FlowNodeLayout['node']) => {
    const component = n.componentId ? getComponent(n.componentId) : undefined
    const linked = n.topicId && n.topicId !== currentTopicId ? getTopic(n.topicId) : undefined
    return { component, linked }
  }

  const activate = (n: FlowNodeLayout['node']) => {
    const { component, linked } = nodeInfo(n)
    if (component) {
      onSelectComponent?.(component.id)
      setActiveId(n.id)
    } else if (linked) {
      navigate(topicHref(linked))
    } else {
      setActiveId((prev) => (prev === n.id ? null : n.id))
    }
  }

  const onKey = (e: KeyboardEvent, n: FlowNodeLayout['node'], isLink: boolean) => {
    if (e.key === 'Enter' || (!isLink && e.key === ' ')) {
      e.preventDefault()
      activate(n)
    }
  }

  const active = flow.nodes.find((n) => n.id === activeId)
  const activeInfo = active ? nodeInfo(active) : null
  const markerId = `${uid}-arrow`

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div ref={containerRef} className="w-full overflow-hidden rounded-xl border border-white/[0.07] bg-graphite-950 bg-blueprint p-3 sm:p-4">
        <svg
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          width="100%"
          style={{ maxWidth: layout.width }}
          className="mx-auto block h-auto"
          role="group"
          aria-labelledby={titleId}
          aria-describedby={active ? detailId : undefined}
        >
          <title id={titleId}>{label}</title>
          <defs>
            <marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" className="fill-amber" />
            </marker>
          </defs>

          <g aria-hidden>
            {layout.edges.map((e) => (
              <path
                key={e.key}
                d={e.d}
                fill="none"
                strokeWidth={1.6}
                strokeDasharray={e.back ? '5 4' : undefined}
                className="stroke-amber/70"
                markerEnd={`url(#${markerId})`}
              />
            ))}
            {layout.edges
              .filter((e) => e.label)
              .map((e) => {
                const text = e.label ?? ''
                const w = text.length * 6.4 + 12
                return (
                  <g key={`${e.key}-label`} transform={`translate(${e.labelX} ${e.labelY})`}>
                    <rect x={-w / 2} y={-9} width={w} height={18} rx={4} className="fill-graphite-950 stroke-amber/25" />
                    <text textAnchor="middle" dy="0.35em" className="fill-amber font-mono text-[10.5px]">
                      {text}
                    </text>
                  </g>
                )
              })}
          </g>

          {layout.nodes.map((ln) => {
            const n = ln.node
            const { component, linked } = nodeInfo(n)
            const isLink = !component && !!linked
            const interactive = !!component || isLink || !!n.detail
            const selected = activeId === n.id || (!!component && component.id === selectedComponentId)
            const cx = ln.x + ln.w / 2
            const textTop = ln.y + ln.h / 2 - ((ln.lines.length - 1) * 17) / 2
            const description = [
              n.label,
              n.detail,
              component && `Selects the ${component.name}`,
              isLink && linked && `Opens the lesson “${linked.title}”`,
            ]
              .filter(Boolean)
              .join('. ')
            return (
              <g
                key={ln.id}
                role={interactive ? (isLink ? 'link' : 'button') : 'img'}
                tabIndex={interactive ? 0 : undefined}
                aria-label={description}
                aria-pressed={interactive && !isLink ? selected : undefined}
                onClick={interactive ? () => activate(n) : undefined}
                onKeyDown={interactive ? (e) => onKey(e, n, isLink) : undefined}
                onFocus={(e) => {
                  // Draw our own ring for keyboard focus only (SVG outlines are inconsistent, esp. Safari).
                  let keyboard = true
                  try {
                    keyboard = e.currentTarget.matches(':focus-visible')
                  } catch {
                    /* selector unsupported: assume keyboard */
                  }
                  if (keyboard) setFocusId(ln.id)
                }}
                onBlur={() => setFocusId((f) => (f === ln.id ? null : f))}
                className={cn('outline-none', interactive && 'cursor-pointer')}
                data-testid={`flow-node-${ln.id}`}
              >
                {focusId === ln.id && (
                  <rect x={ln.x - 4} y={ln.y - 4} width={ln.w + 8} height={ln.h + 8} rx={13} fill="none" strokeWidth={2} className="stroke-cyan" />
                )}
                <rect
                  x={ln.x}
                  y={ln.y}
                  width={ln.w}
                  height={ln.h}
                  rx={10}
                  strokeWidth={selected ? 1.6 : 1}
                  className={cn(
                    'transition-colors',
                    selected ? 'fill-cyan/[0.12] stroke-cyan' : 'fill-graphite-850 stroke-white/[0.14]',
                    interactive && !selected && 'hover:stroke-cyan/60',
                  )}
                />
                {component && <circle cx={ln.x + ln.w - 10} cy={ln.y + 10} r={3} className="fill-cyan" />}
                {isLink && (
                  <path
                    d={`M${ln.x + ln.w - 15} ${ln.y + 15} l6 -6 m-4.5 0 h4.5 v4.5`}
                    fill="none"
                    strokeWidth={1.4}
                    strokeLinecap="round"
                    className="stroke-steel-400"
                  />
                )}
                <text textAnchor="middle" className={cn('font-sans text-[13px]', selected ? 'fill-cyan' : 'fill-paper')}>
                  {ln.lines.map((line, i) => (
                    <tspan key={i} x={cx} y={textTop + i * 17} dy="0.35em">
                      {line}
                    </tspan>
                  ))}
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      <div id={detailId} aria-live="polite" className="min-h-0">
        {active && activeInfo && (
          <div className="panel flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="font-medium text-paper">{active.label}</p>
              {active.detail && <p className="mt-1 text-sm leading-relaxed text-steel-300">{active.detail}</p>}
              {activeInfo.component && <p className="mt-1 text-sm text-steel-400">{activeInfo.component.description}</p>}
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              {activeInfo.component && onLocate && (
                <Button variant="outline" size="sm" className="h-9" onClick={onLocate}>
                  <Crosshair aria-hidden /> View in 3D
                </Button>
              )}
              {active.topicId && activeInfo.linked && (
                <Button asChild variant="outline" size="sm" className="h-9">
                  <Link to={topicHref(activeInfo.linked)}>
                    {activeInfo.linked.title} <ArrowUpRight aria-hidden />
                  </Link>
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      <details className="group text-sm text-steel-400">
        <summary className="relative hit-area flex min-h-9 cursor-pointer items-center rounded px-1 hover:text-paper">Read the diagram as text</summary>
        <ul className="mt-2 flex flex-col gap-1 pl-4">
          {flow.edges.map((e, i) => {
            const from = flow.nodes.find((n) => n.id === e.from)?.label ?? e.from
            const to = flow.nodes.find((n) => n.id === e.to)?.label ?? e.to
            return (
              <li key={`${e.from}-${e.to}-${i}`} className="list-disc">
                {from} → {to}
                {e.label && <span className="text-steel-500"> ({e.label})</span>}
              </li>
            )
          })}
          {flow.nodes
            .filter((n) => n.detail)
            .map((n) => (
              <li key={`detail-${n.id}`} className="list-disc">
                <span className="text-steel-300">{n.label}:</span> {n.detail}
              </li>
            ))}
        </ul>
      </details>
    </div>
  )
}
