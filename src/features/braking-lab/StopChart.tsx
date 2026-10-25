import { useId, useMemo, useRef } from 'react'
import { useLab } from '@/components/three/LabContext'
import { cn } from '@/lib/utils'
import { planFor, summarizeStop } from './braking'
import { CHART, PLOT, chartModel } from './brakingChart'
import { describeStop } from './brakingText'
import { useBrakingFrame } from './useBrakingFrame'

const C = {
  vehicle: '#ece8df',
  wheel: '#38d7f2',
  pressure: '#f6a63a',
  grid: 'rgba(255,255,255,0.07)',
  axis: '#8a919b',
} as const

/**
 * Small chart of the whole stop: vehicle speed vs wheel speed and caliper
 * pressure, with a cursor that follows the timeline. The shaded band is the
 * illustrative 10–20 % slip window; ABS behaviour is a conceptual cycle.
 */
export function StopChart({ className }: { className?: string }) {
  const params = useLab((s) => s.params)
  const plan = planFor(params)
  const model = useMemo(() => chartModel(plan), [plan])
  const text = useMemo(() => describeStop(plan, summarizeStop(plan)), [plan])
  const cursor = useRef<SVGLineElement>(null)
  const captionId = useId()

  // Uses the frame's own plan (not the memoised model) so the cursor is right even before a param change re-renders.
  useBrakingFrame((st, framePlan) => {
    const x = (PLOT.x0 + (st.t / framePlan.duration) * (PLOT.x1 - PLOT.x0)).toFixed(1)
    cursor.current?.setAttribute('x1', x)
    cursor.current?.setAttribute('x2', x)
  })

  const ticksY = [0, 0.5, 1]
  return (
    <figure className={cn('flex flex-col gap-1.5', className)} data-testid="stop-chart">
      <svg viewBox={`0 0 ${CHART.width} ${CHART.height}`} className="w-full" role="img" aria-labelledby={captionId}>
        {ticksY.map((k) => {
          const y = PLOT.y1 - k * (PLOT.y1 - PLOT.y0)
          return <line key={k} x1={PLOT.x0} x2={PLOT.x1} y1={y} y2={y} stroke={C.grid} />
        })}
        {model.band && <path d={model.band} fill={C.wheel} opacity={0.12} />}
        {model.master && <path d={model.master} fill="none" stroke={C.pressure} strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />}
        <path d={model.caliper} fill="none" stroke={C.pressure} strokeWidth={1.2} opacity={0.85} strokeLinejoin="round" />
        <path d={model.vehicle} fill="none" stroke={C.vehicle} strokeWidth={1.8} strokeLinejoin="round" />
        <path d={model.wheel} fill="none" stroke={C.wheel} strokeWidth={1.4} strokeLinejoin="round" />
        <line ref={cursor} x1={PLOT.x0} x2={PLOT.x0} y1={PLOT.y0 - 4} y2={PLOT.y1} stroke="#ffffff" strokeOpacity={0.55} strokeWidth={1} />
        {/* Axes */}
        <g fontFamily="JetBrains Mono, ui-monospace, monospace" fontSize={8} fill={C.axis}>
          <text x={PLOT.x0 - 4} y={PLOT.y0 + 3} textAnchor="end">
            {model.speedMaxKmh}
          </text>
          <text x={PLOT.x0 - 4} y={PLOT.y1 + 3} textAnchor="end">
            0
          </text>
          <text x={PLOT.x0 - 4} y={PLOT.y1 + 13} textAnchor="end">
            km/h
          </text>
          <text x={PLOT.x1 + 4} y={PLOT.y0 + 3} fill={C.pressure}>
            {model.pressureMaxBar}
          </text>
          <text x={PLOT.x1 + 4} y={PLOT.y1 + 3} fill={C.pressure}>
            0
          </text>
          <text x={PLOT.x1 + 4} y={PLOT.y1 + 13} fill={C.pressure}>
            bar
          </text>
          <text x={PLOT.x0} y={PLOT.y1 + 13}>
            0 s
          </text>
          <text x={PLOT.x1} y={PLOT.y1 + 13} textAnchor="end">
            {model.duration.toFixed(1)} s
          </text>
        </g>
      </svg>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-steel-400" aria-hidden>
        <Key colour={C.vehicle}>Car speed</Key>
        <Key colour={C.wheel}>Wheel speed</Key>
        <Key colour={C.pressure}>Caliper pressure</Key>
        {model.master && (
          <Key colour={C.pressure} dashed>
            Master cyl.
          </Key>
        )}
        {model.band && <Key colour={C.wheel} band>10–20 % slip</Key>}
      </ul>
      <figcaption id={captionId} className="sr-only">
        {text}
      </figcaption>
    </figure>
  )
}

function Key({ colour, dashed, band, children }: { colour: string; dashed?: boolean; band?: boolean; children: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <span
        className={cn('inline-block', band ? 'h-2 w-3 rounded-[2px]' : 'h-0.5 w-3')}
        style={
          band
            ? { background: colour, opacity: 0.3 }
            : dashed
              ? { backgroundImage: `linear-gradient(90deg, ${colour} 50%, transparent 50%)`, backgroundSize: '4px 2px', opacity: 0.7 }
              : { background: colour }
        }
      />
      {children}
    </li>
  )
}
