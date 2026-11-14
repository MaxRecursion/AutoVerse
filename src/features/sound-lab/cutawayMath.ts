/** Pure placement and four-stroke phasing for the original multi-cylinder cutaway. */
import { bankAxis, crankSections, mod, type Side } from './animation'
import type { EngineSpec } from './engines'
import type { FiringEvent } from './firing'
import { MM, crownYFromPinMm } from '@/features/engine-lab/engineModel'
import { pistonPinHeight, rodAngle } from '@/features/engine-lab/kinematics'

export const CUTAWAY_PITCH = 1.25

export interface CutawayCylinder {
  event: FiringEvent
  side: Side
  x: number
  slot: number
  /** Shared-pin pairs render the same crank once; split and boxer throws each render their own. */
  showCrank: boolean
}

/** The crankshaft runs along x, with each pair on the same journal position. */
export function cutawayLayout(spec: EngineSpec, events: FiringEvent[], bankAngle: number, sense: 1 | -1): CutawayCylinder[] {
  const sections = crankSections(spec, events)
  return sections.flatMap((section) => {
    const first = section.cylinders[0]
    const angleOf = (side: Side, event: FiringEvent) => bankAxis(side, bankAngle) - sense * event.angle
    return section.cylinders.map(({ event, side }, index) => {
      const delta = first ? mod(angleOf(side, event) - angleOf(first.side, first.event), 360) : 0
      const shared = delta < 0.01 || delta > 359.99
      return { event, side, slot: section.slot, x: (section.slot - (sections.length - 1) / 2) * CUTAWAY_PITCH, showCrank: index === 0 || !shared }
    })
  })
}

/**
 * Sound-lab phase zero is firing TDC. The detailed engine uses intake TDC as
 * zero, so its valve/cam/gas timeline is shifted by 360°. Crank sense changes
 * mechanical direction only; it must not reverse the four-stroke sequence.
 */
export function cutawayState(playhead: number, firingAngle: number, sense: 1 | -1) {
  const phase = mod(playhead - firingAngle, 720)
  const mechanicalDeg = sense * phase
  const pinMm = pistonPinHeight(mechanicalDeg)
  return {
    phase,
    cycleDeg: mod(phase + 360, 720),
    mechanicalDeg,
    pistonY: pinMm * MM,
    crownY: crownYFromPinMm(pinMm),
    rodRotation: -rodAngle(mechanicalDeg),
  }
}
