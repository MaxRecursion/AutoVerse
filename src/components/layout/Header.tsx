import { useState } from 'react'
import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { SearchCommand } from '@/features/search/SearchCommand'
import { Logo } from './Logo'
import { primaryNav, secondaryNav } from './nav'
import { TourButton } from '@/features/tour/TourButton'
import { useStartTour } from '@/features/tour/useStartTour'
import { ProgressPill } from './ProgressPill'
import { CourseNavigationTrigger } from '@/features/course-navigation/CourseNavigation'
import { ThemeToggle } from '@/features/theme/ThemeToggle'
import { NavigationLink } from './NavigationLink'

export function Header() {
  const [open, setOpen] = useState(false)
  const startTour = useStartTour()
  return (
    <header className="sticky top-0 z-40 border-b border-line/[0.06] bg-graphite-950/85 pt-[env(safe-area-inset-top)] backdrop-blur-lg [view-transition-name:site-header]">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-2 px-3 sm:gap-4 sm:px-6">
        <CourseNavigationTrigger />
        <Logo compactOnPhone />
        <nav aria-label="Primary" data-tour="nav" className="ml-4 hidden items-center gap-1 xl:flex">
          {primaryNav.map((item) => <NavigationLink key={item.to} item={item} />)}
        </nav>
        <div className="ml-auto flex items-center gap-1 sm:gap-2 pointer-coarse:gap-2.5">
          <ProgressPill />
          <SearchCommand />
          <ThemeToggle />
          <span className="hidden min-[360px]:contents"><TourButton /></span>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="pointer-coarse:ml-0.5 xl:hidden" aria-label="Open menu" data-tour="menu-button">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 border-line/10 bg-graphite-900">
              <SheetHeader>
                <SheetTitle>
                  <Logo />
                </SheetTitle>
              </SheetHeader>
              <nav aria-label="Mobile" className="flex flex-col gap-1 px-4">
                {[...primaryNav, ...secondaryNav].map((item) => <NavigationLink key={item.to} item={item} variant="menu" onClick={() => setOpen(false)} />)}
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    setTimeout(startTour, 150)
                  }}
                  className="rounded-md px-3 py-3 text-left text-base text-steel-300 hover:text-paper"
                >
                  Take the tour
                </button>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}
