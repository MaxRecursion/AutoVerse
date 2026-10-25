import { Link } from 'react-router'
import { useDocumentTitle } from '@/components/learning/useDocumentTitle'
import { SystemMapView } from '@/features/system-map/SystemMapView'
import { systemMap } from '@/lib/content'

/** /map — how the car's systems connect (`?layout=rwd|fwd|awd`). */
export default function SystemMapPage() {
  useDocumentTitle('System map')
  if (!systemMap || systemMap.layouts.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
        <h1 className="font-display text-2xl font-semibold text-paper">System map unavailable</h1>
        <p className="mt-3 text-steel-300">
          The map could not be loaded. Browse the{' '}
          <Link to="/learn" className="text-cyan underline-offset-2 hover:underline">
            lessons
          </Link>{' '}
          instead.
        </p>
      </div>
    )
  }
  return <SystemMapView map={systemMap} />
}
