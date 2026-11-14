/**
 * Firing-interval maths for the Engine Sound Lab. Pure: no audio, no DOM.
 *
 * A four-stroke engine fires every cylinder once per 720° of crank rotation.
 * Inline and flat engines with the usual crankshafts space those firings
 * evenly (720° ÷ cylinders). A V engine whose opposite cylinders share a
 * crankpin fires those two cylinders the bank angle apart, then waits for the
 * next pin: the gaps alternate between `bank + split` and `1440 ÷ n − that`.
 * Splitting (offsetting) the shared pin moves the first gap, which is how a
 * 90° V6 or V10 can still be made to fire evenly.
 */

export type Bank = 'A' | 'B' | 'mid'

export interface FiringEvent {
  /** Crank angle of this firing within the 720° cycle, starting at 0. */
  angle: number
  /** Gap in crank degrees until the next firing. */
  gap: number
  /** Cylinder number in the maker's numbering, or null when the order is not published here. */
  cylinder: number | null
  bank: Bank
  /** Position in the firing order, from 0. */
  index: number
}

/** Even spacing for `n` cylinders over the 720° cycle. */
export const evenGap = (n: number) => 720 / n

export function evenIntervals(n: number): number[] {
  return Array.from({ length: n }, () => evenGap(n))
}

/** Smallest gap the paired-V model allows, so a slider can never stack two firings on top of each other. */
const MIN_GAP = 6

/**
 * Gaps for a V engine with paired (shared or split) crankpins: `n` cylinders,
 * `bankAngle` between the banks, and `split` degrees of crankpin offset
 * (positive widens the paired gap). `startWithPair` puts the paired gap first.
 */
export function pairedVIntervals(n: number, bankAngle: number, split = 0, startWithPair = true): number[] {
  if (n % 2 !== 0 || n < 4) throw new Error(`A paired-crankpin V needs an even number of cylinders, got ${n}`)
  const period = 1440 / n
  const paired = Math.min(period - MIN_GAP, Math.max(MIN_GAP, bankAngle + split))
  const rest = period - paired
  const pair = startWithPair ? [paired, rest] : [rest, paired]
  return Array.from({ length: n }, (_, i) => pair[i % 2]!)
}

/** Crankpin split (degrees) that makes a paired V of this bank angle fire evenly. */
export const evenFiringSplit = (n: number, bankAngle: number) => evenGap(n) - bankAngle

/** True when every gap is the same, to within a tenth of a degree. */
export const isEvenFiring = (intervals: number[]) => intervals.every((g) => Math.abs(g - intervals[0]!) < 0.1)

/** Lay out one 720° cycle from gaps, a firing order and the bank of each cylinder. */
export function firingEvents(intervals: number[], order: number[] | null, bankOf: (cylinder: number, index: number) => Bank): FiringEvent[] {
  let angle = 0
  return intervals.map((gap, index) => {
    const cylinder = order ? order[index]! : null
    const event: FiringEvent = { angle, gap, cylinder, bank: bankOf(cylinder ?? index + 1, index), index }
    angle += gap
    return event
  })
}

/** Distinct gaps (rounded to whole degrees) in the order they first appear, e.g. [54, 90]. */
export function gapPattern(intervals: number[]): number[] {
  const seen: number[] = []
  for (const g of intervals) {
    const r = Math.round(g)
    if (!seen.includes(r)) seen.push(r)
  }
  return seen
}

/**
 * Gaps between successive firings on one bank, which is what a separate
 * exhaust for that bank carries. A cross-plane V8 is even overall but uneven
 * per bank: that unevenness is its burble.
 */
export function bankGaps(events: FiringEvent[], bank: Bank): number[] {
  const on = events.filter((e) => e.bank === bank).map((e) => e.angle)
  return on.map((a, i) => {
    const next = on[(i + 1) % on.length]!
    return Math.round(((next - a + 720) % 720) || 720)
  })
}

/** Firing pulses per second at this engine speed: each cylinder fires once every two revolutions. */
export const firingFrequency = (cylinders: number, rpm: number) => (cylinders * rpm) / 120

/** Human description of a gap list, e.g. "even, every 72°" or "alternating 54° and 90°". */
export function describeIntervals(intervals: number[]): string {
  const pattern = gapPattern(intervals)
  if (pattern.length === 1) return `even, every ${pattern[0]}°`
  if (pattern.length === 2) return `alternating ${pattern[0]}° and ${pattern[1]}°`
  return `uneven: ${pattern.map((g) => `${g}°`).join(', ')}`
}

/** Index of the latest firing at or before the playhead. */
export function activeEventIndex(events: FiringEvent[], playhead: number): number {
  let active = events.length - 1
  for (const e of events) if (e.angle <= playhead) active = e.index
  return active
}
