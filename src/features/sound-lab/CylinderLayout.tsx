import { useId } from 'react'
import type { EngineSpec } from './engines'
import type { FiringEvent } from './firing'

interface CylinderLayoutProps {
  spec: EngineSpec
  events: FiringEvent[]
  bankAngle: number
  playhead: number | null
}

interface CylinderSectionProps {
  event: FiringEvent
  x: number
  scale: number
  rotation: number
  playhead: number | null
}

const CRANK_Y = 174
const DEG = Math.PI / 180
const cycleAngle = (angle: number) => ((angle % 720) + 720) % 720

/**
 * Original teaching schematic. Each small section shares a crank-axis row;
 * bore direction shows the bank angle, while cosine piston travel makes the
 * firing phases legible. Rod length and piston proportions are illustrative.
 */
export function CylinderLayout({ spec, events, bankAngle, playhead }: CylinderLayoutProps) {
  const id = useId()
  const inline = spec.layout === 'inline'
  const angle = inline ? 0 : spec.layout === 'flat' ? 180 : bankAngle
  const halfAngle = angle / 2
  const slots = inline ? spec.cylinders : spec.cylinders / 2
  const pitch = 532 / slots
  // Leave room around every bore and its label, including at 180°.
  const scale = Math.min(1.05, pitch / (inline ? 54 : 2 * (120 * Math.sin(halfAngle * DEG) + 18)))
  const byBank = (bank: 'A' | 'B') => {
    const numbers = bank === 'A' ? spec.bankA : spec.bankB
    return numbers.length
      ? numbers.map((cylinder) => events.find((event) => event.cylinder === cylinder))
      : events.filter((event) => event.bank === bank)
  }
  const banks = { A: byBank('A'), B: byBank('B') }
  const sectionLabel = inline ? `${spec.cylinders} vertical cylinders in one row` : `${slots} pairs of cylinders with ${angle}° between the banks`

  return (
    <figure className="min-w-0 rounded-xl border border-white/[0.08] bg-graphite-950/60 p-4" data-testid="cylinder-layout" data-bank-angle={angle}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h3 className="text-sm font-semibold text-paper">Cylinder layout</h3>
        <p className="flex flex-wrap gap-3 font-mono text-[10px] text-steel-400">
          {inline ? (
            <span className="inline-flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-full bg-cyan" />One cylinder row</span>
          ) : (
            <>
              <span className="inline-flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-full bg-cyan" />Bank A</span>
              <span className="inline-flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-full bg-amber" />Bank B</span>
            </>
          )}
          <span className="inline-flex items-center gap-1.5"><span aria-hidden className="size-2 rotate-45 bg-paper" />Firing glow</span>
        </p>
      </div>
      <div className="mt-3 overflow-x-auto rounded-lg bg-blueprint" tabIndex={0} role="region" aria-label="Cylinder schematic; scroll horizontally on a small screen to inspect every cylinder">
        <svg
          viewBox="0 0 600 248"
          role="img"
          aria-labelledby={`${id}-title ${id}-description`}
          className="h-auto min-w-[480px] w-full"
        >
          <title id={`${id}-title`}>{`${spec.name}: ${sectionLabel}.`}</title>
          <desc id={`${id}-description`}>
            Separate cross-sections are arranged along the crankshaft. Pistons move twice per four-stroke cycle;
            a chamber glows only after its firing event. Cylinder numbers follow the preset’s manufacturer numbering.
            {spec.order === null ? ' This preset has no published cylinder numbering here, so the cylinders carry their bank letters.' : ''}
            {' '}Piston travel, connecting rods and proportions are illustrative.
          </desc>
          <text x="28" y="24" className="fill-steel-400 font-mono text-[11px]">{inline ? 'INLINE · ONE ROW' : spec.layout === 'flat' ? 'BOXER · OPPOSED BANKS' : `V LAYOUT · ${angle}° BANK ANGLE`}</text>
          <path d={`M24 ${CRANK_Y}H576`} stroke="var(--color-steel-500)" strokeWidth="2" strokeDasharray="4 5" />
          {Array.from({ length: slots }, (_, index) => {
            const x = 34 + pitch * (index + 0.5)
            const single = events.find((event) => event.cylinder === index + 1) ?? events[index]
            const pair = inline
              ? [{ event: single, rotation: 0 }]
              : [{ event: banks.A[index], rotation: -halfAngle }, { event: banks.B[index], rotation: halfAngle }]
            return (
              <g key={index}>
                {pair.map(({ event, rotation }) => event ? (
                  <CylinderSection key={event.index} event={event} x={x} scale={scale} rotation={rotation} playhead={playhead} />
                ) : null)}
                <circle cx={x} cy={CRANK_Y} r={5} fill="var(--color-graphite-850)" stroke="var(--color-steel-400)" strokeWidth="1.5" />
                {!inline && (
                  <>
                    <path d={angleArc(x, halfAngle)} fill="none" stroke="var(--color-steel-400)" strokeWidth="1" />
                    <text x={x} y={CRANK_Y + 26} textAnchor="middle" className="fill-steel-300 font-mono text-[12px]">{angle}°</text>
                  </>
                )}
              </g>
            )
          })}
          <path d="M204 230h192m-6-4 6 4-6 4" fill="none" stroke="var(--color-steel-500)" strokeWidth="1.25" />
          <text x="300" y="220" textAnchor="middle" className="fill-steel-400 font-mono text-[10px]">SECTIONS ALONG THE CRANKSHAFT</text>
        </svg>
      </div>
      <figcaption className="mt-3 text-xs leading-relaxed text-steel-400">
        Schematic piston travel · {playhead === null ? 'Static view' : 'Motion follows the slowed firing timeline'}. Each piston reaches the top every 360°; its chamber fires once per 720°.
      </figcaption>
    </figure>
  )
}

function CylinderSection({ event, x, scale, rotation, playhead }: CylinderSectionProps) {
  const phase = cycleAngle((playhead ?? 0) - event.angle)
  const pistonY = -87 + 19 * (1 - Math.cos(phase * DEG))
  const crankX = 14 * Math.sin(phase * DEG)
  const crankY = -14 * Math.cos(phase * DEG)
  // A power stroke follows one firing per 720°, unlike the 360° piston motion.
  const glow = playhead !== null && phase < 80 ? 0.8 * (1 - phase / 80) : 0
  const label = event.cylinder === null ? event.bank : String(event.cylinder)
  const labelX = x + 119 * scale * Math.sin(rotation * DEG)
  const labelY = CRANK_Y - 119 * scale * Math.cos(rotation * DEG)

  return (
    <g className={event.bank === 'B' ? 'text-amber' : 'text-cyan'} data-cylinder={label} data-firing={glow > 0 ? 'true' : 'false'}>
      <g transform={`translate(${x} ${CRANK_Y}) scale(${scale}) rotate(${rotation})`}>
        <path d="M-15-99h30v70H-15z" fill="var(--color-graphite-900)" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.5" />
        <path d="M-11-96v64M11-96v64" stroke="var(--color-steel-500)" strokeWidth="1" />
        <rect x={-10} y={-97} width={20} height={pistonY + 97} fill="currentColor" opacity={glow} />
        <path d="M-18-99h36" stroke="currentColor" strokeWidth="4" />
        <path d="M0-106v7" stroke={glow > 0 ? 'var(--color-paper)' : 'currentColor'} strokeWidth="2" />
        <circle cx={0} cy={0} r={14} fill="none" stroke="var(--color-steel-500)" strokeOpacity="0.6" strokeDasharray="2 3" />
        <path d={`M0 ${pistonY + 6}L${crankX} ${crankY}`} stroke="var(--color-steel-300)" strokeWidth="3.5" strokeLinecap="round" />
        <path d={`M0 0L${crankX} ${crankY}`} stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        <circle cx={crankX} cy={crankY} r={3} fill="var(--color-graphite-850)" stroke="currentColor" strokeWidth="1.5" />
        <rect x={-10} y={pistonY} width={20} height={13} rx={1.5} fill="var(--color-steel-300)" stroke="var(--color-paper)" strokeWidth="1" />
        <path d={`M-9 ${pistonY + 3}h18M-9 ${pistonY + 6}h18`} stroke="var(--color-graphite-700)" strokeWidth="1" />
        <circle cx={0} cy={pistonY + 9} r={2} fill="var(--color-graphite-700)" />
      </g>
      <text x={labelX} y={labelY} textAnchor="middle" dominantBaseline="central" fill="currentColor" className="font-mono text-[14px] font-semibold">{label}</text>
    </g>
  )
}

function angleArc(x: number, halfAngle: number): string {
  const r = 22
  const dx = r * Math.sin(halfAngle * DEG)
  const y = CRANK_Y - r * Math.cos(halfAngle * DEG)
  return `M${x - dx} ${y}A${r} ${r} 0 0 1 ${x + dx} ${y}`
}
