import type { StageId } from '@/features/progress/stages'

/** Destination colours stay consistent across menus, lesson stages and themes. */
export type NavigationAccent = 'sound' | 'explore' | 'learn' | 'labs' | 'pioneers' | 'progress' | 'map'

export const stageAccents: Record<StageId, NavigationAccent> = {
  overview: 'learn',
  see: 'labs',
  deeper: 'map',
  check: 'explore',
  story: 'pioneers',
}

/** A lesson belongs to Learn even though its URL lives under /topics/. */
export function isNavigationCurrent(to: string, pathname: string): boolean {
  return pathname === to || pathname.startsWith(`${to}/`) || (to === '/learn' && pathname.startsWith('/topics/'))
}
