import { useEffect } from 'react'
import { BeginnerPath } from '@/features/home/BeginnerPath'
import { CategoryGrid } from '@/features/home/CategoryGrid'
import { ContinueLearning } from '@/features/home/ContinueLearning'
import { FeaturedLabs } from '@/features/home/FeaturedLabs'
import { HeroSection } from '@/features/home/HeroSection'
import { HomeSearch } from '@/features/home/HomeSearch'
import { HOME_DOCUMENT_TITLE } from '@/features/home/homeData'
import { HomeMotion } from '@/features/home/Reveal'
import { SystemMapTeaser } from '@/features/home/SystemMapTeaser'

/** Keep the site title on `/` (the same one index.html and the prerendered page carry). */
function useHomeTitle() {
  useEffect(() => {
    const previous = document.title
    document.title = HOME_DOCUMENT_TITLE
    return () => {
      document.title = previous
    }
  }, [])
}

/**
 * `/` — the live engine hero and the ways into AutoVerse: search, labs,
 * the beginner path, categories and the system map. Only the hero's 3D chunk
 * is heavy, and it is lazy-loaded.
 */
export default function HomePage() {
  useHomeTitle()
  return (
    <HomeMotion>
      <div className="pb-16 lg:pb-24">
        <HeroSection />
        <div className="flex flex-col gap-16 pt-10 lg:gap-24 lg:pt-14">
          <HomeSearch />
          <ContinueLearning />
          <FeaturedLabs />
          <BeginnerPath />
          <CategoryGrid />
          <SystemMapTeaser />
        </div>
      </div>
    </HomeMotion>
  )
}
