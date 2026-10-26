import { useState } from 'react'
import { Menu } from 'lucide-react'
import { NavLink } from 'react-router'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { SearchCommand } from '@/features/search/SearchCommand'
import { cn } from '@/lib/utils'
import { Logo } from './Logo'
import { primaryNav, secondaryNav } from './nav'
import { TourButton } from '@/features/tour/TourButton'
import { useStartTour } from '@/features/tour/useStartTour'
import { ProgressPill } from './ProgressPill'

export function Header() {
  const [open, setOpen] = useState(false)
  const startTour = useStartTour()
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-graphite-950/85 backdrop-blur-lg">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-4 px-4 sm:px-6">
        <Logo />
        <nav aria-label="Primary" data-tour="nav" className="ml-4 hidden items-center gap-1 md:flex">
          {primaryNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn('rounded-md px-3 py-1.5 text-sm text-steel-300 transition-colors hover:text-paper', isActive && 'bg-white/[0.06] text-paper')
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ProgressPill />
          <SearchCommand />
          <TourButton />
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu" data-tour="menu-button">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 border-white/10 bg-graphite-900">
              <SheetHeader>
                <SheetTitle>
                  <Logo />
                </SheetTitle>
              </SheetHeader>
              <nav aria-label="Mobile" className="flex flex-col gap-1 px-4">
                {[...primaryNav, ...secondaryNav].map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) => cn('rounded-md px-3 py-3 text-base text-steel-300', isActive && 'bg-white/[0.06] text-paper')}
                  >
                    {item.label}
                  </NavLink>
                ))}
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
