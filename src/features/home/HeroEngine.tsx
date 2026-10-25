import { Component, lazy, Suspense, type ErrorInfo, type ReactNode } from 'react'
import { ArrowRight, MousePointerClick } from 'lucide-react'
import { Link } from 'react-router'
import { topicHref } from '@/components/learning/labels'
import { getTopic } from '@/lib/content'
import { cn } from '@/lib/utils'
import { HeroAnnotations } from './HeroAnnotations'
import { HeroBlueprint } from './HeroBlueprint'

// three.js lives in this chunk; it starts loading as soon as the homepage renders.
const EngineHero = lazy(() => import('@/features/engine-lab/EngineHero'))

const ENGINE_LAB = '/labs/engine'
const STROKES = ['Intake', 'Compression', 'Power', 'Exhaust'] as const

/** Corner registration marks drawn just outside the frame, like a technical drawing sheet. */
const CORNERS = [
  '-left-2 -top-2 border-l border-t',
  '-right-2 -top-2 border-r border-t',
  '-bottom-2 -left-2 border-b border-l',
  '-bottom-2 -right-2 border-b border-r',
] as const

/**
 * The homepage's live engine: EngineHero (its own store, autoplay unless
 * reduced motion, fixed camera, 2D section without WebGL) inside an
 * annotated drawing frame. If the 3D chunk cannot load, a static drawing and
 * links to the lab take its place.
 */
export function HeroEngine({ className }: { className?: string }) {
  return (
    <figure className={cn('relative m-0', className)}>
      <div aria-hidden className="annotation mb-2.5 flex items-center justify-between gap-3 uppercase tracking-wider text-steel-400">
        <span className="truncate">
          Fig. 01 · Four-stroke cutaway<span className="hidden sm:inline"> · 720° per cycle</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-ok motion-safe:animate-pulse" />
          Live model
        </span>
      </div>

      <div className="relative">
        {CORNERS.map((c) => (
          <span key={c} aria-hidden className={cn('pointer-events-none absolute size-4 border-cyan/45', c)} />
        ))}
        {/* Scale ticks down the left edge (decorative). */}
        <span
          aria-hidden
          className="pointer-events-none absolute -left-5 bottom-6 top-6 hidden w-2 bg-[repeating-linear-gradient(to_bottom,rgb(255_255_255/0.22)_0_1px,transparent_1px_12px)] xl:block"
        />
        <div className="relative h-[clamp(320px,52dvh,520px)] overflow-hidden rounded-2xl border border-white/[0.08] bg-graphite-950 bg-blueprint shadow-[0_40px_80px_-40px_rgb(0_0_0/0.9)] lg:h-[clamp(420px,64dvh,640px)]">
          <HeroBoundary fallback={<HeroUnavailable />}>
            <Suspense fallback={<HeroLoading />}>
              <EngineHero />
              {/* Inside the boundary and Suspense: callouts appear with the model and go if it fails. */}
              <HeroAnnotations />
            </Suspense>
          </HeroBoundary>
        </div>
      </div>

      <figcaption className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-1.5">
        <ol aria-label="The four strokes, in order" className="annotation flex flex-wrap items-center gap-x-2.5 gap-y-1 text-steel-400">
          {STROKES.map((s, i) => (
            <li key={s} className="flex items-center gap-2.5">
              {i > 0 && (
                <span aria-hidden className="text-steel-500">
                  →
                </span>
              )}
              <span>
                <span className="text-steel-500">0{i + 1}</span> {s}
              </span>
            </li>
          ))}
        </ol>
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-steel-400">
          <MousePointerClick aria-hidden className="size-3.5 text-cyan" />
          <span>Every part is selectable.</span>
          <Link to={ENGINE_LAB} className="inline-flex min-h-9 items-center gap-1 text-cyan hover:underline">
            Open the engine lab
            <ArrowRight aria-hidden className="size-3.5" />
          </Link>
        </p>
      </figcaption>
    </figure>
  )
}

function HeroLoading() {
  return (
    <div className="relative grid h-full place-items-center" role="status">
      <HeroBlueprint className="absolute inset-0 m-auto h-[82%] w-auto opacity-35" />
      <span className="eyebrow relative rounded bg-graphite-950/70 px-2 py-1 motion-safe:animate-pulse">Starting the engine…</span>
    </div>
  )
}

function HeroUnavailable() {
  const lesson = getTopic('four-stroke-cycle')
  return (
    <div className="relative flex h-full flex-col items-center justify-end gap-3 p-4 text-center">
      <HeroBlueprint className="absolute inset-x-0 top-4 mx-auto h-[62%] w-auto opacity-80" />
      <div className="panel relative max-w-sm px-4 py-3">
        <p className="text-sm text-paper">The live engine couldn’t start in this browser.</p>
        <p className="mt-1 text-xs leading-relaxed text-steel-400">
          The drawing shows a single-cylinder section: valves and spark plug at the top, the piston below, and the crank turning underneath.
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-x-4">
          <Link to={ENGINE_LAB} className="inline-flex min-h-9 items-center gap-1 text-sm text-cyan hover:underline">
            Try the engine lab <ArrowRight aria-hidden className="size-3.5" />
          </Link>
          {lesson && (
            <Link to={topicHref(lesson)} className="inline-flex min-h-9 items-center gap-1 text-sm text-steel-300 hover:text-paper">
              Read the lesson
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

/** Contains a failed chunk load or render error to the hero frame; the rest of the page is unaffected. */
class HeroBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    if (import.meta.env.DEV) console.warn('[home] engine hero unavailable', error, info.componentStack)
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
