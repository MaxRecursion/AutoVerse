import { Info, MonitorSmartphone } from 'lucide-react'
import { useDocumentTitle } from '@/components/learning/useDocumentTitle'
import { LabIndexCard } from '@/features/home/LabCard'
import { getLabOverviews } from '@/features/home/labOverview'
import { SoundLabFeatureCard } from '@/features/home/EngineSoundSpotlight'

/** /labs — every registered laboratory with what it covers and where its lesson is. */
export default function LabsPage() {
  useDocumentTitle('Labs')
  const overviews = getLabOverviews()
  const partsCount = new Set(overviews.flatMap((item) => item.parts.map((part) => part.id))).size

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6 lg:py-6">
      <header className="max-w-3xl">
        <p className="eyebrow">Laboratories</p>
        <h1 className="mt-1 text-2xl font-semibold text-paper sm:text-3xl">Interactive engineering labs</h1>
        <p className="mt-2 text-sm leading-relaxed text-steel-300">
          {overviews.length === 1 ? 'One working 3D model' : `${overviews.length} working 3D models`} you can operate and take apart on
          screen. Select any part to see what it does, explode the assembly, or hide parts to look inside. Each lab pairs with a lesson that
          explains it step by step.
        </p>
      </header>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-12" data-testid="labs-bento">
        <SoundLabFeatureCard className="lg:col-span-8" />
        <aside aria-label="Lab guide" className="panel flex min-w-0 flex-col justify-center gap-4 p-4 lg:col-span-4">
          <dl className="grid grid-cols-2 gap-3 border-b border-line/[0.07] pb-4">
            <div>
              <dt className="text-xs text-steel-400">3D assemblies</dt>
              <dd className="mt-1 font-display text-2xl tabular-nums text-paper">{overviews.length}</dd>
            </div>
            <div>
              <dt className="text-xs text-steel-400">Parts to inspect</dt>
              <dd className="mt-1 font-display text-2xl tabular-nums text-paper">{partsCount}</dd>
            </div>
          </dl>
          <ul className="space-y-3 text-sm leading-relaxed text-steel-300">
            <li className="flex items-start gap-2">
              <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-amber" />
              <span>Simulation values (angles, ratios, pressures, forces) are illustrative teaching values, not data for any real vehicle.</span>
            </li>
            <li className="flex items-start gap-2">
              <MonitorSmartphone aria-hidden className="mt-0.5 size-4 shrink-0 text-cyan" />
              <span>Lab controls and parts lists work with touch and the keyboard. Without 3D graphics support, a 2D diagram takes the model’s place.</span>
            </li>
          </ul>
        </aside>
      </div>

      {overviews.length > 0 ? (
        <ul className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {overviews.map((o) => (
            <li key={o.lab.id}>
              <LabIndexCard overview={o} compact />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-8 text-steel-400">No laboratories are available yet.</p>
      )}
    </div>
  )
}
