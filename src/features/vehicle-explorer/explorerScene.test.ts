import { describe, expect, it } from 'vitest'
import {
  applyTarget,
  chooseComponent,
  chooseSystem,
  createVehicleExplorerStore,
  currentTarget,
  framingFor,
  systemBox,
  systemFramingBox,
  visibleComponents,
} from './explorerActions'
import { P, readView } from './explorerConfig'
import { sameTarget, searchForTarget, targetFromSearch } from './explorerDeepLink'
import { DIAGRAM_HEIGHT, DIAGRAM_WIDTH, bodyProfilePath, projectBox, projectY, projectZ } from './explorerDiagram'
import { EXPLORER_COMPONENT_IDS, EXPLORER_SYSTEMS, EXPLORER_SYSTEM_IDS, availableComponents } from './explorerSystems'
import { COVER_COMPONENTS, GHOST_OPACITY, coverOpacity, modeForSystem, partLook } from './explorerVisuals'
import { CAR_BOX, CAR_HUBS, fitToHubs, frameBox, type Box, type Vec3 } from './vehicleLayout'
import { ENGINE_BOX, PROCEDURAL_SHAPES, SYSTEM_HOTSPOTS, componentBox, labelAnchor, mirrorShape, shapeBounds } from './vehicleParts'

const inside = (b: Box, outer: Box, tol = 0) =>
  [0, 1, 2].every((i) => b.min[i] >= outer.min[i] - tol && b.max[i] <= outer.max[i] + tol)

describe('packaging of the original procedural modules', () => {
  it('places every procedural shape inside the car body (3 cm tolerance: the tailpipe ends at the bumper)', () => {
    for (const [id, specs] of Object.entries(PROCEDURAL_SHAPES))
      for (const s of specs) expect(inside(shapeBounds(s.shape), CAR_BOX, 0.03), `${id} ${s.shape.kind}`).toBe(true)
  })

  it('keeps the resized engine ahead of the front axle (front-engine, transverse layout)', () => {
    expect(ENGINE_BOX.min[2]).toBeGreaterThan(CAR_HUBS.frontZ)
    // Wider than it is long: the crank runs across the car.
    expect(ENGINE_BOX.max[0] - ENGINE_BOX.min[0]).toBeGreaterThan(ENGINE_BOX.max[2] - ENGINE_BOX.min[2])
    // Transaxle bolted to the engine's left (+X) end; final drive on the front axle line.
    const casing = shapeBounds(PROCEDURAL_SHAPES.transaxle[0].shape)
    expect(casing.min[0]).toBeGreaterThanOrEqual(ENGINE_BOX.max[0])
    const fd = componentBox('final-drive')!
    expect(fd.min[2]).toBeLessThanOrEqual(CAR_HUBS.frontZ)
    expect(fd.max[2]).toBeGreaterThanOrEqual(CAR_HUBS.frontZ)
  })

  it('puts a suspension corner at each of the four wheels', () => {
    const springs = PROCEDURAL_SHAPES['coil-springs'].map((s) => shapeBounds(s.shape))
    expect(springs).toHaveLength(4)
    for (const [sx, z] of [
      [1, CAR_HUBS.frontZ],
      [-1, CAR_HUBS.frontZ],
      [1, CAR_HUBS.rearZ],
      [-1, CAR_HUBS.rearZ],
    ])
      expect(springs.some((b) => Math.sign(b.min[0] + b.max[0]) === sx && Math.abs((b.min[2] + b.max[2]) / 2 - z) < 0.2)).toBe(true)
  })

  it('mirrors left-side shapes onto the right', () => {
    const m = mirrorShape({ kind: 'cyl', from: [0.8, 0.2, 1], to: [0.4, 0.2, 1.1], r: 0.02 })
    expect(m).toEqual({ kind: 'cyl', from: [-0.8, 0.2, 1], to: [-0.4, 0.2, 1.1], r: 0.02 })
  })

  it('gives every component a box and a label anchor, and every system a hotspot', () => {
    for (const id of EXPLORER_COMPONENT_IDS) {
      expect(componentBox(id), id).not.toBeNull()
      expect(labelAnchor(id), id).toBeDefined()
    }
    for (const id of EXPLORER_SYSTEM_IDS) expect(SYSTEM_HOTSPOTS[id]).toHaveLength(3)
  })
})

describe('camera framing', () => {
  /** Every box corner projects inside the view frustum. */
  function fits(box: Box, f: { position: Vec3; target: Vec3 }, fov: number, aspect: number) {
    const d = f.position.map((p, i) => p - f.target[i]) as Vec3
    const len = Math.hypot(...d)
    const dir = d.map((v) => v / len) as Vec3
    const right = [dir[2], 0, -dir[0]].map((v) => v / Math.hypot(dir[2], dir[0])) as Vec3
    const up: Vec3 = [dir[1] * right[2] - dir[2] * right[1], dir[2] * right[0] - dir[0] * right[2], dir[0] * right[1] - dir[1] * right[0]]
    const tanV = Math.tan((fov * Math.PI) / 360)
    for (const x of [box.min[0], box.max[0]])
      for (const y of [box.min[1], box.max[1]])
        for (const z of [box.min[2], box.max[2]]) {
          const c = [x - f.position[0], y - f.position[1], z - f.position[2]]
          const depth = -(c[0] * dir[0] + c[1] * dir[1] + c[2] * dir[2])
          const r = Math.abs(c[0] * right[0] + c[1] * right[1] + c[2] * right[2])
          const u = Math.abs(c[0] * up[0] + c[1] * up[1] + c[2] * up[2])
          if (depth <= 0 || u / depth > tanV + 1e-9 || r / depth > tanV * aspect + 1e-9) return false
        }
    return true
  }

  it('fits a box exactly in landscape and portrait canvases', () => {
    const box: Box = { min: [-1, 0, -2], max: [1, 1, 2] }
    for (const aspect of [0.5, 0.9, 1.6, 2.4]) {
      const f = frameBox(box, [1, 0.5, 1.15], 38, aspect, 1, 0)
      expect(fits(box, f, 38, aspect), `aspect ${aspect}`).toBe(true)
      // Tight: 5 % closer and it no longer fits.
      const closer = { target: f.target, position: f.position.map((p, i) => f.target[i] + (p - f.target[i]) * 0.95) as Vec3 }
      expect(fits(box, closer, 38, aspect)).toBe(false)
    }
  })

  it('backs off further for a portrait canvas than a landscape one', () => {
    const dist = (aspect: number) => {
      const f = framingFor({ systemId: null, componentId: null }, aspect)
      return Math.hypot(...f.position.map((p, i) => p - f.target[i]))
    }
    expect(dist(0.6)).toBeGreaterThan(dist(1.6))
  })

  it('frames a component closer than its system, and a system closer than (or as close as) the car', () => {
    const d = (systemId: (typeof EXPLORER_SYSTEM_IDS)[number] | null, componentId: string | null) => {
      const f = framingFor({ systemId, componentId }, 1.4)
      return Math.hypot(...f.position.map((p, i) => p - f.target[i]))
    }
    expect(d('cooling', 'radiator')).toBeLessThan(d('cooling', null))
    expect(d('cooling', null)).toBeLessThan(d(null, null))
  })

  it('frames systems spread along the car with its full length', () => {
    expect(systemFramingBox('braking')!.min[2]).toBe(CAR_BOX.min[2])
    expect(systemFramingBox('braking')!.max[2]).toBe(CAR_BOX.max[2])
    expect(systemFramingBox('cooling')).toEqual(systemBox('cooling'))
  })

  it('fits the Kenney sedan onto the Car Concept hubs', () => {
    const fit = fitToHubs({ halfTrack: 0.6, hubY: 0.3, frontZ: 0.66, rearZ: -0.6 })
    expect(fit.bodyScale[0] * 0.6).toBeCloseTo(CAR_HUBS.halfTrack)
    expect(fit.bodyScale[2] * 0.66 + fit.bodyOffset[2]).toBeCloseTo(CAR_HUBS.frontZ)
    expect(fit.bodyScale[2] * -0.6 + fit.bodyOffset[2]).toBeCloseTo(CAR_HUBS.rearZ)
  })
})

describe('part appearance', () => {
  const view = (mode: 'exterior' | 'cutaway' | 'focus', system: (typeof EXPLORER_SYSTEM_IDS)[number] | null, bodyFade = 0) => ({ mode, system, bodyFade })

  it('keeps the body solid in exterior and fades it with the slider (never fully invisible)', () => {
    expect(coverOpacity('exterior', 0)).toBe(1)
    expect(coverOpacity('exterior', 1)).toBeGreaterThan(0)
    expect(coverOpacity('exterior', 1)).toBeLessThan(0.1)
    expect(coverOpacity('cutaway', 0)).toBeLessThan(0.2)
  })

  it('ghosts everything outside the focused system in System focus', () => {
    const base = { selectedId: null, hoveredId: null }
    expect(partLook({ componentId: 'radiator', systemId: 'cooling', view: view('focus', 'braking'), ...base }).opacity).toBe(GHOST_OPACITY)
    expect(partLook({ componentId: 'brake-discs', systemId: 'braking', view: view('focus', 'braking'), ...base })).toEqual({ opacity: 1, glow: 'system' })
    expect(partLook({ componentId: 'body-shell', systemId: 'body', view: view('focus', 'braking'), ...base }).opacity).toBeLessThanOrEqual(GHOST_OPACITY)
  })

  it('ghosts only the covering body panels in Cutaway', () => {
    const base = { selectedId: null, hoveredId: null }
    for (const id of COVER_COMPONENTS) expect(partLook({ componentId: id, systemId: 'body', view: view('cutaway', null), ...base }).opacity).toBeLessThan(0.2)
    expect(partLook({ componentId: 'radiator', systemId: 'cooling', view: view('cutaway', null), ...base }).opacity).toBe(1)
  })

  it('ranks selection over hover over system glow', () => {
    const v = view('cutaway', 'braking')
    expect(partLook({ componentId: 'brake-discs', systemId: 'braking', view: v, selectedId: 'brake-discs', hoveredId: 'brake-discs' }).glow).toBe('selected')
    expect(partLook({ componentId: 'brake-discs', systemId: 'braking', view: v, selectedId: null, hoveredId: 'brake-discs' }).glow).toBe('hover')
    expect(partLook({ componentId: 'radiator', systemId: 'cooling', view: v, selectedId: null, hoveredId: null }).glow).toBeNull()
  })

  it('switches Exterior to Cutaway for systems hidden inside the body', () => {
    expect(modeForSystem('exterior', 'engine')).toBe('cutaway')
    expect(modeForSystem('exterior', 'body')).toBe('exterior')
    expect(modeForSystem('focus', 'engine')).toBe('focus')
    expect(modeForSystem('exterior', null)).toBe('exterior')
  })
})

describe('explorer store actions', () => {
  it('chooses a system, its parts and returns to the whole car', () => {
    const store = createVehicleExplorerStore()
    expect(readView(store.getState().params)).toMatchObject({ mode: 'exterior', system: null })
    expect(store.getState().showLabels).toBe(true)
    chooseSystem(store, 'cooling')
    expect(readView(store.getState().params)).toMatchObject({ mode: 'cutaway', system: 'cooling' })
    chooseComponent(store, 'radiator')
    expect(store.getState().selectedId).toBe('radiator')
    // A part from another system moves the focus to that system.
    chooseComponent(store, 'battery')
    expect(currentTarget(store)).toEqual({ systemId: 'electrical', componentId: 'battery' })
    chooseSystem(store, null)
    expect(currentTarget(store)).toEqual({ systemId: null, componentId: null })
    expect(store.getState().selectedId).toBeNull()
  })

  it('focuses the system of a part clicked in the scene', () => {
    const store = createVehicleExplorerStore()
    store.getState().select('rear-silencer') // what <Part> does on click
    expect(currentTarget(store)).toEqual({ systemId: 'exhaust', componentId: 'rear-silencer' })
  })

  it('round-trips deep-link targets through the store and the query string', () => {
    const store = createVehicleExplorerStore()
    const target = targetFromSearch(new URLSearchParams('component=brake-disc&nowebgl'))
    applyTarget(store, target)
    expect(sameTarget(currentTarget(store), target)).toBe(true)
    const search = searchForTarget(new URLSearchParams('component=brake-disc&nowebgl'), currentTarget(store))
    expect(search.toString()).toBe('nowebgl=&component=brake-discs')
    expect(searchForTarget(new URLSearchParams('system=cooling'), { systemId: null, componentId: null }).toString()).toBe('')
    expect(searchForTarget(new URLSearchParams(), { systemId: 'cooling', componentId: null }).toString()).toBe('system=cooling')
  })

  it('lists only parts the loaded model shows', () => {
    expect(visibleComponents('body', 'carconcept')).toContain('side-doors')
    expect(visibleComponents('body', 'kenney')).toEqual(['body-shell'])
    for (const s of EXPLORER_SYSTEMS) for (const id of visibleComponents(s.id, 'procedural')) expect(availableComponents('procedural').has(id)).toBe(true)
  })

  it('tolerates malformed params', () => {
    expect(readView({ [P.mode]: 'xray', [P.system]: 'warp', [P.bodyFade]: 7, [P.model]: 'tank' })).toEqual({
      mode: 'exterior',
      system: null,
      bodyFade: 1,
      open: false,
      model: 'carconcept',
    })
  })
})

describe('2D fallback diagram', () => {
  it('projects the car side-on with the front on the left', () => {
    expect(projectZ(CAR_BOX.max[2])).toBeLessThan(projectZ(CAR_BOX.min[2]))
    expect(projectY(1)).toBeLessThan(projectY(0))
    const r = projectBox(CAR_BOX)
    expect(r.x).toBeGreaterThanOrEqual(0)
    expect(r.x + r.width).toBeLessThanOrEqual(DIAGRAM_WIDTH)
    expect(r.y + r.height).toBeLessThanOrEqual(DIAGRAM_HEIGHT)
  })

  it('draws a closed body profile', () => {
    const d = bodyProfilePath()
    expect(d.startsWith('M ')).toBe(true)
    expect(d.endsWith('Z')).toBe(true)
    expect(d).not.toMatch(/NaN/)
  })
})
