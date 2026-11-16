import { ArrowRight, AudioLines } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const LAYOUTS = ['I3', 'I4', 'I5', 'I6', 'V6', 'V8', 'V10'] as const

/** Original schematic pulse trains; these illustrate timing rather than recorded audio. */
function RhythmPreview() {
  const trains = [
    { label: 'Even firing', pulses: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], color: 'text-cyan' },
    { label: 'Uneven firing', pulses: [0, 0.75, 2, 2.75, 4, 4.75, 6, 6.75, 8, 8.75], color: 'text-amber' },
  ]
  return (
    <div className="flex h-full flex-col justify-center rounded-xl border border-line/[0.06] bg-graphite-950/70 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="eyebrow">The rhythm of combustion</span>
        <AudioLines aria-hidden className="size-5 shrink-0 text-cyan" />
      </div>
      <div aria-hidden className="space-y-3">
        {trains.map(({ label, pulses, color }) => (
          <div key={label}>
            <p className="mb-1.5 font-mono text-[11px] text-steel-400">{label}</p>
            <svg viewBox="0 0 360 58" fill="none" className={cn('w-full', color)}>
              <path d="M0 46h360" stroke="currentColor" strokeOpacity="0.2" />
              {pulses.map((pulse, i) => (
                <path key={i} d={`M${10 + pulse * 36} 46v-34l5 34`} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              ))}
            </svg>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs leading-relaxed text-steel-400">Illustrative pulse spacing. Hear the difference in the lab.</p>
    </div>
  )
}

/** Shared promotion for the signature experience, without loading its audio engine on entry pages. */
export function SoundLabFeatureCard({ className }: { className?: string }) {
  return (
    <article aria-labelledby="sound-lab-feature-heading" className={cn('relative overflow-hidden rounded-xl border border-cyan/20 bg-graphite-900 bg-blueprint', className)}>
      <div aria-hidden className="pointer-events-none absolute -left-12 -top-24 size-96 bg-[radial-gradient(closest-side,rgb(56_215_242/0.08),transparent)]" />
      <div className="relative grid h-full gap-4 p-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div>
          <p className="eyebrow flex items-center gap-2 text-cyan"><span aria-hidden className="size-1.5 rounded-full bg-cyan" />AutoVerse signature lab</p>
          <h2 id="sound-lab-feature-heading" className="mt-2 max-w-lg text-xl font-semibold leading-tight text-paper sm:text-2xl">Why does a V10 sound like that?</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-steel-300">
            Start with production engines from three cylinders to ten. Compare bank angles and firing orders, turn up the RPM,
            and connect every firing pulse to the sound you hear.
          </p>
          <ul aria-label="Engine layouts to explore" className="mt-3 flex flex-wrap gap-1.5">
            {LAYOUTS.map((layout) => (
              <li key={layout} className="rounded-md border border-line/10 bg-graphite-950/70 px-2.5 py-1 font-mono text-xs text-steel-300">{layout}</li>
            ))}
          </ul>
          <Button asChild className="mt-4 h-10 pointer-coarse:min-h-11">
            <Link to="/sound-lab">Compare production engines<ArrowRight aria-hidden /></Link>
          </Button>
          <p className="mt-3 max-w-lg text-xs leading-relaxed text-steel-400">
            Sound is synthesized live from the firing model. Exhaust and intake acoustics are approximations; these are not vehicle recordings.
          </p>
        </div>
        <RhythmPreview />
      </div>
    </article>
  )
}

export function EngineSoundSpotlight() {
  return (
    <section aria-label="Engine Sound Lab" className="h-full min-w-0">
      <SoundLabFeatureCard className="h-full" />
    </section>
  )
}
