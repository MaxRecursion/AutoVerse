import { useId, useMemo, useRef, type PointerEvent } from 'react'
import { useLabStoreApi } from '@/components/three/LabContext'
import { cn } from '@/lib/utils'
import { CHART, buildChart, chartX } from './chartGeometry'
import { formatMm, responseVerdict } from './suspensionText'
import { useSuspensionFrame, useSuspensionResponse } from './useSuspensionFrame'

const MINUS = '−'

/**
 * Body and wheel displacement over one lap of the test road, with the road
 * profile under the tyre, shaded stretches where the tyre is off the road and
 * a cursor at the current lap position. Clicking or dragging on the plot
 * scrubs the lab (it is an alternative to the timeline, which stays the
 * keyboard-accessible control).
 */
export function ResponseChart({ className }: { className?: string }) {
  const store = useLabStoreApi()
  const response = useSuspensionResponse()
  const chart = useMemo(() => buildChart(response), [response])
  const cursor = useRef<SVGGElement>(null)
  const titleId = useId()
  const descId = useId()

  useSuspensionFrame((f) => {
    cursor.current?.setAttribute('transform', `translate(${chartX(f.progress).toFixed(2)} 0)`)
  })

  const seekFromPointer = (e: PointerEvent<SVGSVGElement>) => {
    const svg = e.currentTarget
    const rect = svg.getBoundingClientRect()
    if (rect.width === 0) return
    const x = ((e.clientX - rect.left) / rect.width) * CHART.width
    const p = (x - CHART.left) / (CHART.width - CHART.left - CHART.right)
    const s = store.getState()
    s.pause()
    s.seek(Math.min(0.999, Math.max(0, p)))
  }

  return (
    <figure className={cn('flex flex-col gap-1.5', className)} data-testid="suspension-chart">
      <svg
        viewBox={`0 0 ${CHART.width} ${CHART.height}`}
        className="w-full cursor-crosshair touch-pan-y select-none"
        role="img"
        aria-labelledby={`${titleId} ${descId}`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture?.(e.pointerId)
          seekFromPointer(e)
        }}
        onPointerMove={(e) => {
          if (e.buttons & 1) seekFromPointer(e)
        }}
      >
        <title id={titleId}>Body and wheel displacement over one lap</title>
        <desc id={descId}>{responseVerdict(response)}</desc>
        {/* Off-the-road stretches */}
        {chart.airborne.map((a, i) => (
          <rect key={i} x={a.x0} y={CHART.top} width={Math.max(1, a.x1 - a.x0)} height={CHART.height - CHART.top - CHART.bottom} fill="var(--color-danger)" opacity={0.14} />
        ))}
        {/* Grid */}
        {chart.ticks.map((t) => (
          <g key={t.mm}>
            <line x1={CHART.left} x2={CHART.width - CHART.right} y1={t.y} y2={t.y} stroke="currentColor" className={t.mm === 0 ? 'text-steel-500' : 'text-white/[0.06]'} strokeWidth={1} />
            <text x={CHART.left - 4} y={t.y + 3} textAnchor="end" className="fill-steel-400 font-mono text-[9px]">
              {t.mm > 0 ? `+${t.mm}` : t.mm < 0 ? `${MINUS}${Math.abs(t.mm)}` : '0'}
            </text>
          </g>
        ))}
        {chart.timeTicks.map((t) => (
          <text key={t.s} x={t.x} y={CHART.height - 8} textAnchor="middle" className="fill-steel-400 font-mono text-[9px]">
            {t.s.toFixed(1)} s
          </text>
        ))}
        <text x={4} y={CHART.top + 2} className="fill-steel-400 font-mono text-[9px]" dominantBaseline="hanging">
          mm
        </text>
        {/* Series */}
        <path d={chart.road} fill="none" stroke="var(--color-steel-500)" strokeWidth={1.2} strokeDasharray="3 3" />
        <path d={chart.wheel} fill="none" stroke="var(--color-amber)" strokeWidth={1.6} strokeLinejoin="round" />
        <path d={chart.body} fill="none" stroke="var(--color-cyan)" strokeWidth={2} strokeLinejoin="round" />
        {/* Cursor (moved imperatively) */}
        <g ref={cursor} aria-hidden>
          <line x1={0} x2={0} y1={CHART.top - 2} y2={CHART.height - CHART.bottom + 2} stroke="var(--color-paper)" strokeWidth={1} opacity={0.75} />
        </g>
      </svg>
      <figcaption className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-steel-400">
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-3 rounded bg-cyan" aria-hidden /> Body
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-3 rounded bg-amber" aria-hidden /> Wheel
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-0 w-3 border-t border-dashed border-steel-500" aria-hidden /> Road
        </span>
        {chart.airborne.length > 0 && (
          <span className="flex items-center gap-1">
            <span className="inline-block size-2 rounded-sm bg-danger/40" aria-hidden /> Tyre off the road
          </span>
        )}
        <span className="ml-auto">
          range {formatMm(chart.minMm / 1000)} to {formatMm(chart.maxMm / 1000)}
        </span>
      </figcaption>
    </figure>
  )
}
