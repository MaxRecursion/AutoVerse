import type { ReactNode } from 'react'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'
import { cn } from '@/lib/utils'
import { Reveal } from './Reveal'

interface HomeSectionProps {
  /** Used for the section anchor and its heading id. */
  id: string
  eyebrow: string
  title: string
  description?: ReactNode
  /** Optional "see all" link on the right of the heading. */
  action?: { to: string; label: string }
  children: ReactNode
  className?: string
}

/** A homepage band: engineering-style heading row over its content, revealed once on scroll. */
export function HomeSection({ id, eyebrow, title, description, action, children, className }: HomeSectionProps) {
  const headingId = `${id}-heading`
  return (
    <section id={id} aria-labelledby={headingId} className={cn('mx-auto w-full max-w-[1400px] scroll-mt-20 px-4 sm:px-6', className)}>
      <Reveal>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-white/[0.06] pb-4">
          <div className="max-w-2xl">
            <p className="eyebrow flex items-center gap-2">
              <span aria-hidden className="h-px w-5 bg-cyan" />
              {eyebrow}
            </p>
            <h2 id={headingId} className="mt-2 text-2xl font-semibold text-paper sm:text-3xl">
              {title}
            </h2>
            {description && <p className="mt-2 leading-relaxed text-steel-300">{description}</p>}
          </div>
          {action && (
            <Link to={action.to} className="inline-flex min-h-10 items-center gap-1.5 rounded-md text-sm text-steel-300 transition-colors hover:text-cyan">
              {action.label}
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          )}
        </div>
        {children}
      </Reveal>
    </section>
  )
}
