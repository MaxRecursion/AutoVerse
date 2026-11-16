import { useSyncExternalStore } from 'react'

export type Theme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'autoverse.theme'
const THEME_COLOURS: Record<Theme, string> = { dark: '#0b0c0f', light: '#f4f7fb' }
const listeners = new Set<() => void>()
let theme: Theme = 'dark'
let stopListening: (() => void) | undefined

const validTheme = (value: string | null): Theme => value === 'light' ? 'light' : 'dark'

/** Called only during browser startup or an interaction, never while rendering. */
function applyTheme(next: Theme) {
  document.documentElement.dataset.theme = next
  document.documentElement.classList.toggle('dark', next === 'dark')
  document.documentElement.style.colorScheme = next
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOURS[next])
  if (theme === next) return
  theme = next
  listeners.forEach((listener) => listener())
}

/** Apply a learner's choice immediately; storage restrictions never disable the control. */
export function setTheme(next: Theme) {
  applyTheme(next)
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next)
  } catch {
    // Private or embedded browsers can reject storage. The current tab still works.
  }
}

export const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark')

/**
 * Browser entry point, before React takes over the prerendered page. The tiny
 * inline script in index.html applies the same choice before the first paint;
 * this store then owns live updates and synchronises other open tabs.
 */
export function initializeTheme(): () => void {
  if (stopListening) return stopListening
  let stored: string | null = null
  try {
    stored = localStorage.getItem(THEME_STORAGE_KEY)
  } catch {
    // Keep the existing dark appearance when no preference can be read.
  }
  applyTheme(validTheme(stored))
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY && event.key !== null) return
    applyTheme(validTheme(event.newValue))
  }
  window.addEventListener('storage', onStorage)
  stopListening = () => {
    window.removeEventListener('storage', onStorage)
    stopListening = undefined
  }
  return stopListening
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
const getSnapshot = () => theme
const getServerSnapshot = (): Theme => 'dark'

/** A render-safe snapshot; browser APIs are confined to startup and event handlers. */
export const useTheme = () => useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
