import { cn } from '@/lib/utils'

export type WorkbenchVariant = 'full' | 'embedded'

/*
 * The workbench's outer grid and scene box. LabWorkbench and the LabSkeleton
 * shown while a lab's code downloads are both built from these, so the page
 * keeps exactly the same shape when the real lab replaces the placeholder.
 * Kept free of other imports so the skeleton does not pull in the workbench.
 */

export const workbenchGrid = (variant: WorkbenchVariant) =>
  cn('grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]', variant === 'full' && 'lg:h-[calc(100dvh-7.5rem)]')

export const workbenchScene = (variant: WorkbenchVariant) =>
  cn(
    'relative overflow-hidden rounded-xl border border-white/[0.07] bg-graphite-950 bg-blueprint',
    variant === 'full' ? 'h-[58dvh] min-h-[340px] lg:h-full' : 'h-[52dvh] min-h-[320px] lg:h-[560px]',
  )

export const workbenchAside = 'panel flex min-h-0 flex-col overflow-hidden'
