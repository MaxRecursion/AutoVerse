import { useDocumentTitle } from '@/components/learning/useDocumentTitle'
import { ExplorerView } from '@/features/vehicle-explorer/ExplorerView'

/**
 * /explore — the complete car in 3D, system by system.
 * Deep links: `?system=braking`, `?component=brake-disc` (lab-style ids and
 * aliases resolve to the explorer's parts).
 */
export default function ExplorePage() {
  useDocumentTitle('Vehicle explorer')
  return <ExplorerView />
}
