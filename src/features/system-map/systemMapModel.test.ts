import { describe, expect, it } from 'vitest'
import rawMap from '@/content/system-map.json'
import { labs } from '@/features/labs/registry'
import { findReferenceErrors, getComponent, getTopic, sceneComponents, topics, categories } from '@/lib/content'
import { SystemMapSchema } from '@/lib/schemas'
import {
  NODE_EXPLORER_TARGET,
  branchEdges,
  edgePath,
  flowEdges,
  getLayout,
  isValidExplorerTarget,
  labelLines,
  layoutGraph,
  nodeLinks,
  pathEdges,
  relationLinks,
  visibleNodeIds,
} from './systemMapModel'

const map = SystemMapSchema.parse(rawMap)
const layout = (id: string) => getLayout(map, id)!

describe('system-map.json', () => {
  it('is valid against SystemMapSchema', () => {
    expect(SystemMapSchema.safeParse(rawMap).success).toBe(true)
  })

  it('has no broken references (topics, components, labs, map nodes)', () => {
    const errors = findReferenceErrors({ categories, topics, components: sceneComponents, systemMap: map }, { labIds: labs.map((l) => l.id) })
    expect(errors.filter((e) => e.file.startsWith('map'))).toEqual([])
  })

  it('names only existing topics, and focuses only parts of the lab it names', () => {
    for (const n of map.nodes) {
      expect(n.topicId, n.id).toBeDefined()
      expect(getTopic(n.topicId!), `${n.id} → ${n.topicId}`).toBeDefined()
      if (n.focus?.componentId) expect(getComponent(n.focus.componentId)?.systemId, `${n.id} → ${n.focus.componentId}`).toBe(n.focus.labId)
    }
  })

  it('has unique node ids and the core systems', () => {
    const ids = map.nodes.map((n) => n.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of [
      'engine', 'clutch', 'gearbox', 'transaxle', 'propshaft', 'differential', 'driveshafts', 'wheels', 'brakes', 'suspension', 'steering',
      'battery', 'starter', 'alternator', 'cooling', 'lubrication', 'fuel-system', 'exhaust',
    ])
      expect(ids, id).toContain(id)
  })

  it('orders each power path from the engine to the wheels', () => {
    expect(layout('rwd').path).toEqual(['engine', 'clutch', 'gearbox', 'propshaft', 'differential', 'driveshafts', 'wheels'])
    expect(layout('fwd').path).toEqual(['engine', 'clutch', 'transaxle', 'driveshafts', 'wheels'])
    expect(layout('awd').path).toEqual(['engine', 'clutch', 'gearbox', 'centre-differential', 'propshaft', 'differential', 'driveshafts', 'wheels'])
    for (const l of map.layouts) {
      expect(new Set(l.path).size, l.id).toBe(l.path.length)
      expect(l.path[0]).toBe('engine')
      expect(l.path.at(-1)).toBe('wheels')
      // The clutch always sits between the engine and the gearbox / transaxle.
      expect(l.path.indexOf('clutch')).toBe(1)
    }
  })

  it('includes the cooling ↔ engine and alternator ↔ battery relationships', () => {
    const has = (a: string, b: string) => map.links.some((l) => (l.from === a && l.to === b) || (l.from === b && l.to === a))
    expect(has('cooling', 'engine')).toBe(true)
    expect(has('alternator', 'battery')).toBe(true)
    expect(has('battery', 'starter')).toBe(true)
  })
})

describe('power flow', () => {
  it('turns a path into ordered consecutive edges', () => {
    expect(pathEdges(layout('fwd')).map((e) => `${e.from}>${e.to}`)).toEqual([
      'engine>clutch',
      'clutch>transaxle',
      'transaxle>driveshafts',
      'driveshafts>wheels',
    ])
  })

  it('branches only all-wheel drive, from the centre differential to the front axle', () => {
    expect(branchEdges(map, layout('rwd'))).toEqual([])
    expect(branchEdges(map, layout('fwd'))).toEqual([])
    expect(branchEdges(map, layout('awd')).map((e) => `${e.from}>${e.to}`)).toEqual(['centre-differential>front-differential', 'front-differential>wheels'])
  })

  it('marks the all-wheel-drive split explicitly as flow in the content', () => {
    const flowLinks = map.links.filter((l) => l.kind === 'flow').map((l) => `${l.from}>${l.to}`)
    expect(flowLinks).toEqual(['centre-differential>front-differential', 'front-differential>wheels'])
  })

  it('follows an explicit link kind over the group rule', () => {
    const awd = layout('awd')
    // 'relation' keeps a driveline → driveline link out of the flow…
    const asRelation = { ...map, links: map.links.map((l) => (l.from === 'centre-differential' ? { ...l, kind: 'relation' as const } : l)) }
    expect(branchEdges(asRelation, awd)).toEqual([])
    expect(relationLinks(asRelation, awd).some((l) => l.from === 'centre-differential')).toBe(false)
    // …and 'flow' makes a branch whatever the groups (inferred links still work without a kind).
    const unmarked = { ...map, links: map.links.map(({ kind: _kind, ...l }) => l) }
    expect(branchEdges(unmarked, awd)).toEqual(branchEdges(map, awd))
    const extra = { ...map, links: [...map.links, { from: 'gearbox', to: 'cooling', label: 'test', kind: 'flow' as const }] }
    expect(branchEdges(extra, awd).map((e) => `${e.from}>${e.to}`)).toContain('gearbox>cooling')
  })

  it('draws only the driveline parts a layout uses, and every supporting system', () => {
    const fwd = visibleNodeIds(map, layout('fwd'))
    expect(fwd.has('propshaft')).toBe(false)
    expect(fwd.has('gearbox')).toBe(false)
    expect(fwd.has('transaxle')).toBe(true)
    expect(visibleNodeIds(map, layout('rwd')).has('transaxle')).toBe(false)
    expect(visibleNodeIds(map, layout('awd')).has('front-differential')).toBe(true)
    for (const l of map.layouts) for (const id of ['cooling', 'battery', 'brakes', 'steering', 'exhaust']) expect(visibleNodeIds(map, l).has(id)).toBe(true)
  })

  it('never draws a flow edge again as a relationship', () => {
    const awd = layout('awd')
    const flow = flowEdges(map, awd).map((e) => `${e.from}>${e.to}`)
    for (const l of relationLinks(map, awd)) expect(flow).not.toContain(`${l.from}>${l.to}`)
  })
})

describe('layoutGraph', () => {
  for (const l of ['rwd', 'fwd', 'awd']) {
    it(`lays out ${l} without overlaps, the path down the centre in order`, () => {
      const g = layoutGraph(map, l)
      const cells = g.nodes.map((n) => `${n.column}:${n.row}`)
      expect(new Set(cells).size).toBe(cells.length)
      const path = g.nodes.filter((n) => n.role === 'path').sort((a, b) => a.step! - b.step!)
      expect(path.map((n) => n.node.id)).toEqual(layout(l).path)
      expect(path.every((n) => n.column === 'centre')).toBe(true)
      for (let i = 1; i < path.length; i++) expect(path[i].y).toBeGreaterThan(path[i - 1].y)
      // Inside the drawing.
      for (const n of g.nodes) {
        expect(n.x - n.width / 2).toBeGreaterThanOrEqual(0)
        expect(n.x + n.width / 2).toBeLessThanOrEqual(g.width)
        expect(n.y).toBeLessThan(g.height)
      }
      // Reading order: row by row.
      for (let i = 1; i < g.nodes.length; i++) expect(g.nodes[i].row).toBeGreaterThanOrEqual(g.nodes[i - 1].row)
      // Every edge has both ends drawn and a finite path.
      const byId = new Map(g.nodes.map((n) => [n.node.id, n]))
      for (const e of [...g.flow, ...g.relations]) {
        const a = byId.get(e.from)
        const b = byId.get(e.to)
        expect(a && b, `${e.from}>${e.to}`).toBeTruthy()
        expect(edgePath(a!, b!)).not.toMatch(/NaN|Infinity/)
      }
    })
  }

  it('places supporting systems beside what they serve', () => {
    const g = layoutGraph(map, 'fwd')
    const at = (id: string) => g.nodes.find((n) => n.node.id === id)!
    expect(at('cooling').row).toBe(at('engine').row)
    expect(at('cooling').column).toBe('left')
    expect(at('starter').column).toBe('right')
    expect(at('brakes').row).toBe(at('wheels').row)
  })
})

describe('node links', () => {
  it('focuses a lab part when a lab models the node', () => {
    const clutch = map.nodes.find((n) => n.id === 'clutch')!
    expect(nodeLinks(clutch)).toEqual({ lab: '/labs/transmission?component=clutch-disc', explorer: '/explore?component=clutch-bellhousing' })
    const cooling = map.nodes.find((n) => n.id === 'cooling')!
    expect(nodeLinks(cooling)).toEqual({ lab: null, explorer: '/explore?system=cooling' })
  })

  it('maps every node to a real explorer target or explicitly to none', () => {
    for (const n of map.nodes) {
      expect(n.id in NODE_EXPLORER_TARGET, n.id).toBe(true)
      const t = NODE_EXPLORER_TARGET[n.id]
      if (t) expect(isValidExplorerTarget(t), n.id).toBe(true)
    }
    // Every node leads somewhere in 3D or to a lesson.
    for (const n of map.nodes) expect(!!nodeLinks(n).lab || !!nodeLinks(n).explorer || !!n.topicId, n.id).toBe(true)
  })

  it('wraps long labels onto two lines', () => {
    expect(labelLines('Engine')).toEqual(['Engine'])
    expect(labelLines('Centre differential')).toEqual(['Centre', 'differential'])
    expect(labelLines('Wheels & tyres')).toEqual(['Wheels &', 'tyres'])
  })
})
