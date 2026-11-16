import { useStartTour } from '@/features/tour/useStartTour'
import { Logo } from './Logo'
import { NavigationLink } from './NavigationLink'
import { primaryNav, secondaryNav } from './nav'
import { BookOpen, Info } from 'lucide-react'

export function Footer() {
  const startTour = useStartTour()
  return (
    <footer className="border-t border-line/[0.06] bg-graphite-950 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-8 text-sm text-steel-400 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-4">
          <Logo />
          <span className="text-xs">Original educational content. Simulations are illustrative, not validated engineering models.</span>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-4 gap-y-1 text-xs pointer-coarse:gap-y-0">
          <NavigationLink item={{ ...primaryNav[0], label: 'Engine Sound Lab' }} variant="footer" />
          <NavigationLink item={{ ...primaryNav[2], label: 'Topic index' }} variant="footer" />
          <NavigationLink item={primaryNav[4]} variant="footer" />
          <NavigationLink item={{ to: '/glossary', label: 'Glossary', accent: 'learn', icon: BookOpen }} variant="footer" />
          <NavigationLink item={{ ...secondaryNav[0], label: 'System map' }} variant="footer" />
          <button type="button" onClick={startTour} className="relative hit-area inline-flex items-center hover:text-paper pointer-coarse:min-h-12">Take the tour</button>
          <NavigationLink item={{ to: '/about', label: 'Sources & credits', accent: 'map', icon: Info }} variant="footer" />
          <NavigationLink item={{ ...primaryNav[5], label: 'Local progress' }} variant="footer" />
          <a href="https://maxrecursion.dev" className="relative hit-area inline-flex items-center hover:text-paper pointer-coarse:min-h-12">Made by Akshay Kulkarni</a>
        </nav>
      </div>
    </footer>
  )
}
