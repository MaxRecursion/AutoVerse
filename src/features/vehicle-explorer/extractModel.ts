/**
 * Splits a loaded vehicle GLB into explorer components (three.js, no React).
 * Mapped nodes are detached from the GLTF hierarchy with their world
 * transform baked in, so every part — GLB or procedural — lives in the same
 * car frame (metres, +Y up, front +Z). Hinged panels are re-parented under a
 * pivot group placed on their measured hinge so they can swing open.
 */
import { Box3, BufferGeometry, Group, Matrix4, Mesh, Vector3, type Object3D } from 'three'
import {
  AXLE_SPLIT,
  CARCONCEPT_AXLES,
  CARCONCEPT_HINGES,
  CARCONCEPT_ROOT,
  CARCONCEPT_WHEEL_GROUPS,
  classifyCarConceptNode,
  type HingeSpec,
} from './carConceptNodes'
import { fitToHubs, type Box, type HubLayout } from './vehicleLayout'
import { ENGINE_BOX } from './vehicleParts'

export interface Hinge {
  pivot: Group
  spec: HingeSpec
}

export interface ExtractedVehicle {
  /** Component id → top-level objects for that component (car frame). */
  parts: Map<string, Object3D[]>
  /** Geometry that is shown but not mapped to a component. */
  rest: Object3D[]
  hinges: Hinge[]
  dispose: () => void
}

/** Original glTF node name ('' for unnamed nodes; three.js may otherwise rename them). */
const gltfName = (o: Object3D): string => (typeof o.userData?.name === 'string' ? o.userData.name : '')

function add(map: Map<string, Object3D[]>, id: string, obj: Object3D) {
  const list = map.get(id)
  if (list) list.push(obj)
  else map.set(id, [obj])
}

/** Detach `obj` and give it its world transform (matrixWorld must be current). */
function bakeWorld(obj: Object3D, world: Matrix4) {
  obj.removeFromParent()
  world.decompose(obj.position, obj.quaternion, obj.scale)
  obj.matrixAutoUpdate = true
}

/** Split every mesh under `node` by triangle centroid: z ≥ 0 (front) and z < 0 (rear), in the car frame. */
function splitByZ(node: Object3D, created: BufferGeometry[]): { front: Object3D[]; rear: Object3D[] } {
  const front: Object3D[] = []
  const rear: Object3D[] = []
  const v = new Vector3()
  node.traverse((o) => {
    const mesh = o as Mesh
    if (!mesh.isMesh) return
    const geo = mesh.geometry
    const pos = geo.getAttribute('position')
    if (!pos) return
    const index = geo.getIndex()
    const count = index ? index.count : pos.count
    const at = (i: number) => (index ? index.getX(i) : i)
    const f: number[] = []
    const r: number[] = []
    for (let i = 0; i + 2 < count; i += 3) {
      let z = 0
      for (let k = 0; k < 3; k++) {
        v.fromBufferAttribute(pos, at(i + k)).applyMatrix4(mesh.matrixWorld)
        z += v.z
      }
      ;(z >= 0 ? f : r).push(at(i), at(i + 1), at(i + 2))
    }
    const make = (idx: number[]) => {
      const g = new BufferGeometry()
      for (const [name, attr] of Object.entries(geo.attributes)) g.setAttribute(name, attr)
      g.setIndex(idx)
      created.push(g)
      const m = new Mesh(g, mesh.material)
      mesh.matrixWorld.decompose(m.position, m.quaternion, m.scale)
      return m
    }
    if (f.length) front.push(make(f))
    if (r.length) rear.push(make(r))
  })
  return { front, rear }
}

/**
 * Wrap `obj` (already in the car frame) in a group that scales and moves its
 * bounds onto `target` along the world axes.
 */
function fitIntoBox(obj: Object3D, target: Box): Group {
  obj.updateMatrixWorld(true)
  const box = new Box3().setFromObject(obj)
  const size = box.getSize(new Vector3())
  const centre = box.getCenter(new Vector3())
  const k = new Vector3(
    (target.max[0] - target.min[0]) / (size.x || 1),
    (target.max[1] - target.min[1]) / (size.y || 1),
    (target.max[2] - target.min[2]) / (size.z || 1),
  )
  const g = new Group()
  g.scale.copy(k)
  g.position.set(
    (target.min[0] + target.max[0]) / 2 - k.x * centre.x,
    (target.min[1] + target.max[1]) / 2 - k.y * centre.y,
    (target.min[2] + target.max[2]) / 2 - k.z * centre.z,
  )
  g.add(obj)
  return g
}

/**
 * Car Concept: name-based mapping (carConceptNodes.ts), axle split and four
 * hinges. The fused placeholder engine is resized to ENGINE_BOX so the added
 * drivetrain and cooling modules fit around it (a stated modification).
 */
export function extractCarConcept(source: Object3D): ExtractedVehicle {
  const root = source.clone(true)
  root.updateMatrixWorld(true)
  const parts = new Map<string, Object3D[]>()
  const rest: Object3D[] = []
  const created: BufferGeometry[] = []
  const hingeSpecs = new Map(CARCONCEPT_HINGES.map((h) => [h.node, h]))
  const pending: { obj: Object3D; id: string | null; world: Matrix4 }[] = []
  const hinges: Hinge[] = []
  let axles: Object3D | null = null

  const visit = (node: Object3D) => {
    const name = gltfName(node)
    const parentName = node.parent ? gltfName(node.parent) : null
    if (name === CARCONCEPT_AXLES) {
      axles = node
      return
    }
    const id = classifyCarConceptNode(name, parentName)
    if (id) {
      pending.push({ obj: node, id, world: node.matrixWorld.clone() })
      return
    }
    const descend = name === CARCONCEPT_ROOT || (CARCONCEPT_WHEEL_GROUPS as readonly string[]).includes(name) || node === root
    if (descend || !(node as Mesh).isMesh) {
      // Containers: walk into them (copy the list — nothing is detached yet, but be safe).
      ;[...node.children].forEach(visit)
      return
    }
    pending.push({ obj: node, id: null, world: node.matrixWorld.clone() })
  }
  visit(root)

  if (axles) {
    const { front, rear } = splitByZ(axles, created)
    front.forEach((m) => add(parts, AXLE_SPLIT.front, m))
    rear.forEach((m) => add(parts, AXLE_SPLIT.rear, m))
  }

  for (const { obj, id, world } of pending) {
    bakeWorld(obj, world)
    const spec = hingeSpecs.get(gltfName(obj))
    let top: Object3D = obj
    if (id === 'engine-unit') top = fitIntoBox(obj, ENGINE_BOX)
    else if (spec) {
      // Pivot group sits on the node's own origin (its measured hinge) with no rotation.
      const pivot = new Group()
      pivot.name = `${spec.node}-hinge`
      pivot.position.copy(obj.position)
      obj.position.sub(pivot.position)
      pivot.add(obj)
      hinges.push({ pivot, spec })
      top = pivot
    }
    if (id) add(parts, id, top)
    else rest.push(top)
  }

  return { parts, rest, hinges, dispose: () => created.forEach((g) => g.dispose()) }
}

/**
 * Kenney sedan (CC0) fallback: one fused body plus four hub-centred wheels.
 * The body is stretched to this car's wheelbase and track; wheels are scaled
 * uniformly and moved onto the Car Concept hubs so procedural modules line up.
 */
export function extractKenney(source: Object3D, target: HubLayout): ExtractedVehicle {
  const root = source.clone(true)
  root.updateMatrixWorld(true)
  const parts = new Map<string, Object3D[]>()
  const rest: Object3D[] = []
  const wheels: Object3D[] = []
  let body: Object3D | null = null
  root.traverse((o) => {
    const name = gltfName(o) || o.name
    if (name.startsWith('wheel-')) wheels.push(o)
    else if (name === 'body') body = o
  })
  const hubs = wheels.map((w) => new Vector3().setFromMatrixPosition(w.matrixWorld))
  const src: HubLayout = {
    halfTrack: hubs.reduce((s, h) => s + Math.abs(h.x), 0) / Math.max(1, hubs.length),
    hubY: hubs.reduce((s, h) => s + h.y, 0) / Math.max(1, hubs.length),
    frontZ: Math.max(...hubs.map((h) => h.z)),
    rearZ: Math.min(...hubs.map((h) => h.z)),
  }
  const fit = fitToHubs(src, target)
  if (body) {
    const b = body as Object3D
    const world = b.matrixWorld.clone()
    bakeWorld(b, world)
    const holder = new Group()
    holder.scale.set(...fit.bodyScale)
    holder.position.set(...fit.bodyOffset)
    holder.add(b)
    add(parts, 'body-shell', holder)
  }
  wheels.forEach((w, i) => {
    const world = w.matrixWorld.clone()
    bakeWorld(w, world)
    const hub = hubs[i]
    const holder = new Group()
    holder.position.set(Math.sign(hub.x) * target.halfTrack, target.hubY, hub.z >= 0 ? target.frontZ : target.rearZ)
    w.position.sub(hub)
    holder.scale.setScalar(fit.wheelScale)
    holder.add(w)
    add(parts, 'road-wheels', holder)
  })
  return { parts, rest, hinges: [], dispose: () => {} }
}
