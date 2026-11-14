import { useEffect, useRef } from 'react'
import type { EngineFrame, FrameBus } from './animation'

interface LiveTextProps {
  bus: FrameBus
  /** Shown while the engine is stopped (and in the prerendered page). */
  fallback: string
  /** Text for a running frame. Keep it stable (useCallback) to avoid resubscribing. */
  format: (frame: EngineFrame) => string
  /** Minimum time between updates (ms), so numbers stay readable. */
  interval?: number
}

/**
 * A value that follows the running engine without re-rendering React: it
 * rewrites its own text node from the frame loop a few times a second, and
 * goes back to the React-rendered fallback when the engine stops.
 */
export function LiveText({ bus, fallback, format, interval = 150 }: LiveTextProps) {
  const span = useRef<HTMLSpanElement>(null)
  const fallbackText = useRef(fallback)
  useEffect(() => {
    fallbackText.current = fallback
  }, [fallback])

  useEffect(() => {
    let last = -Infinity
    return bus.subscribe((frame) => {
      const node = span.current?.firstChild
      if (!node) return
      if (!frame.running) {
        if (node.nodeValue !== fallbackText.current) node.nodeValue = fallbackText.current
        return
      }
      if (frame.now - last < interval) return
      last = frame.now
      node.nodeValue = format(frame)
    })
  }, [bus, format, interval])

  return <span ref={span}>{fallback}</span>
}
