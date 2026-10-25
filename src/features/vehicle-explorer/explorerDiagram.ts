/**
 * Side-elevation geometry for the explorer's 2D fallback diagram (pure,
 * unit-tested). It projects the same car-frame boxes the 3D scene frames
 * with, so the diagram and the model always agree on where a system sits.
 *
 * Projection: the car seen from its left (+X) side, so the front (+Z) is on
 * the left of the drawing and +Y is up. 1 m = SCALE drawing units.
 */
import { CAR_BOX, CAR_HUBS, WHEEL_RADIUS, type Box } from './vehicleLayout'

export const SCALE = 100
const MARGIN = 16
const TOP_Y = 1.25

export const DIAGRAM_WIDTH = Math.round(2 * MARGIN + (CAR_BOX.max[2] - CAR_BOX.min[2]) * SCALE)
export const DIAGRAM_HEIGHT = Math.round(2 * MARGIN + TOP_Y * SCALE)

/** Car-frame (z, y) → drawing (x, y). */
export const projectZ = (z: number): number => MARGIN + (CAR_BOX.max[2] - z) * SCALE
export const projectY = (y: number): number => MARGIN + (TOP_Y - y) * SCALE

export interface DiagramRect {
  x: number
  y: number
  width: number
  height: number
}

/** A car-frame box seen from the side (its X extent is dropped). */
export function projectBox(box: Box): DiagramRect {
  const x0 = projectZ(box.max[2])
  const x1 = projectZ(box.min[2])
  const y0 = projectY(box.max[1])
  const y1 = projectY(box.min[1])
  return { x: x0, y: y0, width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0) }
}

export const GROUND_Y = projectY(0)

export const DIAGRAM_WHEELS = [CAR_HUBS.frontZ, CAR_HUBS.rearZ].map((z) => ({
  cx: projectZ(z),
  cy: projectY(CAR_HUBS.hubY),
  r: WHEEL_RADIUS * SCALE,
}))

const f = (n: number) => Math.round(n * 10) / 10

/**
 * Simplified side profile of the low concept car (original drawing, not a
 * trace): nose, bonnet, windscreen, roof, rear deck and tail, with arches
 * cut around both wheels.
 */
export function bodyProfilePath(): string {
  const arch = WHEEL_RADIUS + 0.06
  const pts: [number, number][] = [
    [2.4, 0.16],
    [2.42, 0.42],
    [2.25, 0.55],
    [1.9, 0.64],
    [1.45, 0.76],
    [0.45, 1.12],
    [-0.55, 1.14],
    [-1.45, 0.92],
    [-1.9, 0.8],
    [-1.94, 0.24],
  ]
  const p = (z: number, y: number) => `${f(projectZ(z))} ${f(projectY(y))}`
  const sill = 0.16
  const r = f(arch * SCALE)
  const hubY = CAR_HUBS.hubY
  // Arch ends sit where the arch circle meets the sill line.
  const half = Math.sqrt(Math.max(0, arch * arch - (sill - hubY) ** 2))
  // Drawn right-to-left (towards the nose) and bulging upwards: large arc, anticlockwise on screen.
  const archTo = (z: number) => `L ${p(z - half, sill)} A ${r} ${r} 0 1 0 ${p(z + half, sill)}`
  return [
    `M ${p(...pts[0])}`,
    ...pts.slice(1).map(([z, y]) => `L ${p(z, y)}`),
    // Underside from the tail forwards: rear arch, sill, front arch, back to the nose.
    `L ${p(-1.94, sill)}`,
    archTo(CAR_HUBS.rearZ),
    archTo(CAR_HUBS.frontZ),
    'Z',
  ].join(' ')
}

/** Window line (glasshouse) for a little realism. */
export function glasshousePath(): string {
  const p = (z: number, y: number) => `${f(projectZ(z))} ${f(projectY(y))}`
  return `M ${p(1.35, 0.8)} L ${p(0.45, 1.08)} L ${p(-0.5, 1.1)} L ${p(-1.3, 0.9)} L ${p(-0.2, 0.82)} Z`
}
