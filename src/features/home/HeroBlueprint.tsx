import { cn } from '@/lib/utils'

/**
 * Static engineering drawing of a single-cylinder section (original line
 * art). Shown while the live engine loads and if it cannot start at all.
 * Decorative: callers provide the text alternative.
 */
export function HeroBlueprint({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 320 300"
      aria-hidden
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('text-steel-400', className)}
    >
      {/* Cylinder head with ports, valves and spark plug */}
      <path d="M86 30h148v34H86z" className="fill-graphite-900" />
      <path d="M130 8v56M118 64h24" className="text-cyan" />
      <path d="M190 8v56M178 64h24" className="text-amber" />
      <path d="M160 14v50M154 22h12" />
      {/* Cylinder walls (liner + block) */}
      <path d="M92 64v126M100 64v126M220 64v126M228 64v126" />
      {/* Bore dimension */}
      <g strokeWidth="1" className="text-steel-500">
        <path d="M100 96h120M100 92v8M220 92v8M106 93l-6 3 6 3M214 93l6 3-6 3" />
      </g>
      <text x="160" y="90" textAnchor="middle" stroke="none" className="fill-steel-500 font-mono text-[8px] tracking-[0.2em]">
        BORE
      </text>
      {/* Piston, rings and wrist pin */}
      <rect x="104" y="120" width="112" height="46" rx="4" className="fill-graphite-850" />
      <path d="M104 128h112M104 134h112" strokeOpacity="0.5" />
      <circle cx="160" cy="150" r="7" />
      {/* Crank path, connecting rod and crankshaft */}
      <circle cx="160" cy="240" r="36" strokeDasharray="3 4" className="text-amber" />
      <path d="M160 150 180.6 210.5" strokeWidth="4" />
      <path d="M130 255a34 34 0 0 0 60 0" />
      <circle cx="160" cy="240" r="10" />
      <circle cx="180.6" cy="210.5" r="7" />
      {/* Crankcase */}
      <path d="M92 190v25q0 75 68 75t68-75v-25" />
      {/* Stroke dimension */}
      <g strokeWidth="1" className="text-steel-500">
        <path d="M262 204v72M258 204h8M258 276h8M259 210l3-6 3 6M259 270l3 6 3-6" />
      </g>
      <text x="276" y="240" textAnchor="middle" stroke="none" transform="rotate(90 276 240)" className="fill-steel-500 font-mono text-[8px] tracking-[0.2em]">
        STROKE
      </text>
      {/* Centre line */}
      <path d="M160 4v292" strokeWidth="0.75" strokeDasharray="10 4 2 4" className="text-steel-500" />
    </svg>
  )
}
