/**
 * /map — how the car's systems connect. A layout switcher (rear-, front-,
 * all-wheel drive) redraws the power path; selecting a node explains it and
 * links to its lesson and to the 3D lab or vehicle explorer.
 */
import { useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Car, Pause, Play } from 'lucide-react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useMediaQuery, usePrefersReducedMotion } from '@/hooks/useMediaQuery'
import type { SystemMap } from '@/lib/schemas'
import { cn } from '@/lib/utils'
import { GROUP_BG } from './mapStyles'
import { SystemMapGraph } from './SystemMapGraph'
import { SystemMapDetails } from './SystemMapDetails'
import { SystemMapText } from './SystemMapText'
import { GROUP_IDS, GROUP_LABEL, getLayout, layoutGraph } from './systemMapModel'

export const DEFAULT_LAYOUT = 'fwd'
const LAYOUT_PARAM = 'layout'

/** Short switcher labels; the full title is the accessible name. */
const SHORT_TITLE: Readonly<Record<string, string>> = { rwd: 'Rear-wheel', fwd: 'Front-wheel', awd: 'All-wheel' }

function Legend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-steel-400" aria-label="Legend">
      <li className="flex items-center gap-1.5">
        <svg aria-hidden width="22" height="6" className="shrink-0">
          <line x1="0" y1="3" x2="22" y2="3" strokeWidth="3" className="stroke-amber" />
        </svg>
        Power flow
      </li>
      <li className="flex items-center gap-1.5">
        <svg aria-hidden width="22" height="6" className="shrink-0">
          <line x1="0" y1="3" x2="22" y2="3" strokeWidth="2" strokeDasharray="6 4" className="stroke-amber" />
        </svg>
        Branch (all-wheel drive)
      </li>
      <li className="flex items-center gap-1.5">
        <svg aria-hidden width="22" height="6" className="shrink-0">
          <line x1="0" y1="3" x2="22" y2="3" strokeWidth="1.2" strokeDasharray="3 4" className="stroke-steel-400" />
        </svg>
        Connection
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="inline-flex size-4 items-center justify-center rounded-full border border-amber/80 font-mono text-[9px] text-amber">
          1
        </span>
        Step in the power path
      </li>
      {GROUP_IDS.map((g) => (
        <li key={g} className="flex items-center gap-1.5">
          <span aria-hidden className={cn('h-3 w-[3px] rounded-full', GROUP_BG[g])} />
          {GROUP_LABEL[g]}
        </li>
      ))}
    </ul>
  )
}

export function SystemMapView({ map }: { map: SystemMap }) {
  const [params, setParams] = useSearchParams()
  const requested = params.get(LAYOUT_PARAM)
  const layout = getLayout(map, requested ?? DEFAULT_LAYOUT) ?? getLayout(map, DEFAULT_LAYOUT) ?? map.layouts[0]
  const graph = useMemo(() => layoutGraph(map, layout.id), [map, layout.id])

  const [selected, setSelected] = useState<string | null>(null)
  // A node the new layout does not draw (e.g. the propeller shaft in front-wheel drive) is deselected.
  const selectedId = selected && graph.nodes.some((n) => n.node.id === selected) ? selected : null

  const reducedMotion = usePrefersReducedMotion()
  const [paused, setPaused] = useState(false)
  const wide = useMediaQuery('(min-width: 1024px)')
  const detailsHeading = useRef<HTMLHeadingElement>(null)

  const chooseLayout = (id: string) => {
    if (!id || id === layout.id) return
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (id === DEFAULT_LAYOUT) next.delete(LAYOUT_PARAM)
        else next.set(LAYOUT_PARAM, id)
        return next
      },
      { replace: true, preventScrollReset: true },
    )
  }

  const select = (id: string | null) => {
    setSelected(id)
    // Below the diagram on small screens: bring the explanation into view.
    if (id && !wide) {
      requestAnimationFrame(() => {
        detailsHeading.current?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' })
        detailsHeading.current?.focus({ preventScroll: true })
      })
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-10">
      <header className="max-w-3xl">
        <p className="eyebrow">System map</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-paper sm:text-4xl">How the systems connect</h1>
        <p className="mt-3 leading-relaxed text-steel-300">
          Power leaves the engine and passes through the driveline to the wheels, while cooling, lubrication, fuel and the electrical system
          keep the engine running. Switch layouts to see how the path changes, and select any part to learn more.
        </p>
      </header>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <ToggleGroup
          type="single"
          variant="outline"
          value={layout.id}
          onValueChange={chooseLayout}
          aria-label="Drivetrain layout"
          className="panel bg-graphite-950/70"
        >
          {map.layouts.map((l) => (
            <ToggleGroupItem key={l.id} value={l.id} aria-label={l.title} className="h-10 px-3 text-sm data-[state=on]:bg-amber/15 data-[state=on]:text-amber">
              <span>
                {SHORT_TITLE[l.id] ?? l.title}
                {SHORT_TITLE[l.id] && <span className="max-sm:hidden"> drive</span>}
              </span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {!reducedMotion && (
          <button
            type="button"
            aria-pressed={paused}
            onClick={() => setPaused((p) => !p)}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-white/10 px-3 text-sm text-steel-300 transition-colors hover:border-cyan/50 hover:text-paper focus-visible:outline-2 focus-visible:outline-cyan"
          >
            {paused ? <Play aria-hidden className="size-4" /> : <Pause aria-hidden className="size-4" />}
            {paused ? 'Play flow' : 'Pause flow'}
          </button>
        )}
        <Link
          to="/explore"
          className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-2 text-sm text-steel-300 hover:text-paper focus-visible:outline-2 focus-visible:outline-cyan sm:ml-auto"
        >
          <Car aria-hidden className="size-4" />
          See the whole car in 3D
        </Link>
      </div>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section aria-label={`${layout.title} diagram`} className="rounded-xl border border-white/[0.07] bg-graphite-950 bg-blueprint p-2 sm:p-5">
          <SystemMapGraph
            graph={graph}
            label={`${layout.title}: power flow and connected systems`}
            selectedId={selectedId}
            onSelect={select}
            animate={!paused && !reducedMotion}
          />
          <div className="mt-4 border-t border-white/[0.06] px-1 pt-3 sm:px-0">
            <Legend />
          </div>
        </section>
        <aside aria-label="Selected part" className="lg:sticky lg:top-20">
          <SystemMapDetails
            map={map}
            layout={layout}
            graph={graph}
            selectedId={selectedId}
            onClear={() => setSelected(null)}
            headingRef={detailsHeading}
          />
        </aside>
      </div>

      <SystemMapText map={map} layout={layout} />
    </div>
  )
}
