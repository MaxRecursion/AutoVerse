import { renderHook } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLabStore, defineLabConfig } from './labStore'
import { useRafClock } from './useRafClock'

/** Manual requestAnimationFrame: frames run only when the test calls `frame(ms)`. */
function installFakeRaf() {
  let queue: { id: number; cb: FrameRequestCallback }[] = []
  let next = 1
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    queue.push({ id: next, cb })
    return next++
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    queue = queue.filter((q) => q.id !== id)
  })
  return {
    frame(now: number) {
      const due = queue
      queue = []
      act(() => due.forEach((q) => q.cb(now)))
    },
    pending: () => queue.length,
    /** Run `count` frames `stepMs` apart, starting after `startMs`. */
    run(startMs: number, count: number, stepMs: number) {
      for (let i = 1; i <= count; i++) this.frame(startMs + i * stepMs)
    },
  }
}

const config = defineLabConfig({ id: 'clock-test', cycleDuration: 4 })

describe('useRafClock', () => {
  let raf: ReturnType<typeof installFakeRaf>
  beforeEach(() => {
    raf = installFakeRaf()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('advances a playing store by real elapsed time', () => {
    const store = createLabStore(config, { autoplay: true })
    renderHook(() => useRafClock(store))
    raf.frame(1000) // first frame only records the timestamp
    raf.run(1000, 20, 50)
    expect(store.getState().progress).toBeCloseTo(1 / 4) // 1 s of a 4 s cycle
  })

  it('caps long frames so a backgrounded tab does not jump the cycle', () => {
    const store = createLabStore(config, { autoplay: true })
    renderHook(() => useRafClock(store))
    raf.frame(0.001)
    raf.frame(5000)
    expect(store.getState().progress).toBeCloseTo(0.1 / 4)
  })

  it('stops the loop while paused and resumes on play', () => {
    const store = createLabStore(config)
    renderHook(() => useRafClock(store))
    expect(raf.pending()).toBe(0)
    act(() => store.getState().play())
    expect(raf.pending()).toBe(1)
    raf.frame(100)
    raf.run(100, 8, 50)
    const p = store.getState().progress
    expect(p).toBeCloseTo(0.4 / 4)
    act(() => store.getState().pause())
    raf.frame(900)
    expect(raf.pending()).toBe(0)
    expect(store.getState().progress).toBe(p)
  })

  it('cancels its frame on unmount and does nothing when disabled', () => {
    const store = createLabStore(config, { autoplay: true })
    const { unmount } = renderHook(() => useRafClock(store))
    expect(raf.pending()).toBe(1)
    unmount()
    expect(raf.pending()).toBe(0)
    renderHook(() => useRafClock(store, false))
    expect(raf.pending()).toBe(0)
  })
})
