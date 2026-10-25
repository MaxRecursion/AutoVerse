import type { FlowDiagram } from '@/lib/schemas'

/**
 * Pure layered layout for small lesson flow diagrams (≈3–15 nodes).
 *
 * Nodes are assigned to layers by longest path from the sources (cycles are
 * tolerated: back edges are detected by DFS and drawn as loops), ordered
 * within a layer by one barycentre pass to reduce crossings, then placed
 * left→right (horizontal) or top→bottom (vertical, for narrow screens).
 */

export type FlowOrientation = 'horizontal' | 'vertical'
type FlowNode = FlowDiagram['nodes'][number]

export interface FlowNodeLayout {
  id: string
  node: FlowNode
  layer: number
  x: number
  y: number
  w: number
  h: number
  lines: string[]
}

export interface FlowEdgeLayout {
  key: string
  from: string
  to: string
  label?: string
  /** SVG path data. */
  d: string
  labelX: number
  labelY: number
  /** Edge that closes a loop (drawn around the diagram). */
  back: boolean
}

export interface FlowLayout {
  orientation: FlowOrientation
  width: number
  height: number
  nodes: FlowNodeLayout[]
  edges: FlowEdgeLayout[]
}

export interface FlowLayoutOptions {
  orientation: FlowOrientation
  /** Available width in px; vertical layouts narrow their nodes to fit when possible. */
  maxWidth?: number
}

export const FLOW_METRICS = {
  margin: 12,
  lineHeight: 17,
  padY: 13,
  minNodeHeight: 46,
  charWidth: 7.2,
  maxLines: 3,
  loopSpace: 44,
  horizontal: { nodeWidth: 168, layerGap: 64, siblingGap: 18 },
  vertical: { nodeWidth: 224, minNodeWidth: 112, layerGap: 40, siblingGap: 16 },
} as const

/** Greedy word wrap into at most `maxLines` lines of `maxChars`; overflow ends with an ellipsis. */
export function wrapLabel(text: string, maxChars: number, maxLines: number = FLOW_METRICS.maxLines): string[] {
  const limit = Math.max(4, Math.floor(maxChars))
  const words = text.trim().split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  const push = (line: string) => lines.push(line)
  for (let word of words) {
    while (word.length > limit) {
      if (current) {
        push(current)
        current = ''
      }
      push(word.slice(0, limit - 1) + '-')
      word = word.slice(limit - 1)
    }
    if (!current) current = word
    else if (current.length + 1 + word.length <= limit) current += ` ${word}`
    else {
      push(current)
      current = word
    }
  }
  if (current) push(current)
  if (lines.length <= maxLines) return lines
  const kept = lines.slice(0, maxLines)
  const last = kept[maxLines - 1] ?? ''
  kept[maxLines - 1] = `${last.slice(0, Math.max(1, limit - 1)).trimEnd()}…`
  return kept
}

interface Edge {
  from: string
  to: string
  label?: string
}

/** Longest-path layering; returns each node's layer and the indices of back (cycle-closing) edges. */
export function assignLayers(nodeIds: readonly string[], edges: readonly Edge[]): { layers: Map<string, number>; back: Set<number> } {
  const out = new Map<string, number[]>(nodeIds.map((id) => [id, []]))
  const hasIncoming = new Set(edges.map((e) => e.to))
  edges.forEach((e, i) => out.get(e.from)?.push(i))

  // DFS from sources first (input order), then any node left in a pure cycle.
  const back = new Set<number>()
  const state = new Map<string, 'open' | 'done'>()
  const dfs = (u: string) => {
    state.set(u, 'open')
    for (const i of out.get(u) ?? []) {
      const v = edges[i].to
      const s = state.get(v)
      if (s === 'open') back.add(i)
      else if (!s) dfs(v)
    }
    state.set(u, 'done')
  }
  for (const id of nodeIds) if (!hasIncoming.has(id) && !state.has(id)) dfs(id)
  for (const id of nodeIds) if (!state.has(id)) dfs(id)

  // Kahn's algorithm over forward edges.
  const indeg = new Map(nodeIds.map((id) => [id, 0]))
  edges.forEach((e, i) => {
    if (!back.has(i)) indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1)
  })
  const layers = new Map(nodeIds.map((id) => [id, 0]))
  const queue = nodeIds.filter((id) => indeg.get(id) === 0)
  while (queue.length) {
    const u = queue.shift() as string
    for (const i of out.get(u) ?? []) {
      if (back.has(i)) continue
      const v = edges[i].to
      layers.set(v, Math.max(layers.get(v) ?? 0, (layers.get(u) ?? 0) + 1))
      const d = (indeg.get(v) ?? 0) - 1
      indeg.set(v, d)
      if (d === 0) queue.push(v)
    }
  }
  return { layers, back }
}

const mid = (a: number, b: number, c: number, d: number) => (a + 3 * b + 3 * c + d) / 8

export function layoutFlow(flow: FlowDiagram, options: FlowLayoutOptions): FlowLayout {
  const { orientation } = options
  const M = FLOW_METRICS
  const nodeIds = flow.nodes.map((n) => n.id)
  const known = new Set(nodeIds)
  const edges: Edge[] = flow.edges.filter((e) => known.has(e.from) && known.has(e.to) && e.from !== e.to)
  const { layers, back } = assignLayers(nodeIds, edges)

  // Group into layers, then one barycentre pass (top-down) to reduce crossings.
  const layerCount = Math.max(0, ...layers.values()) + (nodeIds.length ? 1 : 0)
  const grouped: string[][] = Array.from({ length: layerCount }, () => [])
  nodeIds.forEach((id) => grouped[layers.get(id) ?? 0].push(id))
  const position = new Map<string, number>()
  grouped.forEach((ids) => ids.forEach((id, i) => position.set(id, i)))
  for (let l = 1; l < grouped.length; l++) {
    const bary = (id: string) => {
      const preds = edges.filter((e, i) => !back.has(i) && e.to === id).map((e) => position.get(e.from) ?? 0)
      return preds.length ? preds.reduce((a, b) => a + b, 0) / preds.length : (position.get(id) ?? 0)
    }
    const scored = grouped[l].map((id, i) => ({ id, b: bary(id), i }))
    scored.sort((a, b) => a.b - b.b || a.i - b.i)
    grouped[l] = scored.map((s) => s.id)
    grouped[l].forEach((id, i) => position.set(id, i))
  }

  // Node sizes.
  const widest = Math.max(1, ...grouped.map((g) => g.length))
  let nodeWidth: number = orientation === 'horizontal' ? M.horizontal.nodeWidth : M.vertical.nodeWidth
  if (orientation === 'vertical' && options.maxWidth) {
    const fit = Math.floor((options.maxWidth - 2 * M.margin - (widest - 1) * M.vertical.siblingGap) / widest)
    nodeWidth = Math.max(M.vertical.minNodeWidth, Math.min(M.vertical.nodeWidth, fit))
  }
  const maxChars = (nodeWidth - 22) / M.charWidth
  const byId = new Map(flow.nodes.map((n) => [n.id, n]))
  const sized = new Map(
    nodeIds.map((id) => {
      const lines = wrapLabel(byId.get(id)?.label ?? id, maxChars)
      return [id, { lines, h: Math.max(M.minNodeHeight, 2 * M.padY + lines.length * M.lineHeight) }]
    }),
  )
  const hOf = (id: string) => sized.get(id)?.h ?? M.minNodeHeight

  const placed = new Map<string, FlowNodeLayout>()
  const hasBack = back.size > 0
  let width: number
  let height: number

  if (orientation === 'horizontal') {
    const { layerGap, siblingGap } = M.horizontal
    const colHeights = grouped.map((ids) => ids.reduce((s, id) => s + hOf(id), 0) + Math.max(0, ids.length - 1) * siblingGap)
    const inner = Math.max(0, ...colHeights)
    grouped.forEach((ids, l) => {
      let y = M.margin + (inner - colHeights[l]) / 2
      const x = M.margin + l * (nodeWidth + layerGap)
      for (const id of ids) {
        placed.set(id, { id, node: byId.get(id) as FlowNode, layer: l, x, y, w: nodeWidth, h: hOf(id), lines: sized.get(id)?.lines ?? [] })
        y += hOf(id) + siblingGap
      }
    })
    width = 2 * M.margin + layerCount * nodeWidth + Math.max(0, layerCount - 1) * layerGap
    height = 2 * M.margin + inner + (hasBack ? M.loopSpace : 0)
  } else {
    const { layerGap, siblingGap } = M.vertical
    const rowWidths = grouped.map((ids) => ids.length * nodeWidth + Math.max(0, ids.length - 1) * siblingGap)
    const inner = Math.max(0, ...rowWidths)
    let y = M.margin
    grouped.forEach((ids, l) => {
      const rowH = Math.max(0, ...ids.map(hOf))
      let x = M.margin + (inner - rowWidths[l]) / 2
      for (const id of ids) {
        const h = hOf(id)
        placed.set(id, { id, node: byId.get(id) as FlowNode, layer: l, x, y: y + (rowH - h) / 2, w: nodeWidth, h, lines: sized.get(id)?.lines ?? [] })
        x += nodeWidth + siblingGap
      }
      y += rowH + layerGap
    })
    width = 2 * M.margin + inner + (hasBack ? M.loopSpace : 0)
    height = Math.max(2 * M.margin, y - layerGap + M.margin)
  }

  const laidEdges: FlowEdgeLayout[] = edges.map((e, i) => {
    const a = placed.get(e.from) as FlowNodeLayout
    const b = placed.get(e.to) as FlowNodeLayout
    const isBack = back.has(i)
    let p: [number, number, number, number, number, number, number, number]
    if (orientation === 'horizontal') {
      if (isBack) {
        const below = height - M.margin - 6
        p = [a.x + a.w / 2, a.y + a.h, a.x + a.w / 2, below, b.x + b.w / 2, below, b.x + b.w / 2, b.y + b.h]
      } else {
        const sx = a.x + a.w
        const sy = a.y + a.h / 2
        const ex = b.x
        const ey = b.y + b.h / 2
        const dx = Math.max(20, (ex - sx) / 2)
        p = [sx, sy, sx + dx, sy, ex - dx, ey, ex, ey]
      }
    } else if (isBack) {
      const right = width - M.margin - 6
      p = [a.x + a.w, a.y + a.h / 2, right, a.y + a.h / 2, right, b.y + b.h / 2, b.x + b.w, b.y + b.h / 2]
    } else {
      const sx = a.x + a.w / 2
      const sy = a.y + a.h
      const ex = b.x + b.w / 2
      const ey = b.y
      const dy = Math.max(16, (ey - sy) / 2)
      p = [sx, sy, sx, sy + dy, ex, ey - dy, ex, ey]
    }
    const r = (n: number) => Math.round(n * 10) / 10
    return {
      key: `${e.from}->${e.to}-${i}`,
      from: e.from,
      to: e.to,
      label: e.label,
      d: `M${r(p[0])} ${r(p[1])} C${r(p[2])} ${r(p[3])} ${r(p[4])} ${r(p[5])} ${r(p[6])} ${r(p[7])}`,
      labelX: r(mid(p[0], p[2], p[4], p[6])),
      labelY: r(mid(p[1], p[3], p[5], p[7])),
      back: isBack,
    }
  })

  return {
    orientation,
    width: Math.ceil(width),
    height: Math.ceil(height),
    nodes: nodeIds.map((id) => placed.get(id) as FlowNodeLayout),
    edges: laidEdges,
  }
}
