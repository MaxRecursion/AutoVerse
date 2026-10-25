import { act, render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePreferences } from '@/stores/preferences'
import { findReadingAnchor, useLevelScrollAnchor } from './useLevelScrollAnchor'

type Rect = { top: number; bottom: number }
let rects: Record<string, Rect> = {}
const originalRect = Element.prototype.getBoundingClientRect

function Lesson() {
  const level = usePreferences((p) => p.level)
  const ref = useRef<HTMLDivElement>(null)
  useLevelScrollAnchor(ref, level)
  return (
    <div ref={ref}>
      <section id="intro" data-anchor>
        <p id="p0" data-anchor>
          first
        </p>
        {level === 'beginner' && (
          <p id="p1" data-anchor>
            second
          </p>
        )}
      </section>
      <section id="steps" data-anchor>
        <p id="s0" data-anchor>
          step
        </p>
      </section>
    </div>
  )
}

describe('useLevelScrollAnchor', () => {
  beforeEach(() => {
    usePreferences.getState().setLevel('beginner')
    Element.prototype.getBoundingClientRect = function (this: Element) {
      const r = rects[this.id] ?? { top: 5000, bottom: 5100 }
      return { ...r, left: 0, right: 0, width: 0, height: r.bottom - r.top, x: 0, y: r.top, toJSON: () => ({}) } as DOMRect
    }
    window.scrollBy = vi.fn() as unknown as typeof window.scrollBy
  })
  afterEach(() => {
    Element.prototype.getBoundingClientRect = originalRect
  })

  it('picks the innermost anchor under the sticky bars, else the next one below', () => {
    rects = { intro: { top: 0, bottom: 600 }, p0: { top: 20, bottom: 100 }, p1: { top: 100, bottom: 300 }, steps: { top: 600, bottom: 900 } }
    const { container } = render(<Lesson />)
    expect(findReadingAnchor(container)?.el.id).toBe('p1')
    rects = { intro: { top: -900, bottom: 10 }, steps: { top: 300, bottom: 900 }, s0: { top: 340, bottom: 400 } }
    expect(findReadingAnchor(container)?.el.id).toBe('steps')
  })

  it('restores the reading position after a level switch, falling back to the enclosing section', () => {
    rects = { intro: { top: 40, bottom: 700 }, p0: { top: 40, bottom: 100 }, p1: { top: 100, bottom: 300 } }
    render(<Lesson />)
    // Runs after the hook's own listener (registered on mount), i.e. between measuring and re-rendering.
    const unsub = usePreferences.subscribe(() => {
      rects = { intro: { top: -60, bottom: 400 }, p0: { top: -60, bottom: 0 } }
    })
    act(() => usePreferences.getState().setLevel('technical'))
    unsub()
    // p1 no longer exists, so the section is used: it moved from 40 to -60.
    expect(window.scrollBy).toHaveBeenCalledWith(0, -100)
  })
})
