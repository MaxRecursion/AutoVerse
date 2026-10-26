import { Link } from 'react-router'
import { useStartTour } from '@/features/tour/useStartTour'
import { Logo } from './Logo'

export function Footer() {
  const startTour = useStartTour()
  return (
    <footer className="border-t border-white/[0.06] bg-graphite-950">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-8 text-sm text-steel-400 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-4">
          <Logo />
          <span className="text-xs">Original educational content. Simulations are illustrative, not validated engineering models.</span>
        </div>
        <nav aria-label="Footer" className="flex gap-4 text-xs">
          <Link to="/learn" className="hover:text-paper">Topic index</Link>
          <Link to="/pioneers" className="hover:text-paper">Pioneers</Link>
          <Link to="/map" className="hover:text-paper">System map</Link>
          <button type="button" onClick={startTour} className="hover:text-paper">Take the tour</button>
          <Link to="/about" className="hover:text-paper">Sources &amp; credits</Link>
          <Link to="/progress" className="hover:text-paper">Local progress</Link>
        </nav>
      </div>
    </footer>
  )
}
