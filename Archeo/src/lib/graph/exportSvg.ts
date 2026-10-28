import type { PositionedEdge, PositionedNode } from './transform'

export function renderGraphSvg(nodes: PositionedNode[], edges: PositionedEdge[]): string {
  const maxX = Math.max(1_200, ...nodes.map((node) => node.x + 270))
  const maxY = Math.max(600, ...nodes.map((node) => node.y + 86))
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const lines = edges.flatMap((edge, index) => {
    const from = byId.get(edge.source)
    const to = byId.get(edge.target)
    if (!from || !to) return []
    const startX = from.x + 240
    const startY = from.y + 32
    const endX = to.x
    const endY = to.y + 32
    const midX = Math.round((startX + endX) / 2)
    const label = escapeXml(edge.label)
    return [`<path d="M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}" fill="none" stroke="${edge.status === 'unresolved' ? '#fb923c' : '#526174'}" stroke-width="1.5" marker-end="url(#arrow)"/>`, `<text x="${midX}" y="${Math.min(startY, endY) - 8 - (index % 2) * 12}" fill="#94a3b8" font-size="11" text-anchor="middle">${label}</text>`]
  }).join('\n')
  const boxes = nodes.map((node) => {
    const color = node.kind === 'project' ? '#60a5fa' : node.kind === 'module' ? '#a78bfa' : node.kind === 'file' ? '#34d399' : node.kind === 'package' ? '#fbbf24' : '#fb923c'
    const path = node.path ? `<text x="${node.x + 14}" y="${node.y + 55}" fill="#94a3b8" font-size="10">${escapeXml(node.path)}</text>` : ''
    return `<g><rect x="${node.x}" y="${node.y}" width="240" height="76" rx="10" fill="#15191f" stroke="${color}" stroke-width="1.5"/><text x="${node.x + 14}" y="${node.y + 22}" fill="${color}" font-size="10" font-weight="700">${escapeXml(node.kind.toUpperCase())}</text><text x="${node.x + 14}" y="${node.y + 43}" fill="#f8fafc" font-size="13">${escapeXml(node.label)}</text>${path}</g>`
  }).join('\n')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${maxX}" height="${maxY}" viewBox="0 0 ${maxX} ${maxY}"><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#526174"/></marker></defs><rect width="100%" height="100%" fill="#0b0c0e"/>${lines}${boxes}</svg>`
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!)
}
