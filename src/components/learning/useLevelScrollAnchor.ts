import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import type { ExplanationLevel } from '@/lib/schemas'
import { usePreferences } from '@/stores/preferences'
import { STICKY_OFFSET } from './labSync'

interface Anchor {
  el: Element
  top: number
}

/**
 * Pick the element the reader is looking at: the innermost `[data-anchor]`
 * straddling the line just below the sticky bars, else the next one below it.
 */
export function findReadingAnchor(root: ParentNode, line = STICKY_OFFSET): Anchor | null {
  let containing: Anchor | null = null
  let next: Anchor | null = null
  for (const el of root.querySelectorAll('[data-anchor]')) {
    const { top, bottom } = el.getBoundingClientRect()
    if (bottom <= line) continue
    if (top <= line) {
      if (!containing || top >= containing.top) containing = { el, top }
    } else if (!next || top < next.top) {
      next = { el, top }
    }
  }
  return containing ?? next
}

/**
 * Switching Beginner ↔ Technical swaps text of different lengths above and
 * below the reader. Native CSS scroll anchoring is unreliable (absent on iOS
 * Safari), so we measure the reading anchor just before the level changes and
 * restore its on-screen position right after React commits the new text.
 */
export function useLevelScrollAnchor(rootRef: RefObject<HTMLElement | null>, level: ExplanationLevel): void {
  // The reading anchor plus its enclosing anchors, innermost first: if the new
  // level renders fewer paragraphs the innermost may disappear, so fall back outwards.
  const pending = useRef<Anchor[]>([])

  useEffect(
    () =>
      // Zustand notifies synchronously inside setLevel(), before React re-renders.
      usePreferences.subscribe((state, prev) => {
        if (state.level === prev.level || !rootRef.current) return
        const anchor = findReadingAnchor(rootRef.current)
        const chain: Anchor[] = anchor ? [anchor] : []
        let outer = anchor?.el.parentElement?.closest('[data-anchor]') ?? null
        while (outer && rootRef.current.contains(outer)) {
          chain.push({ el: outer, top: outer.getBoundingClientRect().top })
          outer = outer.parentElement?.closest('[data-anchor]') ?? null
        }
        pending.current = chain
      }),
    [rootRef],
  )

  useLayoutEffect(() => {
    const anchor = pending.current.find((a) => a.el.isConnected)
    pending.current = []
    if (!anchor) return
    const delta = anchor.el.getBoundingClientRect().top - anchor.top
    if (Math.abs(delta) > 1) window.scrollBy(0, delta)
  }, [level])
}
