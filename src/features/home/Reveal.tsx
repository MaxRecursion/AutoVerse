import type { ReactNode } from 'react'
import { LazyMotion, domAnimation, m } from 'motion/react'
import { usePrefersReducedMotion } from '@/hooks/useMediaQuery'

const EASE = [0.22, 1, 0.36, 1] as const

/** Loads motion's DOM animation features once for the page (smaller than the full `motion` component). */
export function HomeMotion({ children }: { children: ReactNode }) {
  return <LazyMotion features={domAnimation}>{children}</LazyMotion>
}

interface RevealProps {
  children: ReactNode
  className?: string
  /** Seconds. */
  delay?: number
  /** `view` (default): when scrolled into view, once. `mount`: on first render. */
  trigger?: 'view' | 'mount'
}

/**
 * A short fade-and-rise as content arrives. Renders a plain <div> (content
 * immediately visible) under reduced motion or where IntersectionObserver is
 * missing, so nothing can stay hidden.
 */
export function Reveal({ children, className, delay = 0, trigger = 'view' }: RevealProps) {
  const reduced = usePrefersReducedMotion()
  const canObserve = typeof IntersectionObserver !== 'undefined'
  if (reduced || (trigger === 'view' && !canObserve)) return <div className={className}>{children}</div>

  const transition = { duration: 0.6, delay, ease: EASE }
  const hidden = { opacity: 0, y: 16 }
  const shown = { opacity: 1, y: 0 }
  return trigger === 'mount' ? (
    <m.div className={className} initial={hidden} animate={shown} transition={transition}>
      {children}
    </m.div>
  ) : (
    <m.div className={className} initial={hidden} whileInView={shown} viewport={{ once: true, margin: '0px 0px -10% 0px' }} transition={transition}>
      {children}
    </m.div>
  )
}
