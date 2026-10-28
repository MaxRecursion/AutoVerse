import { useEffect, useState } from 'react'
import hljs from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import json from 'highlight.js/lib/languages/json'
import { ArrowDownLeft, ArrowUpRight, ExternalLink, FileCode2, FolderTree, LoaderCircle, Package, TriangleAlert } from 'lucide-react'
import { fetchSource, ApiError, type SourcePreview } from '@/lib/api/client'
import type { AnalysisResultData } from '@/lib/validation/schemas'

hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('json', json)

export function DetailsPanel({ result, selectedNodeId, selectedFilePath, onSelectFile }: { result: AnalysisResultData; selectedNodeId: string | null; selectedFilePath: string | null; onSelectFile: (path: string) => void }) {
  const [sourceState, setSourceState] = useState<{ key: string; value: SourcePreview } | null>(null)
  const [sourceErrorState, setSourceErrorState] = useState<{ key: string; value: string } | null>(null)
  const graphNode = result.nodes.find((entry) => entry.id === selectedNodeId)
  const fallbackFile = result.files.find((entry) => entry.path === selectedFilePath)
  const node = graphNode ?? (fallbackFile ? { id: `file:${fallbackFile.path}`, type: 'file' as const, label: fallbackFile.path.split('/').at(-1) ?? fallbackFile.path, path: fallbackFile.path } : undefined)
  const filePaths = node?.type === 'file' && node.path ? [node.path] : node?.type === 'module' && node.path ? result.files.filter((file) => file.path.startsWith(`${node.path}/`) && file.analyzed).map((file) => file.path) : []
  const matchingFile = selectedFilePath ? result.files.find((file) => file.path === selectedFilePath) : undefined
  const currentFile = node?.type === 'file' ? result.files.find((file) => file.path === node.path) : matchingFile
  const ids = new Set(filePaths.map((filePath) => `file:${filePath}`))
  const related = result.edges.filter((edge) => edge.type !== 'contains' && (ids.has(edge.source) || ids.has(edge.target) || edge.source === node?.id || edge.target === node?.id))

  const sourceKey = currentFile ? `${result.repository.owner}/${result.repository.name}@${result.commitSha}:${currentFile.path}:${currentFile.blobSha}` : ''
  useEffect(() => {
    if (!selectedFilePath) return
    const file = result.files.find((entry) => entry.path === selectedFilePath)
    if (!file) return
    let current = true
    fetchSource({ owner: result.repository.owner, repository: result.repository.name, commitSha: result.commitSha, path: file.path, blobSha: file.blobSha })
      .then((preview) => { if (current) setSourceState({ key: `${result.repository.owner}/${result.repository.name}@${result.commitSha}:${file.path}:${file.blobSha}`, value: preview }) })
      .catch((error: unknown) => { if (current) setSourceErrorState({ key: `${result.repository.owner}/${result.repository.name}@${result.commitSha}:${file.path}:${file.blobSha}`, value: error instanceof ApiError ? error.message : 'Source could not be loaded.' }) })
    return () => { current = false }
  }, [selectedFilePath, result.files, result.commitSha, result.repository.name, result.repository.owner])

  const incoming = related.filter((edge) => ids.has(edge.target) || edge.target === node?.id)
  const outgoing = related.filter((edge) => ids.has(edge.source) || edge.source === node?.id)
  const openUrl = node?.type === 'file' && node.path ? `${result.repository.url}/blob/${result.commitSha}/${node.path.split('/').map(encodeURIComponent).join('/')}` : undefined
  const exports = node && 'exports' in node ? node.exports : undefined
  const language = currentFile?.language === 'TypeScript' ? 'typescript' : currentFile?.language === 'JSON' ? 'json' : 'javascript'
  const source = sourceState?.key === sourceKey ? sourceState.value : null
  const sourceError = sourceErrorState?.key === sourceKey ? sourceErrorState.value : ''
  const sourceLoading = Boolean(currentFile && !source && !sourceError)
  const highlighted = source ? hljs.highlight(source.code, { language }).value : ''
  const lineCount = source?.code.split('\n').length ?? 0

  return <aside className="details-panel" aria-label="Node details">
    <div className="details-heading"><div className="panel-kicker">INSPECTOR</div>{openUrl && <a href={openUrl} target="_blank" rel="noreferrer" aria-label="Open file at analyzed commit"><ExternalLink size={14} /></a>}</div>
    {!node ? <div className="details-empty"><div className="empty-node-icon"><FolderTree size={20} /></div><strong>Nothing selected</strong><p>Select a module, file, or package in the map to inspect its evidence.</p></div> : <>
      <div className="selected-node"><div className={`selection-icon selection-${node.type}`}>{node.type === 'package' ? <Package size={16} /> : node.type === 'unresolved' ? <TriangleAlert size={16} /> : <FileCode2 size={16} />}</div><div><span className="node-type-label">{node.type}</span><h2>{node.label}</h2>{node.path && <code>{node.path}</code>}</div></div>
      {node.type === 'module' && <div className="detail-fact"><span>Files in module</span><strong>{node.fileCount ?? filePaths.length}</strong></div>}
      {node.type === 'file' && <div className="detail-fact"><span>Parent module</span><strong>{node.path?.includes('/') ? node.path.slice(0, node.path.lastIndexOf('/')) : 'Repository root'}</strong></div>}
      {exports && exports.length > 0 && <div className="exports-section"><div className="relationship-title">Exported symbols <span>{exports.length}</span></div><div className="export-chips">{exports.slice(0, 20).map((name) => <code key={name}>{name}</code>)}</div></div>}
      {node.type === 'unresolved' && <div className="unresolved-note">This import declaration could not be matched to an analyzed source file.</div>}
      <div className="relationship-block"><div className="relationship-title"><ArrowDownLeft size={14} />Incoming <span>{incoming.length}</span></div>{incoming.length === 0 ? <p className="no-relations">No incoming import evidence.</p> : incoming.slice(0, 18).map((edge) => renderEvidence(edge, result, onSelectFile, 'incoming'))}</div>
      <div className="relationship-block"><div className="relationship-title"><ArrowUpRight size={14} />Outgoing <span>{outgoing.length}</span></div>{outgoing.length === 0 ? <p className="no-relations">No outgoing import evidence.</p> : outgoing.slice(0, 18).map((edge) => renderEvidence(edge, result, onSelectFile, 'outgoing'))}</div>
      {node.type === 'file' && <div className="source-section"><div className="source-title"><span><FileCode2 size={14} /> Source</span>{source && <a href={source.url} target="_blank" rel="noreferrer">GitHub <ExternalLink size={11} /></a>}</div>
        {sourceLoading ? <div className="source-placeholder"><LoaderCircle size={14} className="spin" /> Fetching pinned source…</div> : sourceError ? <div className="source-error">{sourceError}</div> : source ? <div className="source-code-wrap"><div className="line-numbers" aria-hidden="true">{Array.from({ length: lineCount }, (_, index) => <span key={index}>{index + 1}</span>)}</div><pre className="source-code"><code className={`hljs language-${language}`} dangerouslySetInnerHTML={{ __html: highlighted }} /></pre></div> : null}
      </div>}
      <div className="pin-note">All evidence is from <a href={result.commitUrl} target="_blank" rel="noreferrer"><code>{result.commitSha.slice(0, 10)}</code></a></div>
    </>}
  </aside>
}

function renderEvidence(edge: AnalysisResultData['edges'][number], result: AnalysisResultData, onSelectFile: (path: string) => void, direction: 'incoming' | 'outgoing') {
  const peerId = direction === 'incoming' ? edge.source : edge.target
  const peer = result.nodes.find((node) => node.id === peerId)
  const evidence = edge.evidence[0]
  const label = peer?.label ?? edge.resolutionNote ?? 'Unresolved module'
  return <div className={`evidence-row ${edge.status === 'unresolved' ? 'evidence-unresolved' : ''}`} key={edge.id}>
    <div className="evidence-peer"><span>{label}</span><small>{edge.resolutionNote ?? (edge.type === 'references-package' ? 'declared external package' : edge.status === 'unresolved' ? 'unresolved import' : 'verified source import')}</small></div>
    {evidence && <button className="evidence-link" onClick={() => onSelectFile(evidence.path)} title={`Open ${evidence.path} at line ${evidence.line}`}>{evidence.path.split('/').at(-1)}:{evidence.line}</button>}
    {edge.evidence.length > 1 && <span className="evidence-extra">+{edge.evidence.length - 1}</span>}
  </div>
}
