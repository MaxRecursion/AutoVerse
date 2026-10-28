import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, GitBranch, LoaderCircle, LockKeyhole, Network, ShieldCheck, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Brand } from '@/components/Brand'
import { useAnalysis } from '@/features/analysis/AnalysisContext'
import { analyzeRepository, ApiError } from '@/lib/api/client'

export function HomePage() {
  const navigate = useNavigate()
  const { setAnalysis, setSelectedNodeId, selectFile } = useAnalysis()
  const [repository, setRepository] = useState('')
  const [branch, setBranch] = useState('main')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function runAnalysis(value = repository, selectedBranch = branch) {
    setError('')
    setLoading(true)
    try {
      const result = await analyzeRepository(value, selectedBranch)
      setAnalysis(result)
      selectFile(null)
      setSelectedNodeId('project:root')
      navigate('/explore')
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'The analysis could not be completed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void runAnalysis()
  }

  return <main className="landing-page">
    <header className="landing-nav"><Brand /><a className="nav-github" href="https://github.com" target="_blank" rel="noreferrer"><GitBranch size={16} /> Public GitHub repos <ArrowRight size={13} /></a></header>
    <section className="hero-wrap">
      <div className="hero-copy">
        <div className="eyebrow"><span className="pulse-dot" /> A source-grounded architecture explorer</div>
        <h1>Understand any<br /><em>codebase.</em></h1>
        <p className="hero-subtitle">See how everything connects.</p>
        <p className="hero-description">Trace the structure of an unfamiliar repository from its source. Every relationship links back to a file and the exact commit it came from.</p>
        <form className="repo-form" onSubmit={submit}>
          <label className="field-label" htmlFor="repository">GitHub repository</label>
          <div className="repo-input-wrap"><GitBranch size={17} /><Input id="repository" value={repository} onChange={(event) => setRepository(event.target.value)} placeholder="owner/repository or https://github.com/…" autoComplete="url" /></div>
          <div className="branch-row"><div><label className="field-label" htmlFor="branch">Branch</label><div className="branch-input-wrap"><GitBranch size={15} /><Input id="branch" value={branch} onChange={(event) => setBranch(event.target.value)} placeholder="main" /></div></div>
            <Button type="submit" disabled={loading || !repository.trim()} className="analyze-button">{loading ? <><LoaderCircle className="spin" size={16} /> Analyzing</> : <>Analyze repository <ArrowRight size={16} /></>}</Button>
          </div>
          {error && <div className="form-error" role="alert">{error}</div>}
          {loading && <div className="loading-note" role="status"><span className="loading-bar" /> Resolving the branch and reading bounded source files…</div>}
          <div className="sample-row"><span>Try the live demo</span><button type="button" disabled={loading} onClick={() => { setRepository('sindresorhus/is'); setBranch('main'); void runAnalysis('sindresorhus/is', 'main') }}>sindresorhus/is <ArrowRight size={12} /></button></div>
        </form>
        <div className="scope-note"><strong>SUPPORTED NOW</strong><span>Public GitHub · JavaScript + TypeScript · static imports and exports</span><small>No runtime call tracing. Large or truncated repositories are clearly marked partial.</small></div>
      </div>
      <div className="hero-art" aria-label="Abstract preview of a codebase dependency graph">
        <div className="art-label"><span>ILLUSTRATIVE GRAPH</span><span>VISUAL EXAMPLE · NOT REPOSITORY DATA</span></div>
        <div className="art-canvas">
          <svg className="art-lines" viewBox="0 0 600 430" aria-hidden="true"><path d="M150 208 C235 208 220 82 300 82"/><path d="M150 208 C230 208 225 205 300 205"/><path d="M150 208 C232 208 220 328 300 328"/><path d="M420 82 C492 82 478 158 520 158"/><path d="M420 205 C490 205 478 158 520 158"/><path d="M420 328 C492 328 478 245 520 245"/></svg>
          <div className="art-node project-node"><Network size={15} /><span>application</span><small>project</small></div>
          <div className="art-node module-node one"><span className="art-node-dot violet" /> components/<small>module</small></div>
          <div className="art-node module-node two"><span className="art-node-dot green" /> features/<small>module</small></div>
          <div className="art-node module-node three"><span className="art-node-dot yellow" /> lib/<small>module</small></div>
          <div className="art-node file-node one"><span>Button.tsx</span><small>source file</small></div>
          <div className="art-node file-node two"><span>client.ts</span><small>source file</small></div>
          <div className="art-evidence"><span className="evidence-check"><ShieldCheck size={13} /></span><div><strong>Every edge has evidence</strong><small>path · line · commit SHA</small></div></div>
          <div className="art-commit"><span className="commit-dot" /> pinned to <code>9f3a2c1</code></div>
        </div>
        <div className="art-footer"><span><i className="legend-blue" />project</span><span><i className="legend-violet" />module</span><span><i className="legend-green" />file</span><span><i className="legend-yellow" />package</span></div>
      </div>
    </section>
    <section className="landing-features"><div><Network size={17} /><span>Interactive dependency graph</span></div><div><ShieldCheck size={17} /><span>Verified source evidence</span></div><div><LockKeyhole size={17} /><span>No code execution or storage</span></div><div><Sparkles size={17} /><span>JavaScript + TypeScript</span></div></section>
    <footer className="landing-footer"><span>Reads public GitHub repositories at a fixed commit.</span><span>Bounded analysis · no AI · no account required</span></footer>
  </main>
}
