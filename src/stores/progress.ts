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

interface ProgressState {
  recent: { topicId: string; at: string }[]
  completed: Record<string, string>
  bookmarks: string[]
  quizScores: Record<string, QuizResult>
  visit: (topicId: string) => void
  setCompleted: (topicId: string, done: boolean) => void
  toggleBookmark: (topicId: string) => void
  recordQuiz: (topicId: string, score: number, total: number) => void
  clearAll: () => void
}

const MAX_RECENT = 12
const empty = { recent: [], completed: {}, bookmarks: [], quizScores: {} }

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
      clearAll: () => set({ ...empty }),
    }),
    { name: 'autoverse.progress', version: 1, storage: createJSONStorage(() => localStorage) },
  ),
)
