import { lazy, Suspense, type ComponentType } from 'react'
import { LabStoreContext } from '@/components/three/LabContext'
import { workbenchAside, workbenchGrid, workbenchScene } from '@/components/three/workbenchLayout'
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
 * Placeholder while a lab's code (three.js and the scene) downloads. It is
 * built from the workbench's own layout classes, so the page does not jump
 * when the lab replaces it. The boxes take their space at once; the gray
 * blocks and the status only fade in if loading takes longer than ~300 ms.
 */
export function LabSkeleton({ variant = 'full' }: { variant?: LabViewProps['variant'] }) {
  return (
    <div className={workbenchGrid(variant)}>
      <div className={cn(workbenchScene(variant), 'grid place-items-center')} role="status" data-testid="lab-loading">
        <div aria-hidden className="skeleton-delay absolute inset-3 flex flex-col justify-between">
          <div className="flex items-start justify-between gap-2">
            <Bone className="h-24 w-32" />
            <Bone className="h-11 w-40" />
          </div>
          <Bone className="h-24 w-full" />
        </div>
        <div className="skeleton-delay panel relative flex w-56 flex-col gap-2 px-4 py-3">
          <span className="flex items-center gap-2 text-xs text-steel-300">
            <span aria-hidden className="size-2 shrink-0 rounded-full bg-cyan motion-safe:animate-pulse" />
            Loading laboratory…
          </span>
          <div className="h-1 overflow-hidden rounded bg-graphite-700" aria-hidden>
            <div className="h-full w-full bg-cyan/60 motion-safe:animate-pulse" />
          </div>
        </div>
      </div>
      <div aria-hidden className={cn(workbenchAside, 'min-h-64 lg:min-h-0')}>
        <div className="skeleton-delay flex flex-col gap-3 p-3">
          <Bone className="h-11" />
          <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] pb-2">
            <Bone className="h-9 w-48" />
            <Bone className="h-9 w-24" />
          </div>
          <Bone className="h-4 w-3/4" />
          <Bone className="h-4" />
          <Bone className="h-4 w-5/6" />
          <Bone className="h-4 w-2/3" />
        </div>
      </div>
    </div>
  )
}

/** One gray block of the skeleton. */
const Bone = ({ className }: { className?: string }) => <div className={cn('rounded-md bg-white/[0.05] motion-safe:animate-pulse', className)} />
