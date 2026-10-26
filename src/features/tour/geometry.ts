/** Pure layout maths for the tour: the spotlight box and where the card sits next to it. */

export interface Box {
  top: number
  left: number
  width: number
  height: number
}

export interface Size {
  width: number
  height: number
}

export type Placement = 'bottom' | 'top' | 'right' | 'left' | 'center' | 'pinned-top' | 'pinned-bottom'

export const boxesEqual = (a: Box, b: Box) =>
  Math.abs(a.top - b.top) < 0.5 && Math.abs(a.left - b.left) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5

export const padBox = (b: Box, pad: number): Box => ({ top: b.top - pad, left: b.left - pad, width: b.width + pad * 2, height: b.height + pad * 2 })

/** The part of `b` that is on screen (a tall target is spotlit only as far as it is visible). */
export function clampToViewport(b: Box, viewport: Size, margin = 4): Box {
  const top = Math.max(margin, b.top)
  const left = Math.max(margin, b.left)
  const bottom = Math.min(viewport.height - margin, b.top + b.height)
  const right = Math.min(viewport.width - margin, b.left + b.width)
  return { top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

export interface PlaceOptions {
  /** Space between the target and the card. */
  gap?: number
  /** Minimum distance from the viewport edge. */
  margin?: number
  /** Phones: only try above / below, and fill the width. */
  narrow?: boolean
}

export interface CardPlacement {
  top: number
  left: number
  width: number
  placement: Placement
}

/**
 * Chooses where the card goes: below the target if it fits, then above, then
 * (wide screens) right and left. When nothing fits it is pinned to whichever
 * edge is further from the target, so the target stays as visible as possible.
 * No target: centred.
 */
export function placeCard(target: Box | null, card: Size, viewport: Size, { gap = 14, margin = 12, narrow = false }: PlaceOptions = {}): CardPlacement {
  const width = narrow ? viewport.width - margin * 2 : Math.min(card.width, viewport.width - margin * 2)
  const fitsX = (left: number) => left >= margin && left + width <= viewport.width - margin
  const fitsY = (top: number) => top >= margin && top + card.height <= viewport.height - margin

  if (!target) {
    return { top: Math.max(margin, (viewport.height - card.height) / 2), left: Math.max(margin, (viewport.width - width) / 2), width, placement: 'center' }
  }

  const centreX = target.left + target.width / 2
  const centreY = target.top + target.height / 2
  const horizontal = (): number => (narrow ? margin : clamp(centreX - width / 2, margin, viewport.width - width - margin))
  const vertical = (): number => clamp(centreY - card.height / 2, margin, viewport.height - card.height - margin)

  const candidates: { placement: Placement; top: number; left: number }[] = [
    { placement: 'bottom', top: target.top + target.height + gap, left: horizontal() },
    { placement: 'top', top: target.top - gap - card.height, left: horizontal() },
  ]
  if (!narrow) {
    candidates.push(
      { placement: 'right', top: vertical(), left: target.left + target.width + gap },
      { placement: 'left', top: vertical(), left: target.left - gap - width },
    )
  }
  const fit = candidates.find((c) => fitsY(c.top) && fitsX(c.left))
  if (fit) return { ...fit, width }

  // No clean fit: pin to the roomier vertical edge.
  const roomBelow = viewport.height - (target.top + target.height)
  const roomAbove = target.top
  return roomBelow >= roomAbove
    ? { placement: 'pinned-bottom', top: Math.max(margin, viewport.height - card.height - margin), left: horizontal(), width }
    : { placement: 'pinned-top', top: margin, left: horizontal(), width }
}
