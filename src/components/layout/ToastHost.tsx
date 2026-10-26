import { useEffect, useRef } from 'react'
import { CircleCheck, Info, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Link } from 'react-router'
import { usePrefersReducedMotion } from '@/hooks/useMediaQuery'
import { cn } from '@/lib/utils'
import { useToasts, type Toast } from '@/stores/toasts'

/** Polite live region for progress feedback. Timers pause while a toast is hovered or focused. */
export function ToastHost() {
  const toasts = useToasts((s) => s.toasts)
  const reduced = usePrefersReducedMotion()
  return (
    <div
      role="status"
      aria-live="polite"
      aria-relevant="additions"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-2 sm:items-end sm:p-5"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={reduced ? false : { opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
            transition={{ duration: reduced ? 0 : 0.2 }}
            className="pointer-events-auto w-full max-w-sm"
          >
            <ToastCard toast={t} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

function ToastCard({ toast }: { toast: Toast }) {
  const dismiss = useToasts((s) => s.dismiss)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const arm = () => {
    clearTimeout(timer.current)
    if (toast.duration > 0) timer.current = setTimeout(() => dismiss(toast.id), toast.duration)
  }
  const hold = () => clearTimeout(timer.current)
  useEffect(() => {
    arm()
    return hold
    // arm/hold only close over the toast's own id and duration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast.id, toast.duration])

  const Icon = toast.tone === 'success' ? CircleCheck : Info
  return (
    <div
      onMouseEnter={hold}
      onMouseLeave={arm}
      onFocus={hold}
      onBlur={arm}
      className={cn(
        'panel flex items-start gap-3 border-l-2 p-3 pr-2 shadow-xl sm:p-3.5 sm:pr-2.5',
        toast.tone === 'success' ? 'border-l-ok' : 'border-l-cyan',
      )}
    >
      <Icon aria-hidden className={cn('mt-0.5 size-4 shrink-0', toast.tone === 'success' ? 'text-ok' : 'text-cyan')} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-paper">{toast.title}</p>
        {toast.description && <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-steel-300">{toast.description}</p>}
        {toast.action && (
          <Link
            to={toast.action.to}
            onClick={() => dismiss(toast.id)}
            className="mt-1.5 inline-flex min-h-8 items-center text-sm font-medium text-cyan underline-offset-4 hover:underline"
          >
            {toast.action.label} →
          </Link>
        )}
      </div>
      <button
        type="button"
        onClick={() => dismiss(toast.id)}
        aria-label="Dismiss notification"
        className="grid size-8 shrink-0 place-items-center rounded-md text-steel-400 hover:bg-white/[0.06] hover:text-paper"
      >
        <X aria-hidden className="size-4" />
      </button>
    </div>
  )
}
