import { Suspense, lazy, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Check, ChevronLeft, ChevronRight, CircleDot, ExternalLink, GitBranch, LoaderCircle, PanelLeftClose, PanelRightClose, RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Brand } from '@/components/Brand'
import { FileExplorer } from '@/components/explorer/FileExplorer'
import { DetailsPanel } from '@/components/insights/DetailsPanel'
import { useAnalysis } from '@/features/analysis/AnalysisContext'
import { analyzeRepository, ApiError } from '@/lib/api/client'

const ArchitectureGraph = lazy(() => import('@/components/architecture/ArchitectureGraph').then((module) => ({ default: module.ArchitectureGraph })))

export function WorkspacePage() {
  const navigate = useNavigate()
  const { analysis, setAnalysis, selectedNodeId, setSelectedNodeId, selectedFilePath, selectFile } = useAnalysis()
  const [branch, setBranch] = useState(analysis?.requestedBranch ?? 'main')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [hideLeft, setHideLeft] = useState(false)
  const [hideRight, setHideRight] = useState(false)
  if (!analysis) return null
  const currentAnalysis = analysis

  async function reanalyze() {
    setLoading(true)
    setError('')
    try {
      const result = await analyzeRepository(`${currentAnalysis.repository.owner}/${currentAnalysis.repository.name}`, branch)
      setAnalysis(result)
      selectFile(null)
      setSelectedNodeId('project:root')
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'The analysis could not be refreshed.')
    } finally { setLoading(false) }
  }

  function clearAnalysis() {
    setAnalysis(null)
    setSelectedNodeId(null)
    selectFile(null)
    navigate('/')
  }

  function selectNode(id: string) {
    const node = currentAnalysis.nodes.find((entry) => entry.id === id)
    if (node?.type === 'file' && node.path) selectFile(node.path)
    else { selectFile(null); setSelectedNodeId(id) }
  }

  return <main className={`workspace-page ${hideLeft ? 'left-collapsed' : ''} ${hideRight ? 'right-collapsed' : ''}`}>
    <header className="workspace-topbar">
      <div className="workspace-brand"><Brand compact /><span className="topbar-divider" /><a className="repo-identity" href={currentAnalysis.repository.url} target="_blank" rel="noreferrer"><span>{currentAnalysis.repository.owner}</span><b>/</b>{currentAnalysis.repository.name}<ExternalLink size={12} /></a></div>
      <div className="workspace-run-meta"><label><GitBranch size={14} /><Input aria-label="Analysis branch" value={branch} onChange={(event) => setBranch(event.target.value)} /></label><span className="commit-chip"><CircleDot size={12} />{currentAnalysis.commitSha.slice(0, 10)}</span><a className="commit-link" href={currentAnalysis.commitUrl} target="_blank" rel="noreferrer" aria-label="View analyzed commit"><ExternalLink size={13} /></a></div>
      <div className="workspace-actions"><Button variant="secondary" size="sm" onClick={reanalyze} disabled={loading || !branch.trim()}>{loading ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />}<span>Reanalyze</span></Button><Button variant="ghost" size="sm" onClick={clearAnalysis}><Trash2 size={14} /><span>Clear</span></Button></div>
    </header>
    {error && <div className="workspace-error" role="alert"><AlertTriangle size={15} />{error}<button onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
    <div className="workspace-grid">
      <div className="left-panel-wrap"><button className="panel-collapse left-toggle" onClick={() => setHideLeft(!hideLeft)} aria-label={hideLeft ? 'Show file explorer' : 'Hide file explorer'}>{hideLeft ? <ChevronRight size={15} /> : <PanelLeftClose size={15} />}</button>{!hideLeft && <FileExplorer files={currentAnalysis.files} selectedPath={selectedFilePath} onSelect={selectFile} />}</div>
      <section className="workspace-center">
        <div className="summary-ribbon">
          <div className="summary-stat"><strong>{currentAnalysis.counts.analyzedFiles}</strong><span>files analyzed</span></div><div className="summary-sep" />
          <div className="summary-stat"><strong>{currentAnalysis.counts.modules}</strong><span>modules</span></div><div className="summary-sep" />
          <div className="summary-stat"><strong>{currentAnalysis.counts.internalDependencies}</strong><span>internal links</span></div><div className="summary-sep" />
          <div className="summary-stat"><strong>{currentAnalysis.counts.externalDependencies}</strong><span>packages</span></div><div className="summary-sep" />
          <div className="summary-stat"><strong>{currentAnalysis.counts.unresolvedDependencies}</strong><span>unresolved</span></div>
          <div className="summary-tags">{currentAnalysis.languages.map((language) => <span className="tag lang-tag" key={language.name}>{language.name} <b>{language.files}</b></span>)}{currentAnalysis.frameworks.map((framework) => <span className="tag" key={framework}>{framework}</span>)}{currentAnalysis.packageManagers.map((manager) => <span className="tag" key={manager}>{manager}</span>)}</div>
        </div>
        {currentAnalysis.partial && <div className="partial-banner"><AlertTriangle size={14} /><span>Partial analysis. This graph covers {currentAnalysis.counts.analyzedFiles} of {currentAnalysis.counts.discoveredFiles} supported source files.</span><button onClick={() => document.getElementById('analysis-warnings')?.scrollIntoView({ behavior: 'smooth' })}>View limits</button></div>}
        <div className="graph-wrap"><Suspense fallback={<div className="graph-loading"><LoaderCircle className="spin" size={18} />Loading architecture map…</div>}><ArchitectureGraph result={currentAnalysis} selectedNodeId={selectedNodeId} onSelectNode={selectNode} /></Suspense></div>
        <section className="analysis-footer" id="analysis-warnings"><div className="analysis-footer-heading"><div><div className="panel-kicker">ANALYSIS NOTES</div><span>Run at {new Date(currentAnalysis.analyzedAt).toLocaleString()}</span></div><a href={currentAnalysis.commitUrl} target="_blank" rel="noreferrer">{currentAnalysis.commitSha.slice(0, 10)} <ExternalLink size={12} /></a></div>
          {currentAnalysis.warnings.length ? <ul>{currentAnalysis.warnings.slice(0, 6).map((warning) => <li key={warning}><AlertTriangle size={13} />{warning}</li>)}</ul> : <p className="clean-run"><Check size={13} />No truncation or file-size warnings were reported for this run.</p>}
          <div className="analysis-counts">{currentAnalysis.counts.discoveredFiles} discovered <span>·</span> {currentAnalysis.counts.analyzedFiles} parsed <span>·</span> {currentAnalysis.counts.skippedFiles} skipped <span>·</span> {(currentAnalysis.counts.sourceBytes / 1_024).toFixed(0)} KiB read</div>
        </section>
      </section>
      <div className="right-panel-wrap"><button className="panel-collapse right-toggle" onClick={() => setHideRight(!hideRight)} aria-label={hideRight ? 'Show node inspector' : 'Hide node inspector'}>{hideRight ? <ChevronLeft size={15} /> : <PanelRightClose size={15} />}</button>{!hideRight && <DetailsPanel result={currentAnalysis} selectedNodeId={selectedNodeId} selectedFilePath={selectedFilePath} onSelectFile={selectFile} />}</div>
    </div>
    {loading && <div className="reanalyze-overlay" role="status"><LoaderCircle className="spin" size={18} />Resolving branch and analyzing the pinned commit…</div>}
  </main>
}
