import { CircleHelp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useStartTour } from './useStartTour'

/** Header entry point: replays the tour from wherever the learner is. */
export function TourButton() {
  const start = useStartTour()
  return (
    <Button variant="ghost" size="icon" className="size-9 text-steel-300 hover:text-paper" aria-label="Take the tour" title="Take the tour" onClick={start}>
      <CircleHelp aria-hidden />
    </Button>
  )
}
