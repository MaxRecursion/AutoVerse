import { useEffect } from 'react'
import { BeginnerPath } from '@/features/home/BeginnerPath'
import { CategoryGrid } from '@/features/home/CategoryGrid'
import { ContinueLearning } from '@/features/home/ContinueLearning'
import { FeaturedLabs } from '@/features/home/FeaturedLabs'
import { HeroSection } from '@/features/home/HeroSection'
import { LearningJourney } from '@/features/home/LearningJourney'
import { HomeSearch } from '@/features/home/HomeSearch'
import { GettingStarted } from '@/features/progress/GettingStarted'
import { HOME_DOCUMENT_TITLE } from '@/features/home/homeData'
import { HomeMotion } from '@/features/home/Reveal'
import { SystemMapTeaser } from '@/features/home/SystemMapTeaser'
import { EngineSoundSpotlight } from '@/features/home/EngineSoundSpotlight'

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
      <div className="pb-10">
        <HeroSection />
        <div className="mx-auto grid w-full max-w-[1400px] grid-cols-1 gap-4 px-4 pt-4 sm:px-6 lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-8"><EngineSoundSpotlight /></div>
          <div className="min-w-0 lg:col-span-4"><LearningJourney /></div>
          <div className="grid min-w-0 grid-cols-1 items-start gap-4 empty:hidden lg:col-span-12 lg:grid-cols-2 [&>*:only-child]:lg:col-span-2">
            <GettingStarted variant="home" />
            <ContinueLearning />
          </div>
          <div className="min-w-0 lg:col-span-12"><HomeSearch /></div>
          <div className="min-w-0 lg:col-span-12"><FeaturedLabs /></div>
          <div className="min-w-0 lg:col-span-12"><BeginnerPath /></div>
          <div className="min-w-0 lg:col-span-8"><CategoryGrid /></div>
          <div className="min-w-0 lg:col-span-4"><SystemMapTeaser /></div>
        </div>
      </div>
    </HomeMotion>
  )
}
