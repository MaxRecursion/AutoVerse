/*
 * Adapted from Watermelon UI "emoji-spree-choice-chips" (MIT), see
 * THIRD_PARTY_NOTICES.md: a few sparks flying out of the thing you just got
 * right. Decorative only, played once on mount, and not drawn at all for
 * readers who ask for reduced motion.
 */
import { motion } from 'motion/react'
import { usePrefersReducedMotion } from '@/hooks/useMediaQuery'
import { cn } from '@/lib/utils'

const SPARKS = 10
const COLOURS = ['bg-cyan', 'bg-amber', 'bg-ok']

/** Place inside a `relative` element; the sparks fly out from its centre. */
export function Burst({ className }: { className?: string }) {
  const reduced = usePrefersReducedMotion()
  if (reduced) return null
  return (
    <span aria-hidden data-testid="burst" className={cn('pointer-events-none absolute inset-0 grid place-items-center', className)}>
      {Array.from({ length: SPARKS }, (_, i) => {
        const angle = (i / SPARKS) * Math.PI * 2 + (i % 2) * 0.2
        const distance = 22 + (i % 3) * 7
        return (
          <motion.span
            key={i}
            className={cn('absolute size-1.5 rounded-full', COLOURS[i % COLOURS.length])}
            initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
            animate={{ x: Math.cos(angle) * distance, y: Math.sin(angle) * distance, scale: 0, opacity: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        )
      })}
    </span>
  )
}
