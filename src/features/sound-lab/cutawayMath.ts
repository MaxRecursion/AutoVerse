/** Pure placement and four-stroke phasing for the original multi-cylinder cutaway. */
import { bankAxis, crankSections, DEG, mod, type Side } from './animation'
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

/** Where one cylinder's exhaust starts: all the exhaust pipework takes from the cutaway layout. */
export interface ExhaustSeat {
  index: number
  side: Side
  x: number
}

/**
 * The exhaust pipework depends only on which cylinder sits where. The bank
 * angle reaches it through the frame bus, which rebuilds the pipes at most
 * once per rebuild gap. The firing angles only time each cylinder's gas,
 * read every frame. Bank-angle and crankpin-split slider steps make a new
 * cylinder list without moving any seat, so the pipework is keyed by this
 * string rather than by that list. The single-cylinder view puts its one
 * seat at x = 0.
 */
export function exhaustSeatsKey(cylinders: readonly CutawayCylinder[], detail: boolean): string {
  return cylinders.map((cylinder) => `${cylinder.event.index}:${cylinder.side}:${detail ? 0 : cylinder.x}`).join(' ')
}

/** The seats an {@link exhaustSeatsKey} was made from. */
export function exhaustSeats(key: string): ExhaustSeat[] {
  if (!key) return []
  return key.split(' ').map((entry) => {
    const [index, side, x] = entry.split(':')
    return { index: Number(index), side: side as Side, x: Number(x) }
  })
}

export type Vec3 = [number, number, number]

/**
 * In the whole-engine view, bank B of a V or flat engine is drawn as a mirror
 * image (z → −z) of the Engine Lab cylinder, so both banks' exhaust ports face
 * outwards (downwards on a boxer), as on the real engines. An inline engine is
 * mirrored too, which turns its exhaust side towards the camera. The
 * single-cylinder view is never mirrored.
 */
export const cutawayMirror = (layout: EngineSpec['layout'], side: Side, detail: boolean): 1 | -1 => (!detail && (layout === 'inline' || side === 'B') ? -1 : 1)

/** A point in a cylinder's own model frame (z sideways, y up), placed in the scene: mirrored, then leaned about x by its bank axis. */
export function cutawayToWorld(side: Side, bankAngle: number, mirror: 1 | -1, x: number, p: { z: number; y: number }): Vec3 {
  const a = bankAxis(side, bankAngle) * DEG
  const z = mirror * p.z
  return [x, p.y * Math.cos(a) - z * Math.sin(a), p.y * Math.sin(a) + z * Math.cos(a)]
}

/**
 * Sound-lab phase zero is firing TDC. The detailed engine uses intake TDC as
 * zero, so its valve/cam/gas timeline is shifted by 360°. Crank sense changes
 * mechanical direction only; it must not reverse the four-stroke sequence.
 * A mirrored cylinder turns its crank (and cams) the other way inside its own
 * frame, which the mirror turns back: every crankpin stays where it was.
 */
export function cutawayState(playhead: number, firingAngle: number, sense: 1 | -1, mirror: 1 | -1 = 1) {
  const phase = mod(playhead - firingAngle, 720)
  const mechanicalDeg = mirror * sense * phase
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
