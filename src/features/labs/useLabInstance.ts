import { useState } from 'react'
import { usePrefersReducedMotion } from '@/hooks/useMediaQuery'
import { createLabStore, type LabStore } from '@/lib/simulation/labStore'
import { getLab } from './registry'

/** Create (once) the store for a lab. Exposed so lesson pages can drive the lab from their steps. */
export function useLabInstance(labId: string): LabStore | null {
  const reduced = usePrefersReducedMotion()
  const [store] = useState(() => {
    const def = getLab(labId)
    return def ? createLabStore(def.config, { autoplay: !reduced && def.config.timeline }) : null
  })
  return store
}
