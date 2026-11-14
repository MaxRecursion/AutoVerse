import { activeEventIndex, type FiringEvent } from './firing'

const BANK_COLOR = { A: 'var(--color-cyan)', B: 'var(--color-amber)', mid: 'var(--color-cyan)' } as const

interface FiringRingProps {
  events: FiringEvent[]
  /** Playhead in crank degrees (0–720), or null for a still picture. */
  playhead: number | null
}

/**
 * The full four-stroke cycle (720°) as one circle: a dot for every firing,
 * coloured by bank, with the gap to the next firing written along the arc.
 * Uneven firing shows at a glance as uneven spacing.
 */
export function FiringRing({ events, playhead }: FiringRingProps) {
  const size = 300
  const c = size / 2
  const r = 108
  const at = (angle: number, radius: number) => {
    const t = ((angle / 720) * 360 - 90) * (Math.PI / 180)
    return { x: c + radius * Math.cos(t), y: c + radius * Math.sin(t) }
  }
  const active = playhead === null ? -1 : activeEventIndex(events, playhead)
  const head = playhead === null ? null : at(playhead, r)

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="h-auto w-full max-w-[300px]" role="img" aria-label={ringLabel(events)}>
      <circle cx={c} cy={c} r={r} fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth={14} />
      {[0, 180, 360, 540].map((deg) => {
        const p = at(deg, r + 22)
        return (
          <text key={deg} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle" className="fill-steel-500 font-mono text-[9px]">
            {deg}°
          </text>
        )
      })}
      {events.map((e) => {
        const mid = at(e.angle + e.gap / 2, r - 26)
        return (
          <text key={`g${e.index}`} x={mid.x} y={mid.y} textAnchor="middle" dominantBaseline="middle" className="fill-steel-400 font-mono text-[9px]">
            {Math.round(e.gap)}°
          </text>
        )
      })}
      {events.map((e) => {
        const p = at(e.angle, r)
        const lit = e.index === active
        return (
          <g key={e.index}>
            <circle cx={p.x} cy={p.y} r={lit ? 12 : 9} fill={BANK_COLOR[e.bank]} fillOpacity={lit ? 1 : 0.35} stroke={BANK_COLOR[e.bank]} strokeWidth={1.5} />
            <text x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central" className="pointer-events-none fill-graphite-950 font-mono text-[9px] font-semibold">
              {e.cylinder ?? (e.bank === 'mid' ? e.index + 1 : e.bank)}
            </text>
          </g>
        )
      })}
      {head && <line x1={c} y1={c} x2={head.x} y2={head.y} stroke="var(--color-paper)" strokeOpacity={0.5} strokeWidth={1.5} />}
      <circle cx={c} cy={c} r={4} className="fill-paper/60" />
      <text x={c} y={c + 22} textAnchor="middle" className="fill-steel-400 font-mono text-[9px] uppercase tracking-widest">
        720° cycle
      </text>
    </svg>
  )
}

function ringLabel(events: FiringEvent[]): string {
  const parts = events.map((e) => `${e.cylinder ?? e.bank} at ${Math.round(e.angle)}°`)
  return `Firing positions over one 720° cycle: ${parts.join(', ')}.`
}
