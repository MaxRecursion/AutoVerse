import { PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import type { Vec3 } from './gearboxModel'
import { ASSEMBLED_BOX, DISTANCE, EXPLODED_BOX, SCENE_FOV, VIEW_DIRECTION, fitFraming, labFramings, type Box3Like, type Insets } from './framing'
import { TRANSMISSION_CAMERA, type CameraFraming } from './transmissionParts'

/** Projected NDC extent of a box for a framing on a canvas of the given aspect. */
function project(f: CameraFraming, box: Box3Like, aspect: number) {
  const cam = new PerspectiveCamera(SCENE_FOV, aspect, 0.05, 200)
  cam.position.set(...f.position)
  cam.lookAt(new Vector3(...f.target))
  cam.updateMatrixWorld()
  const e = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
  for (const x of [box.min[0], box.max[0]])
    for (const y of [box.min[1], box.max[1]])
      for (const z of [box.min[2], box.max[2]]) {
        const p = new Vector3(x, y, z).project(cam)
        e.minX = Math.min(e.minX, p.x)
        e.maxX = Math.max(e.maxX, p.x)
        e.minY = Math.min(e.minY, p.y)
        e.maxY = Math.max(e.maxY, p.y)
      }
  return e
}

const window = (w: number, h: number, i: Insets) => ({
  x0: -1 + (2 * i.left) / w,
  x1: 1 - (2 * i.right) / w,
  y0: -1 + (2 * i.bottom) / h,
  y1: 1 - (2 * i.top) / h,
})

const direction = (f: CameraFraming) => new Vector3(...f.position).sub(new Vector3(...f.target)).normalize()

const CANVASES: { name: string; w: number; h: number; insets: Insets }[] = [
  { name: 'desktop pane', w: 820, h: 700, insets: { top: 150, right: 12, bottom: 170, left: 12 } },
  { name: 'phone portrait', w: 351, h: 470, insets: { top: 100, right: 12, bottom: 160, left: 12 } },
  { name: 'phone landscape', w: 800, h: 340, insets: { top: 70, right: 12, bottom: 150, left: 12 } },
  { name: 'no overlays', w: 600, h: 600, insets: { top: 0, right: 0, bottom: 0, left: 0 } },
]

describe('camera framing', () => {
  it.each(CANVASES)('fits the whole gearbox into the area the overlays leave free ($name)', ({ w, h, insets }) => {
    const f = fitFraming({ width: w, height: h, insets, box: ASSEMBLED_BOX, direction: VIEW_DIRECTION, fov: SCENE_FOV, minDistance: 3, maxDistance: 22 })
    const e = project(f, ASSEMBLED_BOX, w / h)
    const win = window(w, h, insets)
    const eps = 1e-3
    expect(e.minX).toBeGreaterThanOrEqual(win.x0 - eps)
    expect(e.maxX).toBeLessThanOrEqual(win.x1 + eps)
    expect(e.minY).toBeGreaterThanOrEqual(win.y0 - eps)
    expect(e.maxY).toBeLessThanOrEqual(win.y1 + eps)
    // Tight: the limiting dimension uses most of the free window (not a small model in a big canvas).
    const fillX = (e.maxX - e.minX) / (win.x1 - win.x0)
    const fillY = (e.maxY - e.minY) / (win.y1 - win.y0)
    expect(Math.max(fillX, fillY)).toBeGreaterThan(0.85)
    // Centred in the free window.
    expect(Math.abs((e.minX + e.maxX) / 2 - (win.x0 + win.x1) / 2)).toBeLessThan(0.02)
    expect(Math.abs((e.minY + e.maxY) / 2 - (win.y0 + win.y1) / 2)).toBeLessThan(0.02)
  })

  it('keeps the front three-quarter view direction', () => {
    const f = fitFraming({ width: 351, height: 470, insets: { top: 100, right: 12, bottom: 160, left: 12 }, box: ASSEMBLED_BOX, direction: VIEW_DIRECTION, fov: SCENE_FOV, minDistance: 3, maxDistance: 22 })
    expect(direction(f).dot(direction(TRANSMISSION_CAMERA))).toBeCloseTo(1, 6)
  })

  it('pulls back on a narrow canvas and for the exploded view', () => {
    const insets: Insets = { top: 60, right: 12, bottom: 160, left: 12 }
    const dist = (f: CameraFraming) => new Vector3(...f.position).distanceTo(new Vector3(...f.target))
    const wide = labFramings(900, 640, insets)
    const narrow = labFramings(351, 470, insets)
    expect(dist(narrow.assembled)).toBeGreaterThan(dist(wide.assembled))
    expect(dist(wide.exploded)).toBeGreaterThan(dist(wide.assembled))
    for (const f of [wide.assembled, wide.exploded, narrow.assembled, narrow.exploded]) {
      expect(dist(f)).toBeGreaterThanOrEqual(DISTANCE.min - 0.01)
      expect(dist(f)).toBeLessThanOrEqual(DISTANCE.max + 0.01)
    }
  })

  it('contains every exploded offset in the exploded box', () => {
    const inside = (v: Vec3, b: Box3Like) => v.every((n, i) => n >= b.min[i] - 1e-9 && n <= b.max[i] + 1e-9)
    expect(inside(ASSEMBLED_BOX.min, EXPLODED_BOX)).toBe(true)
    expect(inside(ASSEMBLED_BOX.max, EXPLODED_BOX)).toBe(true)
    expect(EXPLODED_BOX.min[0]).toBeLessThan(ASSEMBLED_BOX.min[0])
    expect(EXPLODED_BOX.max[1]).toBeGreaterThan(ASSEMBLED_BOX.max[1])
  })

  it('falls back to the fixed framing when the canvas has no size yet', () => {
    expect(fitFraming({ width: 0, height: 0, insets: { top: 0, right: 0, bottom: 0, left: 0 }, box: ASSEMBLED_BOX, direction: VIEW_DIRECTION, fov: SCENE_FOV, minDistance: 3, maxDistance: 22 })).toBe(
      TRANSMISSION_CAMERA,
    )
  })

  it('ignores overlays that would leave almost no free area', () => {
    const f = fitFraming({ width: 300, height: 200, insets: { top: 90, right: 0, bottom: 90, left: 0 }, box: ASSEMBLED_BOX, direction: VIEW_DIRECTION, fov: SCENE_FOV, minDistance: 3, maxDistance: 22 })
    const e = project(f, ASSEMBLED_BOX, 300 / 200)
    expect(e.maxY - e.minY).toBeGreaterThan(0.5)
  })
})
