import { useEffect, useState } from 'react'
import { Compass } from 'lucide-react'
import { useLocation } from 'react-router'
import { Button } from '@/components/ui/button'
import { usePreferences } from '@/stores/preferences'
import { useProgress } from '@/stores/progress'
import { useTour } from './tourStore'
import { useStartTour } from './useStartTour'

const DELAY_MS = 2500

/**
 * A gentle, dismissible offer to take the tour, shown once to a brand-new
 * visitor on the home page. It never starts the tour by itself, never steals
 * focus, and never returns once answered.
 */
export function TourInvite() {
  const status = usePreferences((s) => s.tourStatus)
  const setStatus = usePreferences((s) => s.setTourStatus)
  const active = useTour((s) => s.active)
  const started = useProgress((s) => s.recent.length > 0 || Object.keys(s.completed).length > 0)
  const { pathname } = useLocation()
  const start = useStartTour()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setReady(true), DELAY_MS)
    return () => clearTimeout(timer)
  }, [])

  if (!ready || active || status !== 'new' || started || pathname !== '/') return null
  return (
    <section
      aria-label="Product tour invitation"
      className="panel fixed bottom-3 left-3 right-3 z-50 flex max-w-sm flex-col gap-3 border-cyan/30 p-4 shadow-2xl sm:bottom-5 sm:left-5 sm:right-auto"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full border border-cyan/40 bg-cyan/10 text-cyan">
          <Compass aria-hidden className="size-4" />
        </span>
        <div>
          <p className="font-medium text-paper">New here? Take a 60-second tour.</p>
          <p className="mt-0.5 text-sm leading-snug text-steel-300">See how lessons, 3D labs and your progress fit together.</p>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" className="h-10" onClick={() => setStatus('declined')}>
          No thanks
        </Button>
        <Button className="h-10" onClick={start}>
          Show me around
        </Button>
      </div>
    </section>
  )
}
