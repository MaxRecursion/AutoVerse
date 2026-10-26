import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ExplanationLevel } from '@/lib/schemas'

/** Whether the learner has seen, finished or waved away the product tour (it is never forced). */
export type TourStatus = 'new' | 'completed' | 'skipped' | 'declined'

interface PreferencesState {
  level: ExplanationLevel
  setLevel: (level: ExplanationLevel) => void
  tourStatus: TourStatus
  setTourStatus: (status: TourStatus) => void
  /** Name printed on certificates. Stays in this browser. */
  learnerName: string
  setLearnerName: (name: string) => void
}

/** UI preferences persisted locally (explanation level survives navigation and reloads). */
export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      level: 'beginner',
      setLevel: (level) => set({ level }),
      tourStatus: 'new',
      setTourStatus: (tourStatus) => set({ tourStatus }),
      learnerName: '',
      setLearnerName: (learnerName) => set({ learnerName: learnerName.slice(0, 60) }),
    }),
    { name: 'autoverse.preferences' },
  ),
)
