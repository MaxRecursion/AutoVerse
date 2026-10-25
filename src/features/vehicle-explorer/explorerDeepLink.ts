/**
 * `/explore?system=…` / `?component=…` deep links (pure; no React, no DOM).
 * The page keeps the URL and the explorer store in step through these, so a
 * shared link always reopens the same system or part.
 */
import { resolveExplorerTarget, type ExplorerTarget } from './explorerSystems'

export const SYSTEM_PARAM = 'system'
export const COMPONENT_PARAM = 'component'

export const sameTarget = (a: ExplorerTarget, b: ExplorerTarget): boolean => a.systemId === b.systemId && a.componentId === b.componentId

/** Read the explorer target from a query string (aliases and lab component ids resolve; unknown values mean the whole car). */
export function targetFromSearch(search: URLSearchParams, contentSystemOf?: (componentId: string) => string | undefined): ExplorerTarget {
  return resolveExplorerTarget({ system: search.get(SYSTEM_PARAM), component: search.get(COMPONENT_PARAM) }, contentSystemOf)
}

/**
 * The query string that describes `target`, keeping every unrelated
 * parameter (e.g. `?nowebgl`). A component link omits the system: the
 * component already implies it.
 */
export function searchForTarget(current: URLSearchParams, target: ExplorerTarget): URLSearchParams {
  const next = new URLSearchParams(current)
  next.delete(SYSTEM_PARAM)
  next.delete(COMPONENT_PARAM)
  if (target.componentId) next.set(COMPONENT_PARAM, target.componentId)
  else if (target.systemId) next.set(SYSTEM_PARAM, target.systemId)
  return next
}
