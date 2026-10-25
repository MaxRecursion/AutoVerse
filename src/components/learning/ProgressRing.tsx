import { cn } from '@/lib/utils'

/** Small circular completion indicator. Decorative unless `label` is given. */
export function ProgressRing({
  percent,
  size = 28,
  stroke = 3,
  label,
  className,
  trackClassName = 'stroke-white/10',
  barClassName = 'stroke-cyan',
}: {
  percent: number
  size?: number
  stroke?: number
  label?: string
  className?: string
  trackClassName?: string
  barClassName?: string
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(100, percent))
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn('shrink-0 -rotate-90', className)}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className={trackClassName} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - clamped / 100)}
        className={cn('transition-[stroke-dashoffset] duration-500', barClassName)}
      />
    </svg>
  )
}
