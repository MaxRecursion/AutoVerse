import { useCallback } from 'react'
import { useLocation } from 'react-router'
import { useTour } from './tourStore'

/** Starts the tour from wherever the learner is, remembering the spot so closing the tour returns them to it. */
export function useStartTour() {
  const { pathname, search } = useLocation()
  const start = useTour((s) => s.start)
  return useCallback(() => start(`${pathname}${search}`), [start, pathname, search])
}
