import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ExplanationLevel } from '@/lib/schemas'

interface PreferencesState {
  level: ExplanationLevel
  setLevel: (level: ExplanationLevel) => void
}

/** UI preferences persisted locally (explanation level survives navigation and reloads). */
export const usePreferences = create<PreferencesState>()(
  persist((set) => ({ level: 'beginner', setLevel: (level) => set({ level }) }), { name: 'autoverse.preferences' }),
)
