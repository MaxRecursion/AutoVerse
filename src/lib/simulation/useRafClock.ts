import { useEffect } from 'react'
import type { LabStore } from './labStore'

/** Largest frame step fed to the store, so a backgrounded tab does not jump a whole cycle. */
const MAX_DT = 0.1

/**
 * Drives a lab store's time from `requestAnimationFrame`.
 *
 * Inside WebGL, `SceneCanvas` advances the store from R3F's render loop. When a
 * scene's non-3D fallback is shown instead (no WebGL, `?nowebgl`, or a crashed
 * scene) there is no render loop, so this hook keeps play / pause / speed
 * working. The loop only runs while the store is playing.
 */
export function useRafClock(store: LabStore | null, enabled = true): void {
  useEffect(() => {
    if (!store || !enabled || typeof requestAnimationFrame !== 'function') return
    let raf = 0
    let last = 0

    const tick = (now: number) => {
      const dt = last ? Math.min((now - last) / 1000, MAX_DT) : 0
      last = now
      const s = store.getState()
      if (!s.playing) {
        raf = 0
        return
      }
      if (dt > 0) s.advance(dt)
      raf = requestAnimationFrame(tick)
    }
    const start = () => {
      if (raf) return
      last = 0
      raf = requestAnimationFrame(tick)
    }

    if (store.getState().playing) start()
    const unsubscribe = store.subscribe((s, prev) => {
      if (s.playing && !prev.playing) start()
    })
    return () => {
      unsubscribe()
      if (raf) cancelAnimationFrame(raf)
    }
  }, [store, enabled])
}
