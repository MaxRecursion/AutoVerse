/*
 * Adapted from Watermelon UI "continuous-tabs" (MIT), see THIRD_PARTY_NOTICES.md.
 * The sliding-thumb idea is theirs; the markup is Radix's toggle group, so
 * roles, arrow keys and focus are the same as the group it replaces.
 */
import { useId, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui'
import { cn } from '@/lib/utils'

export interface SegmentedOption<T extends string> {
  value: T
  label: ReactNode
  /** Spoken name when it differs from the visible label. */
  ariaLabel?: string
}

const TONE = {
  cyan: { thumb: 'bg-cyan/20 ring-1 ring-inset ring-cyan/45', text: 'data-[state=on]:text-cyan' },
  amber: { thumb: 'bg-amber/20 ring-1 ring-inset ring-amber/45', text: 'data-[state=on]:text-amber' },
} as const

interface SegmentedProps<T extends string> {
  value: T
  onValueChange: (value: T) => void
  options: readonly SegmentedOption<T>[]
  'aria-label': string
  size?: 'sm' | 'md'
  tone?: keyof typeof TONE
  className?: string
}

/**
 * One choice from a few, in an inset track, with a thumb that slides to the
 * chosen item. The thumb is part of the markup (so it is there in the
 * prerendered page); `MotionConfig reducedMotion="user"` in the app shell turns
 * the slide into a jump for readers who ask for less motion.
 */
export function Segmented<T extends string>({ value, onValueChange, options, size = 'md', tone = 'cyan', className, ...rest }: SegmentedProps<T>) {
  // Two segmented controls on one page (lesson bar and quiz) must not share a thumb.
  const thumbId = useId()
  return (
    <ToggleGroupPrimitive.Root
      type="single"
      value={value}
      // Pressing the chosen item again would clear a single-choice group; a segmented control always has a choice.
      onValueChange={(v) => v && onValueChange(v as T)}
      aria-label={rest['aria-label']}
      className={cn('track relative inline-flex w-fit items-center gap-0.5 rounded-lg border border-white/[0.07] bg-graphite-950/70 p-0.5', className)}
    >
      {options.map((o) => {
        const on = o.value === value
        return (
          <ToggleGroupPrimitive.Item
            key={o.value}
            value={o.value}
            aria-label={o.ariaLabel}
            className={cn(
              'relative hit-area inline-flex items-center justify-center rounded-md px-3 text-xs font-medium whitespace-nowrap text-steel-300 outline-none transition-colors hover:text-paper focus-visible:ring-2 focus-visible:ring-cyan',
              size === 'sm' ? 'h-8' : 'h-9',
              TONE[tone].text,
            )}
          >
            {on && (
              <motion.span
                aria-hidden
                layoutId={thumbId}
                transition={{ type: 'spring', stiffness: 420, damping: 34, mass: 0.8 }}
                className={cn('tactile absolute inset-0 rounded-md', TONE[tone].thumb)}
              />
            )}
            <span className="relative">{o.label}</span>
          </ToggleGroupPrimitive.Item>
        )
      })}
    </ToggleGroupPrimitive.Root>
  )
}
