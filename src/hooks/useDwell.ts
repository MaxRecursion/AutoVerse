import { useEffect, useRef, type RefObject } from 'react'

export interface DwellOptions {
  /** Fraction of the element that must be visible. */
  threshold?: number
  /** How long it must stay visible before counting, in ms. */
  ms?: number
  enabled?: boolean
}

/**
 * Calls `onDwell` once when the element has been on screen for `ms` — evidence
 * that it was actually read, not scrolled past. No-op where IntersectionObserver
 * is missing (tests, very old browsers).
 */
export function useDwell(ref: RefObject<Element | null>, onDwell: () => void, { threshold = 0.6, ms = 1200, enabled = true }: DwellOptions = {}) {
  const callback = useRef(onDwell)
  useEffect(() => {
    callback.current = onDwell
  })
  useEffect(() => {
    const el = ref.current
    if (!el || !enabled || typeof IntersectionObserver === 'undefined') return
    let timer: ReturnType<typeof setTimeout> | undefined
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          timer ??= setTimeout(() => {
            callback.current()
            observer.disconnect()
          }, ms)
        } else {
          clearTimeout(timer)
          timer = undefined
        }
      },
      { threshold },
    )
    observer.observe(el)
    return () => {
      clearTimeout(timer)
      observer.disconnect()
    }
  }, [ref, enabled, threshold, ms])
}
