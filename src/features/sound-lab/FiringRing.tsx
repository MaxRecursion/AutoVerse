import { useEffect, useRef } from 'react'
import { DEG, type FrameBus } from './animation'
import type { FiringEvent } from './firing'

const SIZE = 300
const C = SIZE / 2
const R = 108
const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)'
/** Slow glide for dots and gap labels when the bank angle or crankpins change. */
const GLIDE = 'transition-transform duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none'

/** Unlit: a dark disc ringed in the bank colour. Lit (the latest firing): filled with it. */
const DOT = {
  A: { core: 'fill-graphite-900 stroke-cyan group-data-[lit=true]:fill-cyan', text: 'fill-cyan group-data-[lit=true]:fill-graphite-950', ripple: 'stroke-cyan' },
  B: { core: 'fill-graphite-900 stroke-amber group-data-[lit=true]:fill-amber', text: 'fill-amber group-data-[lit=true]:fill-graphite-950', ripple: 'stroke-amber' },
  mid: { core: 'fill-graphite-900 stroke-cyan group-data-[lit=true]:fill-cyan', text: 'fill-cyan group-data-[lit=true]:fill-graphite-950', ripple: 'stroke-cyan' },
} as const

/** A point on the ring for a crank angle in the 720° cycle: 0 at the top, clockwise. */
function at(angle: number, radius: number) {
  const t = ((angle / 720) * 360 - 90) * DEG
  return { x: C + radius * Math.cos(t), y: C + radius * Math.sin(t) }
}

/** The stretch of ring from `deg` ring-degrees behind the top up to the top: the hand's trail. */
function trailArc(deg: number) {
  const t = (-deg - 90) * DEG
  return `M${C + R * Math.cos(t)} ${C + R * Math.sin(t)}A${R} ${R} 0 0 1 ${C} ${C - R}`
}

type Animatable = Element & { animate: Element['animate'] }
const canAnimate = (el: Element | null | undefined): el is Animatable => !!el && typeof el.animate === 'function'

/** Keep only active effects; handling both outcomes also consumes cancellation rejections. */
function ownAnimation(owned: Set<Animation>, animation: Animation) {
  owned.add(animation)
  void animation.finished.then(() => owned.delete(animation), () => owned.delete(animation))
}

function cancelAnimations(owned: Set<Animation>) {
  for (const animation of owned) animation.cancel()
  owned.clear()
}

interface FiringRingProps {
  events: FiringEvent[]
  bus: FrameBus
  reduced: boolean
}

/**
 * The full four-stroke cycle (720°) as one circle: a dot for every firing,
 * coloured by bank, with the gap to the next firing written along the arc.
 * Uneven firing shows at a glance as uneven spacing. While the engine runs, a
 * hand sweeps round at the slowed engine speed, and each firing it passes pops
 * and sends out a ripple. Moved by the shared frame loop through refs, so React
 * does not re-render every frame.
 */
export function FiringRing({ events, bus, reduced }: FiringRingProps) {
  const hand = useRef<SVGGElement>(null)
  const pops = useRef<(SVGGElement | null)[]>([])
  const ripples = useRef<(SVGCircleElement | null)[]>([])
  const gaps = useRef<(SVGTextElement | null)[]>([])
  const entrances = useRef(new Set<Animation>())
  const firings = useRef(new Set<Animation>())

  // Deal the firings onto the ring in firing order when an engine is chosen (the ring mounts once per engine).
  useEffect(() => {
    if (reduced) return
    const owned = entrances.current
    pops.current.forEach((el, i) => {
      if (canAnimate(el)) {
        ownAnimation(owned, el.animate([{ transform: 'scale(0)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 420, delay: 60 + i * 45, easing: EASE_OUT, fill: 'backwards' }))
      }
    })
    return () => cancelAnimations(owned)
  }, [reduced])

  useEffect(() => {
    let lit = -1
    let wasAnimating = false
    const owned = firings.current
    const entryEffects = entrances.current
    const light = (index: number) => {
      if (index === lit) return
      const before = pops.current[lit]
      const gapBefore = gaps.current[lit]
      if (before) before.dataset.lit = 'false'
      if (gapBefore) gapBefore.dataset.lit = 'false'
      lit = index
      const now = pops.current[index]
      const gapNow = gaps.current[index]
      if (now) now.dataset.lit = 'true'
      if (gapNow) gapNow.dataset.lit = 'true'
    }
    const unsubscribe = bus.subscribe((frame) => {
      // Do not cancel the initial entrance on the first stopped frame. Once
      // playback has run, Stop and reduced motion must leave no moving effects.
      const animate = frame.animate && !reduced
      if (wasAnimating && !animate) {
        cancelAnimations(owned)
        cancelAnimations(entryEffects)
      }
      wasAnimating = animate
      const h = hand.current
      if (h) {
        h.style.opacity = animate ? '1' : '0'
        h.style.transform = `rotate(${frame.playhead / 2}deg)`
      }
      for (const index of animate ? frame.fired : []) {
        const pop = pops.current[index]
        const ripple = ripples.current[index]
        if (canAnimate(pop)) ownAnimation(owned, pop.animate([{ transform: 'scale(1.5)' }, { transform: 'scale(1)' }], { duration: 380, easing: EASE_OUT }))
        if (canAnimate(ripple)) {
          ownAnimation(owned, ripple.animate([{ transform: 'scale(1)', opacity: 0.8 }, { transform: 'scale(2.6)', opacity: 0 }], { duration: 650, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' }))
        }
      }
      const newest = animate ? frame.fired.at(-1) : undefined
      if (newest !== undefined) light(newest)
      else if (!animate) light(-1)
    })
    return () => {
      unsubscribe()
      cancelAnimations(owned)
      light(-1)
    }
  }, [bus, reduced])

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-auto w-full max-w-[300px] overflow-visible" role="img" aria-label={ringLabel(events)} data-testid="sound-lab-ring">
      <circle cx={C} cy={C} r={R} fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth={14} />
      {[0, 180, 360, 540].map((deg) => {
        const p = at(deg, R + 22)
        return (
          <text key={deg} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle" className="fill-steel-500 font-mono text-[9px]">
            {deg}°
          </text>
        )
      })}

      {/* The hand: a fading sweep along the track behind the slowed crank. Hidden while still. */}
      <g ref={hand} className="transition-opacity duration-300" style={{ opacity: 0, transformOrigin: `${C}px ${C}px` }}>
        <path d={trailArc(64)} fill="none" stroke="var(--color-paper)" strokeOpacity={0.05} strokeWidth={14} />
        <path d={trailArc(38)} fill="none" stroke="var(--color-paper)" strokeOpacity={0.07} strokeWidth={14} />
        <path d={trailArc(16)} fill="none" stroke="var(--color-paper)" strokeOpacity={0.1} strokeWidth={14} />
        <line x1={C} y1={C} x2={C} y2={C - R + 13} stroke="var(--color-paper)" strokeOpacity={0.4} strokeWidth={1.5} strokeLinecap="round" />
        <circle cx={C} cy={C - R} r={3.5} fill="var(--color-paper)" />
      </g>

      {events.map((e) => {
        const mid = at(e.angle + e.gap / 2, R - 26)
        return (
          <text
            key={`gap-${e.index}`}
            ref={(el) => {
              gaps.current[e.index] = el
            }}
            data-lit="false"
            textAnchor="middle"
            dominantBaseline="middle"
            style={{ transform: `translate(${mid.x}px, ${mid.y}px)` }}
            className={`fill-steel-400 font-mono text-[9px] data-[lit=true]:fill-paper ${GLIDE}`}
          >
            {Math.round(e.gap)}°
          </text>
        )
      })}

      {events.map((e) => {
        const p = at(e.angle, R)
        const tone = DOT[e.bank]
        return (
          <g key={e.index} style={{ transform: `translate(${p.x}px, ${p.y}px)` }} className={GLIDE}>
            <circle
              ref={(el) => {
                ripples.current[e.index] = el
              }}
              r={10}
              fill="none"
              strokeWidth={2}
              opacity={0}
              className={tone.ripple}
              style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
            />
            <g
              ref={(el) => {
                pops.current[e.index] = el
              }}
              data-lit="false"
              className="group"
              style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
            >
              <circle r={10} strokeWidth={1.75} className={`transition-[fill] duration-150 ${tone.core}`} />
              <text textAnchor="middle" dominantBaseline="central" className={`pointer-events-none font-mono text-[9px] font-semibold transition-[fill] duration-150 ${tone.text}`}>
                {e.cylinder ?? (e.bank === 'mid' ? e.index + 1 : e.bank)}
              </text>
            </g>
          </g>
        )
      })}

      <circle cx={C} cy={C} r={4} className="fill-paper/60" />
      <text x={C} y={C + 22} textAnchor="middle" className="fill-steel-400 font-mono text-[9px] uppercase tracking-widest">
        720° cycle
      </text>
    </svg>
  )
}

function ringLabel(events: FiringEvent[]): string {
  const parts = events.map((e) => `${e.cylinder ?? e.bank} at ${Math.round(e.angle)}°`)
  return `Firing positions over one 720° cycle: ${parts.join(', ')}.`
}
