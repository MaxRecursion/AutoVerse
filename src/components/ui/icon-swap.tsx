/*
 * Adapted from Watermelon UI "save-toggle" (MIT), see THIRD_PARTY_NOTICES.md:
 * a button's icon changes with a small spring when its state does, instead
 * of switching in place. Not animated on first show, only on a change.
 */
import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'

/** Fixed 1rem box; `id` names the state, so the icon swaps when it changes. */
export function IconSwap({ id, children }: { id: string; children: ReactNode }) {
  return (
    <span aria-hidden className="relative inline-grid size-4 shrink-0 place-items-center">
      <AnimatePresence initial={false}>
        <motion.span
          key={id}
          className="absolute inset-0 grid place-items-center"
          initial={{ scale: 0.3, opacity: 0, rotate: -25 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          exit={{ scale: 0.3, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 520, damping: 26 }}
        >
          {children}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}
