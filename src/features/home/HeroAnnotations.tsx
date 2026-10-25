import { hasWebGL } from '@/lib/webgl'
import { HERO_ZONES } from './homeData'

const pct = (n: number) => `${Math.round(n * 1000) / 10}%`

/**
 * Drawing-sheet callouts beside the live 3D engine: a dimension bracket down
 * the right edge naming each zone of the section. Decorative (the canvas
 * carries the text alternative), never intercepts the pointer, and shown only
 * over the WebGL model and where the frame leaves room beside it. The 2D
 * fallback section has its own layout and labels, so it gets none.
 */
export function HeroAnnotations() {
  if (!hasWebGL()) return null
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-10 @container">
      <div className="hidden @min-[32rem]:block">
        {HERO_ZONES.map((z) => (
          <div
            key={z.label}
            data-testid="hero-zone"
            className="absolute right-4 flex items-stretch gap-2.5"
            style={{ top: pct(z.from), height: pct(z.to - z.from) }}
          >
            <span className="flex flex-col justify-center gap-0.5 text-right">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-steel-300">{z.label}</span>
              <span className="text-[11px] leading-tight text-steel-500">{z.note}</span>
            </span>
            {/* Dimension bracket: ticks at both ends of the zone, a short leader towards the label. */}
            <span className="relative my-px w-2 border-y border-r border-steel-500/60">
              <span className="absolute right-full top-1/2 h-px w-1.5 -translate-y-1/2 bg-steel-500/60" />
            </span>
          </div>
        ))}
        <span className="annotation absolute left-4 top-4 uppercase tracking-wider text-steel-500">Section A–A · bore axis</span>
      </div>
    </div>
  )
}
