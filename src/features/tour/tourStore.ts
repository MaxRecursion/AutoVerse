import { create } from 'zustand'
import { setTourActive } from '@/lib/tourState'
import { usePreferences } from '@/stores/preferences'
import { TOUR_LENGTH } from './steps'

export type TourOutcome = 'completed' | 'skipped' | 'interrupted'

interface TourState {
  active: boolean
  index: number
  /** Where the learner was when they started, so closing the tour puts them back. */
  origin: string | null
  start: (origin?: string) => void
  next: () => void
  back: () => void
  /** Ends the tour. `completed` / `skipped` are remembered so the invitation is not shown again. */
  stop: (outcome: TourOutcome) => void
}

export const useTour = create<TourState>((set, get) => ({
  active: false,
  index: 0,
  origin: null,
  start: (origin) => {
    setTourActive(true)
    set({ active: true, index: 0, origin: origin ?? null })
  },
  next: () => set({ index: Math.min(TOUR_LENGTH - 1, get().index + 1) }),
  back: () => set({ index: Math.max(0, get().index - 1) }),
  stop: (outcome) => {
    if (!get().active) return
    if (outcome !== 'interrupted') usePreferences.getState().setTourStatus(outcome)
    setTourActive(false)
    set({ active: false, index: 0 })
  },
}))
