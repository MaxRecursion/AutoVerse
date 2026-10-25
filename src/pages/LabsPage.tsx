import { Info, MonitorSmartphone } from 'lucide-react'
import { useDocumentTitle } from '@/components/learning/useDocumentTitle'
import { LabIndexCard } from '@/features/home/LabCard'
import { getLabOverviews } from '@/features/home/labOverview'

/** /labs — every registered laboratory with what it covers and where its lesson is. */
export default function LabsPage() {
  useDocumentTitle('Labs')
  const overviews = getLabOverviews()

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
      <header className="max-w-3xl">
        <p className="eyebrow">Laboratories</p>
        <h1 className="mt-2 text-3xl font-semibold text-paper sm:text-4xl">Interactive engineering labs</h1>
        <p className="mt-3 leading-relaxed text-steel-300">
          {overviews.length === 1 ? 'One working 3D model' : `${overviews.length} working 3D models`} you can operate and take apart on
          screen. Select any part to see what it does, explode the assembly, or hide parts to look inside. Each lab pairs with a lesson that
          explains it step by step.
        </p>
      </header>

      <ul className="mt-6 grid grid-cols-1 gap-2 text-sm leading-relaxed text-steel-300 md:grid-cols-2">
        <li className="flex items-start gap-3 rounded-lg border border-white/[0.07] bg-graphite-900/60 px-4 py-3">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-amber" />
          <span>Simulation values (angles, ratios, pressures, forces) are illustrative teaching values, not data for any real vehicle.</span>
        </li>
        <li className="flex items-start gap-3 rounded-lg border border-white/[0.07] bg-graphite-900/60 px-4 py-3">
          <MonitorSmartphone aria-hidden className="mt-0.5 size-4 shrink-0 text-cyan" />
          <span>Lab controls and parts lists work with touch and the keyboard. Without 3D graphics support, a 2D diagram takes the model’s place.</span>
        </li>
      </ul>

      {overviews.length > 0 ? (
        <ul className="mt-8 grid grid-cols-1 gap-5">
          {overviews.map((o) => (
            <li key={o.lab.id}>
              <LabIndexCard overview={o} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-8 text-steel-400">No laboratories are available yet.</p>
      )}
    </div>
  )
}
