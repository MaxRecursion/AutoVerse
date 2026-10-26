import { flushSync } from 'react-dom'

/**
 * Applies a same-page update inside a view transition (a short cross-fade,
 * styled in globals.css) where the browser supports it and the reader has not
 * asked for reduced motion; otherwise applies it directly. Route changes do
 * not need this: React's <ViewTransition> in the app shell animates those.
 */
export function withViewTransition(update: () => void): void {
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  if (typeof document === 'undefined' || typeof document.startViewTransition !== 'function' || reduced) {
    update()
    return
  }
  document.startViewTransition(() => flushSync(update))
}
