import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

/**
 * Local-first learning progress (browser localStorage only — no account,
 * no sync, no analytics). Cleared with `clearAll`.
 */
export interface QuizResult {
  score: number
  total: number
  at: string
}

/**
 * Raw evidence of what the learner did in one lesson. Stage completion
 * (features/progress/stages.ts) is derived from this — nothing is ticked on
 * the learner's behalf.
 */
export interface LessonSignals {
  /** Read the introduction to its end. */
  overview?: true
  /** Brought the flow diagram into view (lessons with no lab and no steps). */
  flow?: true
  /** Did something in the lesson's lab (any entry in the lab store's `activity`). */
  lab?: true
  /** Opened a "Go deeper" panel or switched to the Technical level. */
  deeper?: true
  /** Opened the story behind the lesson. */
  story?: true
  /** Ids of the steps the learner has read or played. */
  steps: string[]
}
export type SignalKey = Exclude<keyof LessonSignals, 'steps'>

interface ProgressState {
  recent: { topicId: string; at: string }[]
  completed: Record<string, string>
  bookmarks: string[]
  quizScores: Record<string, QuizResult>
  lessons: Record<string, LessonSignals>
  /** Lab id → ids of the lab missions completed (features/labs/missions.ts). */
  missions: Record<string, string[]>
  visit: (topicId: string) => void
  setCompleted: (topicId: string, done: boolean) => void
  toggleBookmark: (topicId: string) => void
  recordQuiz: (topicId: string, score: number, total: number) => void
  signal: (topicId: string, key: SignalKey) => void
  seeStep: (topicId: string, stepId: string) => void
  completeMission: (labId: string, missionId: string) => void
  clearAll: () => void
}

const MAX_RECENT = 12
const empty = { recent: [], completed: {}, bookmarks: [], quizScores: {}, lessons: {}, missions: {} }

export const useProgress = create<ProgressState>()(
  persist(
    (set, get) => ({
      ...empty,
      visit: (topicId) =>
        set({
          recent: [{ topicId, at: new Date().toISOString() }, ...get().recent.filter((r) => r.topicId !== topicId)].slice(0, MAX_RECENT),
        }),
      setCompleted: (topicId, done) => {
        const completed = { ...get().completed }
        if (done) completed[topicId] = new Date().toISOString()
        else delete completed[topicId]
        set({ completed })
      },
      toggleBookmark: (topicId) => {
        const b = get().bookmarks
        set({ bookmarks: b.includes(topicId) ? b.filter((x) => x !== topicId) : [topicId, ...b] })
      },
      recordQuiz: (topicId, score, total) => {
        const prev = get().quizScores[topicId]
        // Keep the best attempt.
        if (prev && prev.score / prev.total > score / total) return
        set({ quizScores: { ...get().quizScores, [topicId]: { score, total, at: new Date().toISOString() } } })
      },
      // Both no-op when the evidence is already recorded, so repeated scroll / click events never re-render subscribers.
      signal: (topicId, key) => {
        const cur = get().lessons[topicId]
        if (cur?.[key]) return
        set({ lessons: { ...get().lessons, [topicId]: { ...cur, steps: cur?.steps ?? [], [key]: true } } })
      },
      seeStep: (topicId, stepId) => {
        const cur = get().lessons[topicId]
        if (cur?.steps.includes(stepId)) return
        set({ lessons: { ...get().lessons, [topicId]: { ...cur, steps: [...(cur?.steps ?? []), stepId] } } })
      },
      completeMission: (labId, missionId) => {
        const cur = get().missions[labId] ?? []
        if (cur.includes(missionId)) return
        set({ missions: { ...get().missions, [labId]: [...cur, missionId] } })
      },
      clearAll: () => set({ ...empty }),
    }),
    { name: 'autoverse.progress', version: 1, storage: createJSONStorage(() => localStorage) },
  ),
)
