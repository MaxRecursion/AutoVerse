import { ArrowRight, ArrowUpRight, Network } from 'lucide-react'
import { Link } from 'react-router'
import { topicHref } from '@/components/learning/labels'
import { Button } from '@/components/ui/button'
import { getTopic } from '@/lib/content'
import { Reveal } from './Reveal'

interface PathNode {
  label: string
  role: string
  /** Lesson linked from the node when it is written. */
  topicId: string
}

/** The driveline in order, as most cars share it (a rear-drive car adds a propeller shaft before the differential). */
const POWER_PATH: readonly PathNode[] = [
  { label: 'Engine', role: 'Turns fuel into crankshaft torque', topicId: 'four-stroke-cycle' },
  { label: 'Clutch', role: 'Connects and disconnects the drive', topicId: 'clutch' },
  { label: 'Gearbox', role: 'Trades rotational speed for torque', topicId: 'manual-gearbox' },
  { label: 'Differential', role: 'Splits torque and lets the wheels turn at different speeds', topicId: 'differential' },
  { label: 'Driveshafts', role: 'Carry torque out to the wheel hubs', topicId: 'driveshafts-and-cv-joints' },
  { label: 'Wheels & tyres', role: 'Turn torque into grip at the contact patch', topicId: 'tyres-and-grip' },
]

/** Systems that keep the driveline working and the car under control. */
const SUPPORT: readonly { label: string; topicId: string }[] = [
  { label: 'Cooling', topicId: 'cooling-system' },
  { label: 'Lubrication', topicId: 'lubrication-system' },
  { label: 'Charging', topicId: 'alternator-and-charging' },
  { label: 'Brakes', topicId: 'brake-hydraulics' },
  { label: 'Steering', topicId: 'steering-systems' },
  { label: 'Suspension', topicId: 'suspension-basics' },
]

function NodeBody({ index, node }: { index: number; node: PathNode }) {
  return (
    <>
      <span aria-hidden className="w-6 shrink-0 font-mono text-[11px] tabular-nums text-steel-500">
        {String(index + 1).padStart(2, '0')}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-medium text-paper">{node.label}</span>
        <span className="text-xs leading-snug text-steel-400">{node.role}</span>
      </span>
    </>
  )
}

/** Homepage closer: the power path from engine to tyres, leading to the full system map. */
export function SystemMapTeaser() {
  const support = SUPPORT.flatMap((s) => {
    const topic = getTopic(s.topicId)
    return topic ? [{ ...s, topic }] : []
  })
  return (
    <section aria-labelledby="map-teaser-heading" className="mx-auto w-full max-w-[1400px] px-4 sm:px-6">
      <Reveal>
        <div className="panel relative isolate grid grid-cols-1 gap-8 overflow-hidden p-5 sm:p-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12 lg:p-10">
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-blueprint opacity-70" />
          <div className="flex flex-col items-start">
            <p className="eyebrow flex items-center gap-2">
              <span aria-hidden className="h-px w-5 bg-cyan" />
              System map
            </p>
            <h2 id="map-teaser-heading" className="mt-2 text-2xl font-semibold text-paper sm:text-3xl">
              See how it all connects
            </h2>
            <p className="mt-3 max-w-md leading-relaxed text-steel-300">
              Power takes a long route from the crankshaft to the road. Follow it through every component, and see which systems keep the
              whole machine running along the way.
            </p>
            <Button asChild size="lg" className="mt-6 h-11 px-5">
              <Link to="/map">
                <Network aria-hidden />
                Open the system map
                <ArrowRight aria-hidden />
              </Link>
            </Button>
            {support.length > 0 && (
              <div className="mt-8 w-full">
                <p className="eyebrow mb-2">Supporting systems</p>
                <ul className="flex flex-wrap gap-1.5">
                  {support.map((s) => (
                    <li key={s.topicId}>
                      <Link
                        to={topicHref(s.topic)}
                        className="inline-flex min-h-9 items-center rounded-full border border-white/[0.08] bg-graphite-950/70 px-3 text-sm text-steel-300 transition-colors hover:border-cyan/40 hover:text-paper"
                      >
                        {s.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div>
            <p id="power-path-label" className="annotation mb-3 uppercase tracking-wider text-steel-400">
              Power path · engine to road
            </p>
            <ol aria-labelledby="power-path-label" className="relative flex flex-col">
              {POWER_PATH.map((node, i) => {
                const topic = getTopic(node.topicId)
                const last = i === POWER_PATH.length - 1
                return (
                  <li key={node.label} className="relative pl-7">
                    {/* Amber rail = the flow of energy; one node marker per component. */}
                    <span aria-hidden className={`absolute left-[7px] w-px bg-amber/45 ${i === 0 ? 'top-1/2' : 'top-0'} ${last ? 'bottom-1/2' : 'bottom-0'}`} />
                    <span aria-hidden className="absolute left-0.5 top-1/2 size-[11px] -translate-y-1/2 rounded-full border-2 border-amber bg-graphite-950" />
                    {topic ? (
                      <Link
                        to={topicHref(topic)}
                        className="group flex min-h-14 items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-white/[0.04]"
                      >
                        <NodeBody index={i} node={node} />
                        <ArrowUpRight aria-hidden className="size-4 shrink-0 text-steel-500 transition-colors group-hover:text-cyan" />
                      </Link>
                    ) : (
                      <div className="flex min-h-14 items-center gap-3 px-3 py-2">
                        <NodeBody index={i} node={node} />
                      </div>
                    )}
                  </li>
                )
              })}
            </ol>
          </div>
        </div>
      </Reveal>
    </section>
  )
}
