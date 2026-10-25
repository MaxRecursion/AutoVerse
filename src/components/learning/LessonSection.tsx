import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface LessonSectionProps {
  /** Fragment id (also used for the "On this page" menu). */
  id: string
  /** Section number shown in the eyebrow ("03"). */
  index?: number
  /** Lesson stage this section belongs to, shown beside the number ("03 · See it work"). */
  stage?: string
  title: string
  description?: ReactNode
  children: ReactNode
  /** Text sections are kept to a readable measure; wide sections (scene, diagram) use the full column. */
  wide?: boolean
  className?: string
}

/** One numbered lesson section with an anchored heading (scroll margin clears the sticky bars). */
export function LessonSection({ id, index, stage, title, description, children, wide = false, className }: LessonSectionProps) {
  const headingId = `${id}-heading`
  return (
    <section id={id} aria-labelledby={headingId} data-anchor className={cn('scroll-mt-28', !wide && 'max-w-3xl', className)}>
      <header className="mb-4">
        {index !== undefined && (
          <p className="eyebrow" aria-hidden>
            {String(index).padStart(2, '0')}
            {stage ? ` · ${stage}` : ''}
          </p>
        )}
        <h2 id={headingId} className="mt-1 text-xl font-semibold text-paper sm:text-2xl">
          {title}
        </h2>
        {description && <p className="mt-1.5 text-sm leading-relaxed text-steel-400">{description}</p>}
      </header>
      {children}
    </section>
  )
}
