/*
 * Adapted from Watermelon UI "run-widget" and "stepper" (MIT), see
 * THIRD_PARTY_NOTICES.md: numbers that count to their new value instead of
 * jumping. Here it is a plain count-up, with the final value always in the
 * markup (prerendered pages, reduced motion). The text is one plain node, so
 * the number reads and matches like any other text.
 */
import { useEffect, useRef, useState } from 'react'
import { animate } from 'motion/react'
import { usePrefersReducedMotion } from '@/hooks/useMediaQuery'
import { cn } from '@/lib/utils'

interface AnimatedNumberProps {
  value: number
  /** Count up from this when first shown (default: no count on first show, only on change). */
  from?: number
  /** Seconds. */
  duration?: number
  className?: string
}

export function AnimatedNumber({ value, from, duration = 0.7, className }: AnimatedNumberProps) {
  const reduced = usePrefersReducedMotion()
  // The server and the first paint show the final value; a count-up on first show starts only in the browser.
  const [shown, setShown] = useState(() => (from !== undefined && !reduced && typeof window !== 'undefined' ? from : value))
  const last = useRef(shown)

  useEffect(() => {
    if (reduced || last.current === value) {
      last.current = value
      setShown(value)
      return
    }
    const controls = animate(last.current, value, {
      duration,
      ease: 'easeOut',
      onUpdate: (v) => {
        last.current = v
        setShown(Math.round(v))
      },
      onComplete: () => {
        last.current = value
        setShown(value)
      },
    })
    return () => controls.stop()
  }, [value, reduced, duration])

  return <span className={cn('tabular-nums', className)}>{shown}</span>
}
