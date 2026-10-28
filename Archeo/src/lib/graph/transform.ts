import type { AnalysisResultData } from '@/lib/validation/schemas'

export type GraphMode = 'overview' | 'files'
export interface GraphFilter { files: boolean; packages: boolean; unresolved: boolean }
export interface PositionedNode { id: string; label: string; kind: string; path?: string; x: number; y: number; fileCount?: number }
export interface PositionedEdge { source: string; target: string; label: string; status?: string }

export function selectGraph(result: AnalysisResultData, mode: GraphMode, filter: GraphFilter): { nodes: PositionedNode[]; edges: PositionedEdge[] } {
  const fileById = new Map(result.nodes.filter((node) => node.type === 'file').map((node) => [node.id, node]))
  const moduleByFile = (fileId: string): string | undefined => {
    const file = fileById.get(fileId)
    return file?.path ? `module:${file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : ''}` : undefined
  }
  const visibleNode = (node: AnalysisResultData['nodes'][number]) => {
    if (node.type === 'file') return mode === 'files' && filter.files
    if (node.type === 'package') return filter.packages
    if (node.type === 'unresolved') return filter.unresolved
    return true
  }
  const visibleById = new Map(result.nodes.filter(visibleNode).map((node) => [node.id, node]))
  const edgeMap = new Map<string, PositionedEdge>()
  for (const edge of result.edges) {
    let source = edge.source
    let target = edge.target
    if (mode === 'overview' && (edge.type === 'imports' || edge.type === 'references-package')) {
      if (fileById.has(source)) source = moduleByFile(source) ?? 'project:root'
      if (fileById.has(target)) target = moduleByFile(target) ?? 'project:root'
      if (source === target) continue
    }
    if (!visibleById.has(source) || !visibleById.has(target)) continue
    const key = `${edge.type}:${source}->${target}:${edge.status ?? ''}`
    const prior = edgeMap.get(key)
    if (prior) {
      if (edge.evidence.length > 0) prior.label = `${edge.type === 'contains' ? 'Contains' : edge.type === 'references-package' ? 'Package' : 'Imports'} · ${Number(prior.label.split('·')[1]?.trim() || '1') + edge.evidence.length}`
    } else edgeMap.set(key, {
      source,
      target,
      label: edge.type === 'contains' ? 'Contains · path' : edge.type === 'references-package' ? 'Package' : edge.status === 'unresolved' ? 'Unresolved import' : 'Imports',
      ...(edge.status ? { status: edge.status } : {}),
    })
  }
  const columns = ['project', 'module', 'file', 'package', 'unresolved']
  const nodes: PositionedNode[] = []
  for (const kind of columns) {
    const group = [...visibleById.values()].filter((node) => node.type === kind).sort((a, b) => (a.path ?? '').localeCompare(b.path ?? '') || a.label.localeCompare(b.label))
    group.forEach((node, index) => nodes.push({ id: node.id, label: node.label, kind: node.type, ...(node.path ? { path: node.path } : {}), ...(node.fileCount !== undefined ? { fileCount: node.fileCount } : {}), x: 80 + columns.indexOf(kind) * 330, y: 60 + index * 116 }))
  }
  const visibleNodeIds = new Set(nodes.map((node) => node.id))
  return { nodes, edges: [...edgeMap.values()].filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)) }
}
