import { describe, expect, it } from 'vitest'
import { boxesEqual, clampToViewport, padBox, placeCard, type Box } from './geometry'

const viewport = { width: 1280, height: 800 }
const card = { width: 380, height: 240 }
const target = (over: Partial<Box> = {}): Box => ({ top: 100, left: 500, width: 200, height: 60, ...over })

describe('padBox / boxesEqual / clampToViewport', () => {
  it('pads equally on every side', () => {
    expect(padBox({ top: 10, left: 20, width: 100, height: 50 }, 8)).toEqual({ top: 2, left: 12, width: 116, height: 66 })
  })

  it('treats sub-pixel jitter as equal, so scrolling does not re-render needlessly', () => {
    expect(boxesEqual(target(), target({ top: 100.3 }))).toBe(true)
    expect(boxesEqual(target(), target({ top: 102 }))).toBe(false)
  })

  it('spotlights only the visible part of a tall or off-screen target', () => {
    expect(clampToViewport({ top: -200, left: 10, width: 300, height: 600 }, viewport)).toEqual({ top: 4, left: 10, width: 300, height: 396 })
    expect(clampToViewport({ top: 700, left: 1200, width: 300, height: 300 }, viewport)).toEqual({ top: 700, left: 1200, width: 76, height: 96 })
    expect(clampToViewport({ top: 900, left: 0, width: 50, height: 50 }, viewport).height).toBe(0)
  })
})

describe('placeCard', () => {
  it('centres the card when there is no target', () => {
    const p = placeCard(null, card, viewport)
    expect(p.placement).toBe('center')
    expect(p.left).toBe((1280 - 380) / 2)
    expect(p.top).toBe((800 - 240) / 2)
  })

  it('prefers below the target, centred on it', () => {
    const p = placeCard(target(), card, viewport)
    expect(p.placement).toBe('bottom')
    expect(p.top).toBe(100 + 60 + 14)
    expect(p.left).toBe(600 - 190)
  })

  it('goes above when there is no room below', () => {
    const p = placeCard(target({ top: 640 }), card, viewport)
    expect(p.placement).toBe('top')
    expect(p.top).toBe(640 - 14 - 240)
  })

  it('goes beside a target that is tall and leaves no vertical room', () => {
    const tall = { top: 20, left: 40, width: 200, height: 760 }
    const p = placeCard(tall, card, viewport)
    expect(p.placement).toBe('right')
    expect(p.left).toBe(40 + 200 + 14)
  })

  it('keeps the card inside the viewport horizontally', () => {
    const p = placeCard(target({ left: 1180, width: 90 }), card, viewport)
    expect(p.left + p.width).toBeLessThanOrEqual(1280 - 12)
    const q = placeCard(target({ left: 0, width: 40 }), card, viewport)
    expect(q.left).toBeGreaterThanOrEqual(12)
  })

  it('on a phone, fills the width and only goes above or below', () => {
    const phone = { width: 375, height: 812 }
    const p = placeCard(target({ top: 60, left: 280, width: 40, height: 40 }), card, phone, { narrow: true })
    expect(p.width).toBe(375 - 24)
    expect(p.left).toBe(12)
    expect(p.placement).toBe('bottom')
  })

  it('pins to the roomier edge when nothing fits, instead of leaving the screen', () => {
    const phone = { width: 375, height: 500 }
    const mid = { top: 120, left: 12, width: 350, height: 260 }
    const p = placeCard(mid, { width: 380, height: 300 }, phone, { narrow: true })
    expect(['pinned-top', 'pinned-bottom']).toContain(p.placement)
    expect(p.top).toBeGreaterThanOrEqual(12)
    expect(p.top + 300).toBeLessThanOrEqual(500)
  })
})
