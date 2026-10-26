import { useEffect, useState } from 'react'
import { boxesEqual, type Box } from './geometry'

export type TargetStatus = 'none' | 'waiting' | 'found' | 'missing'

interface Tracked {
  key: string
  status: TargetStatus
  box: Box | null
}

/** First selector whose element is actually on screen (a hidden or zero-size match does not count). */
export function findTarget(selectors: readonly string[]): Element | null {
  for (const selector of selectors) {
    const el = document.querySelector(selector)
    if (!el) continue
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden') return el
  }
  return null
}

const HEADER_CLEARANCE = 64

/** Scrolls the target into view only if it is not already comfortably visible (sticky and fixed elements never need it). */
function ensureVisible(el: Element, reduced: boolean) {
  const r = el.getBoundingClientRect()
  const visible = r.top >= HEADER_CLEARANCE && r.bottom <= window.innerHeight - 8
  if (visible) return
  el.scrollIntoView({ block: r.height > window.innerHeight * 0.6 ? 'start' : 'center', behavior: reduced ? 'auto' : 'smooth' })
}

/**
 * Follows a tour target frame by frame: waits for it to appear (pages and 3D
 * labs load lazily), scrolls it into view once, then reports its box as the
 * page scrolls, resizes or animates. Gives up after `timeoutMs` so the card
 * can fall back to the centre instead of waiting forever.
 *
 * `key` identifies the step; changing it resets tracking.
 */
export function useTargetBox(selectors: readonly string[], key: string, { enabled = true, reduced = false, timeoutMs = 10_000 } = {}) {
  const [tracked, setTracked] = useState<Tracked | null>(null)
  const selectorKey = selectors.join('|')

  useEffect(() => {
    if (!enabled || selectors.length === 0) return
    let raf = 0
    let el: Element | null = null
    let scrolled = false
    const started = performance.now()
    const tick = () => {
      if (!el || !el.isConnected) el = findTarget(selectors)
      if (el) {
        if (!scrolled) {
          scrolled = true
          ensureVisible(el, reduced)
        }
        const r = el.getBoundingClientRect()
        const box: Box = { top: r.top, left: r.left, width: r.width, height: r.height }
        setTracked((prev) => (prev?.key === key && prev.status === 'found' && prev.box && boxesEqual(prev.box, box) ? prev : { key, status: 'found', box }))
      } else if (performance.now() - started > timeoutMs) {
        setTracked((prev) => (prev?.key === key && prev.status === 'missing' ? prev : { key, status: 'missing', box: null }))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // `selectors` is represented by selectorKey so a fresh array each render does not restart tracking.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, selectorKey, enabled, reduced, timeoutMs])

  if (!enabled || selectors.length === 0) return { status: 'none' as TargetStatus, box: null }
  return tracked?.key === key ? { status: tracked.status, box: tracked.box } : { status: 'waiting' as TargetStatus, box: null }
}
