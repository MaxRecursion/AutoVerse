import { Box, Clock } from 'lucide-react'
import type { ContentStatus, Difficulty } from '@/lib/schemas'
import { cn } from '@/lib/utils'
import { DIFFICULTY_LABEL, DIFFICULTY_RANK, STATUS_LABEL } from './labels'

/** Three-bar difficulty meter with a text label (the bars are decorative). */
export function DifficultyMeter({ difficulty, className }: { difficulty: Difficulty; className?: string }) {
  const rank = DIFFICULTY_RANK[difficulty]
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs text-steel-300', className)}>
      <span className="flex items-end gap-[2px]" aria-hidden>
        {[1, 2, 3].map((i) => (
          <span key={i} className={cn('w-[3px] rounded-sm', i <= rank ? 'bg-cyan' : 'bg-graphite-600')} style={{ height: 4 + i * 3 }} />
        ))}
      </span>
      {DIFFICULTY_LABEL[difficulty]}
    </span>
  )
}

export function Duration({ minutes, className }: { minutes: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs text-steel-300', className)}>
      <Clock aria-hidden className="size-3.5 text-steel-400" />
      {minutes} min<span className="sr-only">ute read</span>
    </span>
  )
}

/** Lesson completeness, honest about drafts and outlines. Hidden for complete lessons unless `showComplete`. */
export function StatusBadge({ status, showComplete = false, className }: { status: ContentStatus; showComplete?: boolean; className?: string }) {
  if (status === 'complete' && !showComplete) return null
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider',
        status === 'complete' && 'border-ok/30 text-ok',
        status === 'draft' && 'border-amber/40 text-amber',
        status === 'outline' && 'border-steel-500/60 text-steel-300',
        className,
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  )
}

export function InteractiveBadge({ className, label = 'Interactive 3D' }: { className?: string; label?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border border-cyan/30 bg-cyan/[0.06] px-2 py-0.5 text-[11px] text-cyan', className)}>
      <Box aria-hidden className="size-3" />
      {label}
    </span>
  )
}
