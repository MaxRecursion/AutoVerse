import { useRef } from 'react'
import { useDwell, type DwellOptions } from '@/hooks/useDwell'

/** Invisible overlay that fires `onSeen` after its (relatively positioned) parent has been in view long enough. */
export function DwellSentinel({ onSeen, enabled = true, threshold, ms }: { onSeen: () => void; enabled?: boolean } & Pick<DwellOptions, 'threshold' | 'ms'>) {
  const ref = useRef<HTMLSpanElement>(null)
  useDwell(ref, onSeen, { enabled, threshold, ms })
  return <span ref={ref} aria-hidden className="pointer-events-none absolute inset-0" />
}
