import { lazy, Suspense, type ComponentType } from 'react'
import { LabStoreContext } from '@/components/three/LabContext'
import type { LabStore } from '@/lib/simulation/labStore'
import { cn } from '@/lib/utils'
import { labs } from './registry'
import type { LabViewProps } from './types'
import { useLabInstance } from './useLabInstance'

// Lazy views are created once at module level (never during render).
const views: Record<string, ComponentType<LabViewProps>> = Object.fromEntries(labs.map((l) => [l.id, lazy(l.load)]))

/** Mounts a lab view with its store; lazy-loads the 3D code on demand. */
export function LabHost({ labId, store, variant = 'full' }: { labId: string; store?: LabStore | null; variant?: LabViewProps['variant'] }) {
  const own = useLabInstance(labId)
  const active = store ?? own
  const View = views[labId]
  if (!View || !active) return <p className="text-steel-400">This lab is not available.</p>
  return (
    <LabStoreContext.Provider value={active}>
      <Suspense fallback={<LabSkeleton variant={variant} />}>
        <View variant={variant} />
      </Suspense>
    </LabStoreContext.Provider>
  )
}

/**
 * Placeholder while a lab's code (three.js and the scene) downloads. It has
 * the workbench's shape — scene box (same heights per variant) plus side
 * panel — and a loading status inside the scene, so the page does not jump
 * and the scene area is never an empty box.
 */
export function LabSkeleton({ variant = 'full' }: { variant?: LabViewProps['variant'] }) {
  return (
    <div className={cn('grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]', variant === 'full' && 'lg:h-[calc(100dvh-7.5rem)]')}>
      <div
        className={cn(
          'relative grid place-items-center overflow-hidden rounded-xl border border-white/[0.07] bg-graphite-950 bg-blueprint',
          variant === 'full' ? 'h-[58dvh] min-h-[340px] lg:h-full' : 'h-[52dvh] min-h-[320px] lg:h-[560px]',
        )}
        role="status"
        data-testid="lab-loading"
      >
        <div className="panel flex w-56 flex-col gap-2 px-4 py-3">
          <span className="flex items-center gap-2 text-xs text-steel-300">
            <span aria-hidden className="size-2 shrink-0 rounded-full bg-cyan motion-safe:animate-pulse" />
            Loading laboratory…
          </span>
          <div className="h-1 overflow-hidden rounded bg-graphite-700" aria-hidden>
            <div className="h-full w-full bg-cyan/60 motion-safe:animate-pulse" />
          </div>
        </div>
      </div>
      <div aria-hidden className="panel hidden min-h-40 lg:block" />
    </div>
  )
}
