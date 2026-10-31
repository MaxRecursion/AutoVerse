import type { TermReview } from '@/stores/progress'

/** How many cards come up before one marked "Again" is shown again. */
export const REVIEW_GAP = 3
/** Swipe far enough (px) or fast enough (px/s) and it counts as an answer; anything less springs back. */
export const SWIPE_DISTANCE = 50
export const SWIPE_VELOCITY = 500

export interface DeckState {
  /** Term slugs still to answer, the current card first. */
  queue: string[]
  /** Cards the deck began with. */
  total: number
  /** Cards answered "Got it" so far. */
  known: number
  /** Times "Again" was pressed. */
  again: number
}

export const startDeck = (slugs: readonly string[]): DeckState => ({ queue: [...slugs], total: slugs.length, known: 0, again: 0 })
export const deckDone = (d: DeckState) => d.queue.length === 0

/** "Got it" retires the card; "Again" puts it back a few cards later. */
export function answerCard(d: DeckState, known: boolean): DeckState {
  const [head, ...rest] = d.queue
  if (head === undefined) return d
  if (known) return { ...d, queue: rest, known: d.known + 1 }
  const at = Math.min(rest.length, REVIEW_GAP)
  return { ...d, queue: [...rest.slice(0, at), head, ...rest.slice(at)], again: d.again + 1 }
}

/** A gesture's meaning: right is "Got it", left is "Again", short and slow is nothing. */
export function swipeDecision(offsetX: number, velocityX: number): 'known' | 'again' | null {
  if (offsetX > SWIPE_DISTANCE || velocityX > SWIPE_VELOCITY) return 'known'
  if (offsetX < -SWIPE_DISTANCE || velocityX < -SWIPE_VELOCITY) return 'again'
  return null
}

/** Small seeded generator, so a given seed always deals the same order (and tests can pin it). */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

/**
 * The order to practise in: terms never seen first, then those last marked
 * "Again", then those already known; shuffled within each group.
 */
export function orderForPractice(slugs: readonly string[], practice: Record<string, TermReview>, seed: number): string[] {
  const random = mulberry32(seed)
  const unseen = slugs.filter((s) => !practice[s])
  const again = slugs.filter((s) => practice[s] && !practice[s].known)
  const known = slugs.filter((s) => practice[s]?.known)
  return [...shuffle(unseen, random), ...shuffle(again, random), ...shuffle(known, random)]
}
