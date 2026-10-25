import { useEffect, useLayoutEffect, useRef } from 'react'
import { useLabStoreApi } from '@/components/three/LabContext'
import { engineStateAt, type EngineState } from './kinematics'

/**
 * Calls `onFrame` with the engine state whenever the lab's progress changes
 * (and once on mount, before paint). Use it to write DOM readouts
 * imperatively, so per-frame numbers never cause React re-renders — the same
 * pattern the 3D scene uses with useFrame + store.getState().
 *
 * Elements written this way must not also have React-managed children.
 */
export function useEngineFrame(onFrame: (state: EngineState) => void): void {
  const store = useLabStoreApi()
  const callback = useRef(onFrame)
  useLayoutEffect(() => {
    callback.current = onFrame
  })
  useLayoutEffect(() => {
    callback.current(engineStateAt(store.getState().progress))
  }, [store])
  useEffect(
    () =>
      store.subscribe((s, prev) => {
        if (s.progress !== prev.progress) callback.current(engineStateAt(s.progress))
      }),
    [store],
  )
}
