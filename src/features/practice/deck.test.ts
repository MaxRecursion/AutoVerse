import { describe, expect, it } from 'vitest'
import { answerCard, deckDone, orderForPractice, REVIEW_GAP, startDeck, swipeDecision } from './deck'

describe('deck', () => {
  it('retires a card answered "Got it"', () => {
    const d = answerCard(startDeck(['a', 'b', 'c']), true)
    expect(d.queue).toEqual(['b', 'c'])
    expect(d).toMatchObject({ total: 3, known: 1, again: 0 })
  })

  it('brings an "Again" card back a few cards later, or at the end of a short deck', () => {
    const long = answerCard(startDeck(['a', 'b', 'c', 'd', 'e', 'f']), false)
    expect(long.queue).toEqual(['b', 'c', 'd', 'a', 'e', 'f'])
    expect(REVIEW_GAP).toBe(3)
    expect(answerCard(startDeck(['a', 'b']), false).queue).toEqual(['b', 'a'])
    expect(answerCard(startDeck(['a']), false).queue).toEqual(['a'])
    expect(long.again).toBe(1)
  })

  it('is finished only when every card has been known, however many times it came back', () => {
    let d = startDeck(['a', 'b'])
    d = answerCard(d, false)
    d = answerCard(d, true)
    expect(deckDone(d)).toBe(false)
    d = answerCard(d, true)
    expect(deckDone(d)).toBe(true)
    expect(d).toMatchObject({ known: 2, again: 1, total: 2 })
    expect(answerCard(d, true)).toBe(d)
  })

  it('reads a swipe by distance or speed, and ignores a small slow one', () => {
    expect(swipeDecision(80, 0)).toBe('known')
    expect(swipeDecision(-80, 0)).toBe('again')
    expect(swipeDecision(10, 900)).toBe('known')
    expect(swipeDecision(-10, -900)).toBe('again')
    expect(swipeDecision(30, 200)).toBeNull()
    expect(swipeDecision(-50, 0)).toBeNull()
  })

  it('deals unseen terms first, then "Again" terms, then known ones, the same way for the same seed', () => {
    const practice = {
      d: { known: true, reviewedAt: 'x' },
      e: { known: false, reviewedAt: 'x' },
    }
    const order = orderForPractice(['a', 'b', 'c', 'd', 'e'], practice, 7)
    expect(new Set(order.slice(0, 3))).toEqual(new Set(['a', 'b', 'c']))
    expect(order.slice(3)).toEqual(['e', 'd'])
    expect(orderForPractice(['a', 'b', 'c', 'd', 'e'], practice, 7)).toEqual(order)
    expect(orderForPractice(['a', 'b', 'c', 'd', 'e'], practice, 8).slice(3)).toEqual(['e', 'd'])
  })
})
