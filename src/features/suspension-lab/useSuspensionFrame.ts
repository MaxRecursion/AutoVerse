import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useLab, useLabStoreApi } from '@/components/three/LabContext'
import type { LabState } from '@/lib/simulation/labStore'
import { responseFor, settingsFromParams } from './quarterCar'
import { createFrameCache, type SuspensionFrame } from './suspensionModel'

/**
 * One shared frame cache: the scene, the readouts, the chart cursor and the
 * live table all ask for the same (progress, params) in the same tick.
 */
export const frameFor: (progress: number, params: LabState['params']) => SuspensionFrame = createFrameCache()

/** The frame for a store state. */
export const frameOf = (s: Pick<LabState, 'progress' | 'params'>) => frameFor(s.progress, s.params)

/**
 * Calls `onFrame` with the suspension frame whenever the lab's progress or
 * parameters change (and once on mount, before paint). Use it to write DOM
 * readouts imperatively, so per-frame numbers never cause React re-renders —
 * the same pattern the 3D scene uses with useFrame + store.getState().
 *
 * Elements written this way must not also have React-managed children.
 */
export function useSuspensionFrame(onFrame: (frame: SuspensionFrame) => void): void {
  const store = useLabStoreApi()
  const callback = useRef(onFrame)
  useLayoutEffect(() => {
    callback.current = onFrame
  })
  useLayoutEffect(() => {
    callback.current(frameOf(store.getState()))
  }, [store])
  useEffect(
    () =>
      store.subscribe((s, prev) => {
        if (s.progress !== prev.progress || s.params !== prev.params) callback.current(frameOf(s))
      }),
    [store],
  )
}

/**
 * The (memoised) whole-lap response for the current parameters — re-renders
 * only when a parameter changes, never per frame.
 */
export function useSuspensionResponse() {
  const settings = useSuspensionSettings()
  return useMemo(() => responseFor(settings), [settings])
}

/** Lab settings (road, damper, spring) — re-renders only when a parameter changes. */
export function useSuspensionSettings() {
  const params = useLab((s) => s.params)
  return useMemo(() => settingsFromParams(params), [params])
}
