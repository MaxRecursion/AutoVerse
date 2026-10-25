import { HomeSection } from './HomeSection'
import { LabCard } from './LabCard'
import { getLabOverviews } from './labOverview'

const FEATURED = 4

/** Homepage band: the registered labs (registry order). */
export function FeaturedLabs() {
  const overviews = getLabOverviews().slice(0, FEATURED)
  if (overviews.length === 0) return null
  return (
    <HomeSection
      id="labs"
      eyebrow="Interactive laboratories"
      title="Run the machinery yourself"
      description="Each lab is a working 3D model whose parts move in step with one another. Run it, change its inputs and select any part to see what it does."
      action={{ to: '/labs', label: 'All labs' }}
    >
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {overviews.map((o) => (
          <li key={o.lab.id}>
            <LabCard overview={o} />
          </li>
        ))}
      </ul>
    </HomeSection>
  )
}
