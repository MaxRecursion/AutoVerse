import { afterEach, describe, expect, it, vi } from 'vitest'
import { withViewTransition } from './viewTransition'

const setReducedMotion = (reduce: boolean) =>
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: reduce && query.includes('reduce'), media: query }))

describe('withViewTransition', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    Reflect.deleteProperty(document, 'startViewTransition')
  })

  it('applies the update directly where view transitions are not supported', () => {
    setReducedMotion(false)
    const update = vi.fn()
    withViewTransition(update)
    expect(update).toHaveBeenCalledOnce()
  })

  it('runs the update inside a view transition when supported', () => {
    setReducedMotion(false)
    const start = vi.fn((cb: () => void) => cb())
    Object.assign(document, { startViewTransition: start })
    const update = vi.fn()
    withViewTransition(update)
    expect(start).toHaveBeenCalledOnce()
    expect(update).toHaveBeenCalledOnce()
  })

  it('skips the transition when the reader prefers reduced motion', () => {
    setReducedMotion(true)
    const start = vi.fn()
    Object.assign(document, { startViewTransition: start })
    const update = vi.fn()
    withViewTransition(update)
    expect(start).not.toHaveBeenCalled()
    expect(update).toHaveBeenCalledOnce()
  })
})
