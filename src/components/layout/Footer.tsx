import { Link } from 'react-router'
import { useStartTour } from '@/features/tour/useStartTour'
import { Logo } from './Logo'

export function Footer() {
  const startTour = useStartTour()
  return (
    <footer className="border-t border-white/[0.06] bg-graphite-950 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-8 text-sm text-steel-400 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-4">
          <Logo />
          <span className="text-xs">Original educational content. Simulations are illustrative, not validated engineering models.</span>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-4 gap-y-1 text-xs pointer-coarse:gap-y-0">
          <Link to="/learn" className="relative hit-area inline-flex items-center hover:text-paper pointer-coarse:min-h-12">Topic index</Link>
          <Link to="/pioneers" className="relative hit-area inline-flex items-center hover:text-paper pointer-coarse:min-h-12">Pioneers</Link>
          <Link to="/glossary" className="relative hit-area inline-flex items-center hover:text-paper pointer-coarse:min-h-12">Glossary</Link>
          <Link to="/map" className="relative hit-area inline-flex items-center hover:text-paper pointer-coarse:min-h-12">System map</Link>
          <button type="button" onClick={startTour} className="relative hit-area inline-flex items-center hover:text-paper pointer-coarse:min-h-12">Take the tour</button>
          <Link to="/about" className="relative hit-area inline-flex items-center hover:text-paper pointer-coarse:min-h-12">Sources &amp; credits</Link>
          <Link to="/progress" className="relative hit-area inline-flex items-center hover:text-paper pointer-coarse:min-h-12">Local progress</Link>
          <a href="https://maxrecursion.dev" className="relative hit-area inline-flex items-center hover:text-paper pointer-coarse:min-h-12">Made by Akshay Kulkarni</a>
        </nav>
      </div>
    </footer>
  )
}
