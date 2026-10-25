/**
 * System map — graph model and layout (pure; no React, no DOM).
 *
 * The content (src/content/system-map.json) lists nodes, drivetrain layouts
 * (each an ordered power path) and links. This module turns one layout into a
 * drawable graph:
 *   - the power path runs down the centre column, in order;
 *   - a link marked `kind: "flow"` that leaves a node on the flow — or,
 *     without a kind, a link from a driveline node on the flow to another
 *     driveline or wheels node — is a BRANCH of the flow (all-wheel drive's
 *     second output) and is animated with it;
 *   - every other node is a supporting system, placed in a side column next to
 *     the nodes it is linked to;
 *   - driveline nodes the layout does not use are left out.
 */
import type { SystemMap } from '@/lib/schemas'
import { explorerHref, isExplorerSystemId, systemOfComponent, type ExplorerTarget } from '@/features/vehicle-explorer/explorerSystems'

export type MapNode = SystemMap['nodes'][number]
export type MapLayout = SystemMap['layouts'][number]
export type MapLink = SystemMap['links'][number]

/* ------------------------------------------------------------------------ */
/* Groups                                                                    */
/* ------------------------------------------------------------------------ */

export const GROUP_IDS = ['power', 'driveline', 'wheels', 'chassis', 'electrical', 'support'] as const
export type GroupId = (typeof GROUP_IDS)[number]

export const GROUP_LABEL: Readonly<Record<GroupId, string>> = {
  power: 'Engine',
  driveline: 'Driveline',
  wheels: 'Wheels',
  chassis: 'Chassis',
  electrical: 'Electrical',
  support: 'Engine support',
}

export const groupOf = (node: Pick<MapNode, 'group'>): GroupId =>
  (GROUP_IDS as readonly string[]).includes(node.group ?? '') ? (node.group as GroupId) : 'support'

const isDriveline = (g: GroupId) => g === 'driveline'
/** Groups that only appear when the active layout uses them. */
const isLayoutSpecific = (g: GroupId) => g === 'driveline' || g === 'wheels'

/* ------------------------------------------------------------------------ */
/* Power flow                                                                */
/* ------------------------------------------------------------------------ */

export interface FlowEdge {
  from: string
  to: string
  kind: 'path' | 'branch'
  /** Branches carry the link's label. */
  label?: string
}

export function getLayout(map: SystemMap, layoutId: string): MapLayout | undefined {
  return map.layouts.find((l) => l.id === layoutId)
}

/** Consecutive pairs of the layout's power path, in order. */
export function pathEdges(layout: MapLayout): FlowEdge[] {
  return layout.path.slice(1).map((to, i) => ({ from: layout.path[i], to, kind: 'path' as const }))
}

/**
 * Links that continue the power flow beyond the main path: from a driveline
 * node already on the flow to a driveline or wheels node. Followed
 * transitively (centre differential → front differential → wheels).
 */
export function branchEdges(map: SystemMap, layout: MapLayout): FlowEdge[] {
  const byId = new Map(map.nodes.map((n) => [n.id, n]))
  const onFlow = new Set(layout.path)
  const edges: FlowEdge[] = []
  let grew = true
  while (grew) {
    grew = false
    for (const link of map.links) {
      const from = byId.get(link.from)
      const to = byId.get(link.to)
      if (!from || !to || !onFlow.has(link.from) || link.kind === 'relation') continue
      // An explicit `kind: 'flow'` is a branch; otherwise infer it from the groups (driveline → driveline / wheels).
      if (link.kind !== 'flow' && !(isDriveline(groupOf(from)) && isLayoutSpecific(groupOf(to)))) continue
      const known = edges.some((e) => e.from === link.from && e.to === link.to)
      if (known || (layout.path.includes(link.from) && layout.path.includes(link.to))) continue
      edges.push({ from: link.from, to: link.to, kind: 'branch', label: link.label })
      if (!onFlow.has(link.to)) {
        onFlow.add(link.to)
        grew = true
      }
    }
  }
  return edges
}

export const flowEdges = (map: SystemMap, layout: MapLayout): FlowEdge[] => [...pathEdges(layout), ...branchEdges(map, layout)]

/** Nodes drawn for a layout: its flow plus every supporting system. */
export function visibleNodeIds(map: SystemMap, layout: MapLayout): Set<string> {
  const flow = new Set(layout.path)
  for (const e of branchEdges(map, layout)) flow.add(e.to)
  return new Set(map.nodes.filter((n) => flow.has(n.id) || !isLayoutSpecific(groupOf(n))).map((n) => n.id))
}

/** Links drawn as relationships (not part of the flow) for a layout. */
export function relationLinks(map: SystemMap, layout: MapLayout): MapLink[] {
  const visible = visibleNodeIds(map, layout)
  const flow = flowEdges(map, layout)
  return map.links.filter(
    (l) => visible.has(l.from) && visible.has(l.to) && !flow.some((e) => e.from === l.from && e.to === l.to),
  )
}

/* ------------------------------------------------------------------------ */
/* Geometry                                                                  */
/* ------------------------------------------------------------------------ */

export type Column = 'left' | 'centre' | 'right'

/**
 * Drawing units. Narrow on purpose: on a 375 px phone the diagram scales to
 * about 0.8, which keeps 12-unit labels legible without sideways scrolling.
 */
export const VIEW_WIDTH = 424
export const NODE_HEIGHT = 40
export const ROW_GAP = 60
const TOP = 16
const BOTTOM = 16
/** Outward bow of a link between two nodes of the same side column. */
const BOW = 8
export const COLUMN_X: Readonly<Record<Column, number>> = { left: 68, centre: 212, right: 356 }
export const NODE_WIDTH: Readonly<Record<Column, number>> = { left: 120, centre: 120, right: 120 }

/** Side column for supporting groups (engine support on the left, electrics on the right). */
const GROUP_SIDE: Readonly<Record<GroupId, Exclude<Column, 'centre'>>> = {
  support: 'left',
  power: 'left',
  electrical: 'right',
  driveline: 'right',
  wheels: 'right',
  chassis: 'right',
}
/** Presentation hints that keep the two side columns balanced around the wheels. */
const NODE_SIDE: Readonly<Record<string, Exclude<Column, 'centre'>>> = { brakes: 'left' }

export interface PlacedNode {
  node: MapNode
  column: Column
  row: number
  x: number
  y: number
  width: number
  role: 'path' | 'branch' | 'support'
  /** 1-based position on the power path. */
  step?: number
}

export interface GraphLayout {
  width: number
  height: number
  /** In reading order (row by row, left to right) — also the keyboard order. */
  nodes: PlacedNode[]
  flow: FlowEdge[]
  relations: MapLink[]
}

export const rowY = (row: number) => TOP + NODE_HEIGHT / 2 + row * ROW_GAP

/** Lay out one drivetrain layout of the map (see module comment). */
export function layoutGraph(map: SystemMap, layoutId: string): GraphLayout {
  const layout = getLayout(map, layoutId) ?? map.layouts[0]
  const byId = new Map(map.nodes.map((n) => [n.id, n]))
  const placed = new Map<string, PlacedNode>()
  const used: Record<Column, Set<number>> = { left: new Set(), centre: new Set(), right: new Set() }

  const place = (node: MapNode, column: Column, row: number, role: PlacedNode['role'], step?: number) => {
    used[column].add(row)
    placed.set(node.id, { node, column, row, x: COLUMN_X[column], y: rowY(row), width: NODE_WIDTH[column], role, step })
  }
  /** Nearest free row to `want` (ties go downwards), never above the top. */
  const freeRow = (column: Column, want: number) => {
    const w = Math.max(0, Math.round(want))
    for (let d = 0; ; d++) {
      if (!used[column].has(w + d)) return w + d
      if (d > 0 && w - d >= 0 && !used[column].has(w - d)) return w - d
    }
  }

  // 1. The power path, top to bottom.
  layout.path.forEach((id, i) => {
    const node = byId.get(id)
    if (node) place(node, 'centre', i, 'path', i + 1)
  })

  // 2. Branches of the flow, beside the node they leave.
  const branches = branchEdges(map, layout)
  for (const e of branches) {
    const node = byId.get(e.to)
    const from = placed.get(e.from)
    if (node && from && !placed.has(e.to)) place(node, 'right', freeRow('right', from.row + 1), 'branch')
  }

  // 3. Supporting systems, next to whatever they are linked to (repeat until nothing moves).
  const visible = visibleNodeIds(map, layout)
  const pending = map.nodes.filter((n) => visible.has(n.id) && !placed.has(n.id))
  const sides = new Map(pending.map((n) => [n.id, NODE_SIDE[n.id] ?? GROUP_SIDE[groupOf(n)]]))
  let progress = true
  while (pending.length && progress) {
    progress = false
    for (let i = 0; i < pending.length; i++) {
      const n = pending[i]
      const partners = map.links
        .flatMap((l) => (l.from === n.id ? [l.to] : l.to === n.id ? [l.from] : []))
        .flatMap((id) => placed.get(id) ?? [])
      if (!partners.length) continue
      const want = partners.reduce((s, p) => s + p.row, 0) / partners.length
      const column = sides.get(n.id)!
      place(n, column, freeRow(column, want), 'support')
      pending.splice(i, 1)
      i--
      progress = true
    }
  }
  // Unlinked leftovers go to the bottom of their column.
  for (const n of pending) {
    const column = sides.get(n.id)!
    place(n, column, freeRow(column, Math.max(-1, ...used[column]) + 1), 'support')
  }

  const nodes = [...placed.values()].sort((a, b) => a.row - b.row || a.x - b.x)
  const maxRow = Math.max(0, ...nodes.map((n) => n.row))
  return {
    width: VIEW_WIDTH,
    height: rowY(maxRow) + NODE_HEIGHT / 2 + BOTTOM,
    nodes,
    flow: [...pathEdges(layout), ...branches],
    relations: relationLinks(map, layout),
  }
}

/**
 * SVG path between two placed nodes: straight down the centre column,
 * an S-curve between columns, or a bow on the outer side within one side column.
 */
export function edgePath(a: PlacedNode, b: PlacedNode): string {
  const h = NODE_HEIGHT / 2
  if (a.column === b.column && a.column === 'centre') {
    const down = b.y > a.y
    return `M ${a.x} ${a.y + (down ? h : -h)} L ${b.x} ${b.y + (down ? -h : h)}`
  }
  if (a.column === b.column) {
    const sign = a.column === 'left' ? -1 : 1
    const ax = a.x + (sign * a.width) / 2
    const bx = b.x + (sign * b.width) / 2
    const bow = (sign > 0 ? Math.max(ax, bx) : Math.min(ax, bx)) + sign * BOW
    return `M ${ax} ${a.y} C ${bow} ${a.y} ${bow} ${b.y} ${bx} ${b.y}`
  }
  const right = b.x > a.x
  const ax = a.x + ((right ? 1 : -1) * a.width) / 2
  const bx = b.x - ((right ? 1 : -1) * b.width) / 2
  const mid = (ax + bx) / 2
  return `M ${ax} ${a.y} C ${mid} ${a.y} ${mid} ${b.y} ${bx} ${b.y}`
}

/** Split a label into at most two lines of about `max` characters (word wrap). */
export function labelLines(label: string, max = 13): string[] {
  if (label.length <= max) return [label]
  const words = label.split(' ')
  let first = words[0]
  let i = 1
  while (i < words.length && `${first} ${words[i]}`.length <= max) first = `${first} ${words[i++]}`
  return i < words.length ? [first, words.slice(i).join(' ')] : [first]
}

/* ------------------------------------------------------------------------ */
/* Where each node leads                                                     */
/* ------------------------------------------------------------------------ */

/**
 * Map node → what the vehicle explorer shows for it (its car is front-wheel
 * drive, so it has no propeller shaft or centre differential). null: the
 * explorer has nothing specific to show.
 */
export const NODE_EXPLORER_TARGET: Readonly<Record<string, Partial<ExplorerTarget> | null>> = {
  engine: { componentId: 'engine-unit' },
  clutch: { componentId: 'clutch-bellhousing' },
  gearbox: { componentId: 'transaxle' },
  transaxle: { componentId: 'transaxle' },
  'centre-differential': null,
  propshaft: null,
  differential: { componentId: 'final-drive' },
  'front-differential': { componentId: 'final-drive' },
  driveshafts: { componentId: 'driveshafts' },
  wheels: { componentId: 'road-wheels' },
  brakes: { systemId: 'braking' },
  suspension: { systemId: 'suspension' },
  steering: { systemId: 'steering' },
  battery: { componentId: 'battery' },
  starter: { componentId: 'starter-motor' },
  alternator: { componentId: 'alternator' },
  ignition: null,
  cooling: { systemId: 'cooling' },
  lubrication: null,
  'fuel-system': { componentId: 'fuel-tank' },
  exhaust: { systemId: 'exhaust' },
  'air-conditioning': null,
}

/** Is a target one the explorer can actually show? */
export function isValidExplorerTarget(t: Partial<ExplorerTarget>): boolean {
  if (t.componentId) return systemOfComponent(t.componentId) !== null
  return isExplorerSystemId(t.systemId)
}

export interface NodeLinks {
  /** /labs/<labId>?component=<id> when a lab models this node. */
  lab: string | null
  /** /explore?… when the vehicle explorer shows it. */
  explorer: string | null
}

export function nodeLinks(node: MapNode): NodeLinks {
  const lab = node.focus
    ? `/labs/${encodeURIComponent(node.focus.labId)}${node.focus.componentId ? `?component=${encodeURIComponent(node.focus.componentId)}` : ''}`
    : null
  const target = NODE_EXPLORER_TARGET[node.id]
  return { lab, explorer: target && isValidExplorerTarget(target) ? explorerHref(target) : null }
}
