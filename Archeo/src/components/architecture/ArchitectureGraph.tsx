import { useMemo, useState } from 'react'
import { Background, Controls, Handle, MarkerType, MiniMap, Position, ReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react'
import { Download, FileCode2, Layers3, Package, Search, TriangleAlert, Workflow } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { renderGraphSvg } from '@/lib/graph/exportSvg'
import { selectGraph, type GraphFilter, type GraphMode } from '@/lib/graph/transform'
import type { AnalysisResultData } from '@/lib/validation/schemas'

interface FlowNodeData extends Record<string, unknown> { label: string; kind: string; path?: string; fileCount?: number; matches: boolean }
type ArchNode = Node<FlowNodeData, 'arch'>
const nodeTypes = { arch: ArchNodeView }

function ArchNodeView({ data, selected }: NodeProps<ArchNode>) {
  const icon = data.kind === 'project' ? <Workflow size={14} /> : data.kind === 'module' ? <Layers3 size={14} /> : data.kind === 'file' ? <FileCode2 size={14} /> : data.kind === 'package' ? <Package size={14} /> : <TriangleAlert size={14} />
  return <div className={`flow-card flow-${data.kind} ${selected ? 'is-selected' : ''} ${data.matches ? 'is-match' : ''}`}>
    <Handle type="target" position={Position.Left} />
    <span className="flow-kind">{icon}{data.kind}</span><strong title={data.label}>{data.label}</strong>
    {data.path && <small title={data.path}>{data.path}</small>}
    {data.fileCount !== undefined && <span className="flow-count">{data.fileCount} files</span>}
    <Handle type="source" position={Position.Right} />
  </div>
}

export function ArchitectureGraph({ result, selectedNodeId, onSelectNode }: { result: AnalysisResultData; selectedNodeId: string | null; onSelectNode: (id: string) => void }) {
  const [mode, setMode] = useState<GraphMode>('overview')
  const [filter, setFilter] = useState<GraphFilter>({ files: true, packages: true, unresolved: true })
  const [query, setQuery] = useState('')
  const selectedFile = result.nodes.some((node) => node.id === selectedNodeId && node.type === 'file')
  const activeMode: GraphMode = selectedFile ? 'files' : mode
  const graph = useMemo(() => selectGraph(result, activeMode, filter), [result, activeMode, filter])
  const matches = query.trim().toLowerCase()
  const nodes = useMemo<ArchNode[]>(() => graph.nodes.map((node) => ({
    id: node.id, type: 'arch', position: { x: node.x, y: node.y }, data: { label: node.label, kind: node.kind, path: node.path, fileCount: node.fileCount, matches: Boolean(matches && `${node.label} ${node.path ?? ''}`.toLowerCase().includes(matches)) },
    selected: node.id === selectedNodeId,
  })), [graph.nodes, matches, selectedNodeId])
  const edges = useMemo<Edge[]>(() => graph.edges.map((edge, index) => ({
    id: `edge-${index}-${edge.source}-${edge.target}`,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed, color: edge.status === 'unresolved' ? '#fb923c' : '#64748b' },
    style: { stroke: edge.status === 'unresolved' ? '#fb923c' : '#526174', strokeWidth: 1.4, strokeDasharray: edge.status === 'unresolved' ? '4 4' : undefined },
    labelStyle: { fill: '#94a3b8', fontSize: 10 },
    labelBgStyle: { fill: '#101317', fillOpacity: 0.95 },
    labelBgPadding: [5, 3] as [number, number],
  })), [graph.edges])

  function exportSvg() {
    const svg = renderGraphSvg(graph.nodes, graph.edges)
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${result.repository.name}-architecture.svg`
    link.click()
    URL.revokeObjectURL(url)
  }

  return <section className="graph-panel" aria-label="Architecture graph">
    <div className="graph-toolbar">
      <div className="graph-toolbar-title"><div className="panel-kicker">ARCHITECTURE MAP</div><div className="graph-subtitle">{graph.nodes.length} nodes <span>·</span> {graph.edges.length} relationships</div></div>
      <div className="graph-tools">
        <div className="graph-search"><Search size={14} /><Input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search graph" placeholder="Find a node" /></div>
        <div className="mode-toggle" aria-label="Graph detail level"><button className={activeMode === 'overview' ? 'active' : ''} onClick={() => setMode('overview')}>Overview</button><button className={activeMode === 'files' ? 'active' : ''} onClick={() => setMode('files')}>Files</button></div>
        <Button variant="secondary" size="sm" onClick={exportSvg} aria-label="Export architecture graph as SVG"><Download size={14} /> SVG</Button>
      </div>
    </div>
    <div className="graph-filter-row" aria-label="Graph filters">
      <span>Show</span>
      <label><input type="checkbox" checked={filter.files} onChange={(event) => setFilter({ ...filter, files: event.target.checked })} /> Files</label>
      <label><input type="checkbox" checked={filter.packages} onChange={(event) => setFilter({ ...filter, packages: event.target.checked })} /> Packages</label>
      <label><input type="checkbox" checked={filter.unresolved} onChange={(event) => setFilter({ ...filter, unresolved: event.target.checked })} /> Unresolved</label>
      <div className="graph-legend"><span><i className="legend-blue" />Project</span><span><i className="legend-violet" />Module</span><span><i className="legend-green" />File</span><span><i className="legend-yellow" />Package</span></div>
    </div>
    <div className="graph-canvas">
      {nodes.length === 0 ? <div className="graph-empty">No nodes match the current filters.</div> : <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={(_, node) => onSelectNode(node.id)}
        fitView
        fitViewOptions={{ padding: 0.22, minZoom: 0.15, maxZoom: 0.9 }}
        minZoom={0.08}
        maxZoom={1.5}
        nodesConnectable={false}
        nodesDraggable={false}
        elementsSelectable
        proOptions={{ hideAttribution: false }}
        defaultEdgeOptions={{ type: 'smoothstep' }}
      ><Background color="#334155" gap={22} size={1} /><MiniMap pannable zoomable nodeColor={(node) => node.type === 'arch' ? colorFor((node.data as unknown as FlowNodeData).kind) : '#64748b'} maskColor="rgba(8, 10, 12, 0.74)" /><Controls showInteractive={false} /></ReactFlow>}
    </div>
    {activeMode === 'overview' && <div className="graph-hint">Select <strong>Files</strong> to inspect source-level import links.</div>}
  </section>
}

function colorFor(kind: string) { return kind === 'project' ? '#60a5fa' : kind === 'module' ? '#a78bfa' : kind === 'file' ? '#34d399' : kind === 'package' ? '#fbbf24' : '#fb923c' }
