import { useEffect, useLayoutEffect, useRef } from 'react'
import { useLabStoreApi } from '@/components/three/LabContext'
import type { LabState } from '@/lib/simulation/labStore'
import { planFor, stateFor, type BrakingState, type StopPlan } from './braking'

export type BrakingFrameCallback = (state: BrakingState, plan: StopPlan, lab: LabState) => void

/**
 * Calls `onFrame` with the braking state whenever the lab's progress or
 * params change (and once on mount, before paint). Use it to write DOM
 * readouts imperatively, so per-frame numbers never cause React re-renders —
 * the same pattern the 3D scene uses with useFrame + store.getState().
 *
 * Elements written this way must not also have React-managed children.
 */
export function useBrakingFrame(onFrame: BrakingFrameCallback): void {
  const store = useLabStoreApi()
  const callback = useRef(onFrame)
  useLayoutEffect(() => {
    callback.current = onFrame
  })
  useLayoutEffect(() => {
    const s = store.getState()
    callback.current(stateFor(s.params, s.progress), planFor(s.params), s)
  }, [store])
  useEffect(
    () =>
      store.subscribe((s, prev) => {
        if (s.progress !== prev.progress || s.params !== prev.params) callback.current(stateFor(s.params, s.progress), planFor(s.params), s)
      }),
    [store],
  )
}
