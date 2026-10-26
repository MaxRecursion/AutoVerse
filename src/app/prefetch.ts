import { matchRoutes, type RouteObject } from 'react-router'

/**
 * Loads a page's code before the click. Every page is a code-split route
 * module the router fetches only on navigation (Link's `prefetch` exists in
 * framework mode only), and Speculation Rules would prerender documents that
 * client-side navigation never uses. So on intent to follow a same-site link
 * (hover for 200 ms, Chrome's "moderate" eagerness; focus; touch) the matched
 * routes' modules are imported, and the click then renders without waiting.
 * Only code is fetched: nothing runs and nothing is recorded.
 */

/** Hover this long before it counts as intent. */
export const HOVER_MS = 200

/** Route loaders already started (a lazy route is one module, whatever its params). */
const warmed = new WeakSet<() => unknown>()

/** Imports the lazy modules of the routes `pathname` matches (each once). */
export function prefetchRoute(pathname: string, routes: RouteObject[], basename?: string): void {
  for (const { route } of matchRoutes(routes, pathname, basename) ?? []) {
    const load = route.lazy
    if (typeof load !== 'function' || warmed.has(load)) continue
    warmed.add(load)
    // A failed fetch is retried by the router on the real navigation.
    void Promise.resolve(load()).catch(() => warmed.delete(load))
  }
}

function sameSitePath(target: EventTarget | null): string | null {
  const link = target instanceof Element ? target.closest('a[href]') : null
  if (!(link instanceof HTMLAnchorElement) || link.hasAttribute('download') || (link.target && link.target !== '_self')) return null
  return link.origin === window.location.origin ? link.pathname : null
}

/** Listens for link intent anywhere in the document. Returns a cleanup function. */
export function installRoutePrefetch(routes: RouteObject[], basename?: string): () => void {
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData
  if (saveData) return () => {}
  let timer: ReturnType<typeof setTimeout> | undefined
  const now = (e: Event) => {
    const path = sameSitePath(e.target)
    if (path) prefetchRoute(path, routes, basename)
  }
  const hover = (e: Event) => {
    const path = sameSitePath(e.target)
    if (!path) return
    clearTimeout(timer)
    timer = setTimeout(() => prefetchRoute(path, routes, basename), HOVER_MS)
  }
  const leave = (e: Event) => {
    if (sameSitePath(e.target)) clearTimeout(timer)
  }
  const passive = { passive: true }
  document.addEventListener('pointerover', hover, passive)
  document.addEventListener('pointerout', leave, passive)
  document.addEventListener('focusin', now)
  document.addEventListener('touchstart', now, passive)
  return () => {
    clearTimeout(timer)
    document.removeEventListener('pointerover', hover)
    document.removeEventListener('pointerout', leave)
    document.removeEventListener('focusin', now)
    document.removeEventListener('touchstart', now)
  }
}
