import { create } from 'zustand'

export interface Toast {
  id: number
  title: string
  description?: string
  tone: 'info' | 'success'
  action?: { label: string; to: string }
  /** Milliseconds before auto-dismiss; 0 keeps it until dismissed. */
  duration: number
}

interface ToastState {
  toasts: Toast[]
  push: (t: Omit<Toast, 'id' | 'tone' | 'duration'> & Partial<Pick<Toast, 'tone' | 'duration'>>) => number
  dismiss: (id: number) => void
  clear: () => void
}

let nextId = 1
const MAX_VISIBLE = 3

/** Lightweight feedback for real progress events. Rendered by <ToastHost> in the app shell. */
export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (t) => {
    const id = nextId++
    const toast: Toast = { tone: 'info', duration: 5000, ...t, id }
    // Newest last; drop the oldest beyond the cap so a burst never covers the page.
    set({ toasts: [...get().toasts, toast].slice(-MAX_VISIBLE) })
    return id
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((x) => x.id !== id) }),
  clear: () => set({ toasts: [] }),
}))

/** Imperative helper for non-React callers. */
export const toast = (t: Parameters<ToastState['push']>[0]) => useToasts.getState().push(t)
