import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Small original line drawings identifying each lab on cards (decorative —
 * the card text carries the meaning). Steel linework, cyan for parts you
 * interact with, amber for motion and energy paths.
 */

function Engine() {
  return (
    <>
      {/* Cylinder head, spark plug and valves */}
      <path d="M52 8h56v6H52z" />
      <path d="M80 1v7" />
      <path d="M68 2v12M63 14h10" className="text-cyan" />
      <path d="M92 2v12M87 14h10" className="text-amber" />
      {/* Cylinder walls */}
      <path d="M57 14v42M103 14v42" />
      {/* Piston with ring grooves and wrist pin */}
      <rect x="60" y="28" width="40" height="18" rx="2" className="fill-graphite-850" />
      <path d="M60 32.5h40M60 36h40" strokeOpacity="0.5" />
      <circle cx="80" cy="40" r="2.5" />
      {/* Connecting rod, crank path and journals */}
      <circle cx="80" cy="80" r="12.5" strokeDasharray="2 3" className="text-amber" />
      <path d="M80 40 91 74" strokeWidth="2.5" />
      <path d="M69 86a12.5 12.5 0 0 0 22 0" />
      <circle cx="80" cy="80" r="3" />
      <circle cx="91" cy="74" r="2.5" />
    </>
  )
}

function Gearbox() {
  return (
    <>
      {/* Two meshing gears (equal tooth pitch) turning in opposite directions */}
      <circle cx="58" cy="50" r="27" strokeWidth="6" strokeDasharray="4.71 4.71" strokeLinecap="butt" strokeOpacity="0.75" />
      <circle cx="58" cy="50" r="23.5" className="fill-graphite-850" />
      <circle cx="58" cy="50" r="6" />
      <circle cx="103" cy="50" r="18" strokeWidth="6" strokeDasharray="4.71 4.71" strokeLinecap="butt" strokeOpacity="0.75" className="text-cyan" />
      <circle cx="103" cy="50" r="14.5" className="fill-graphite-850 text-cyan" />
      <circle cx="103" cy="50" r="4" className="text-cyan" />
      <path d="M28.3 38A32 32 0 0 1 42 22.3m0 0-6.4.4m6.4-.4-2 6" className="text-amber" />
      <path d="M128.2 61.5A24.5 24.5 0 0 0 128.2 38.5m0 0-5.6 3m5.6-3 1.6 6.2" className="text-amber" />
    </>
  )
}

function Brakes() {
  const holes = Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2
    return [66 + 27 * Math.cos(a), 50 + 27 * Math.sin(a)] as const
  })
  return (
    <>
      {/* Ventilated disc and hub */}
      <circle cx="66" cy="50" r="38" />
      <circle cx="66" cy="50" r="15" />
      <circle cx="66" cy="50" r="4" />
      {holes.map(([x, y], i) => (
        <circle key={i} cx={x.toFixed(1)} cy={y.toFixed(1)} r="1.6" strokeOpacity="0.6" />
      ))}
      {/* Caliper straddling the disc, and its hydraulic line */}
      <path d="M81 8.6A44 44 0 0 1 107.4 35l-17 6.1A26 26 0 0 0 74.9 25.6Z" className="fill-graphite-850 text-cyan" />
      <path d="M97 19c14-10 30 2 56-8" className="text-amber" />
    </>
  )
}

function Suspension() {
  return (
    <>
      {/* Chassis rail */}
      <path d="M84 6h52M90 6l-4-4M100 6l-4-4M110 6l-4-4M120 6l-4-4M130 6l-4-4" strokeOpacity="0.6" />
      {/* Wheel and tyre */}
      <circle cx="44" cy="64" r="26" />
      <circle cx="44" cy="64" r="15" strokeOpacity="0.6" />
      <circle cx="44" cy="64" r="3" />
      {/* Coil-over: spring around a damper */}
      <path d="M100 6v20" />
      <rect x="95" y="26" width="10" height="32" rx="1.5" className="fill-graphite-850" />
      <path d="M100 58v10" />
      <path d="M100 12 90 16l20 6-20 6 20 6-20 6 20 6-20 6 10 4" className="text-cyan" />
      {/* Lower control arm from the hub to the chassis pivot */}
      <path d="M44 64 140 72" strokeWidth="2.5" />
      <circle cx="140" cy="72" r="3" />
      {/* Road with a bump */}
      <path d="M4 91h70q8-7 16 0h66" strokeDasharray="3 3" className="text-amber" />
    </>
  )
}

function Generic() {
  return (
    <>
      <circle cx="80" cy="50" r="30" />
      <circle cx="80" cy="50" r="8" className="text-amber" />
      <path d="M80 12v14M80 74v14M42 50h14M104 50h14" className="text-cyan" />
    </>
  )
}

const GLYPHS: Record<string, () => ReactNode> = {
  engine: Engine,
  transmission: Gearbox,
  braking: Brakes,
  suspension: Suspension,
}

export function LabGlyph({ labId, className }: { labId: string; className?: string }) {
  const Glyph = GLYPHS[labId] ?? Generic
  return (
    <svg
      viewBox="0 0 160 100"
      aria-hidden
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('text-steel-300', className)}
    >
      <Glyph />
    </svg>
  )
}
