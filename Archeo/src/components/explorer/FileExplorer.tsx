import { useMemo, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, FileCode2, Folder, FolderOpen, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import type { AnalysisResultData } from '@/lib/validation/schemas'

interface TreeFolder { name: string; path: string; folders: Map<string, TreeFolder>; files: AnalysisResultData['files'] }
const supportedFile = /\.(?:js|jsx|ts|tsx|json)$/i

export function FileExplorer({ files, selectedPath, onSelect }: { files: AnalysisResultData['files']; selectedPath: string | null; onSelect: (path: string) => void }) {
  const [query, setQuery] = useState('')
  const sourceFiles = useMemo(() => files.filter((file) => supportedFile.test(file.path)), [files])
  const tree = useMemo(() => buildTree(sourceFiles), [sourceFiles])
  const matchingPaths = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return normalized ? new Set(sourceFiles.filter((file) => file.path.toLowerCase().includes(normalized)).map((file) => file.path)) : null
  }, [query, sourceFiles])
  return <aside className="explorer-panel" aria-label="Repository files">
    <div className="explorer-heading"><div className="panel-kicker">EXPLORER</div><span>{sourceFiles.length}</span></div>
    <div className="explorer-search"><Search size={13} /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a file" aria-label="Find a file" /></div>
    <div className="file-tree" role="tree" aria-label="Repository file tree">
      <FolderRows folder={tree} depth={0} matches={matchingPaths} selectedPath={selectedPath} onSelect={onSelect} />
      {matchingPaths && matchingPaths.size === 0 && <div className="tree-empty">No matching files.</div>}
      {sourceFiles.length === 0 && <div className="tree-empty">No supported files were found.</div>}
    </div>
    <div className="explorer-foot"><span className="live-dot" />Pinned to <code>{files.length > 0 ? 'commit' : '—'}</code></div>
  </aside>
}

function buildTree(files: AnalysisResultData['files']): TreeFolder {
  const root: TreeFolder = { name: '.', path: '', folders: new Map(), files: [] }
  for (const file of files) {
    const segments = file.path.split('/')
    let folder = root
    for (const part of segments.slice(0, -1)) {
      const nextPath = folder.path ? `${folder.path}/${part}` : part
      let next = folder.folders.get(part)
      if (!next) { next = { name: part, path: nextPath, folders: new Map(), files: [] }; folder.folders.set(part, next) }
      folder = next
    }
    folder.files.push(file)
  }
  return root
}

function FolderRows({ folder, depth, matches, selectedPath, onSelect }: { folder: TreeFolder; depth: number; matches: Set<string> | null; selectedPath: string | null; onSelect: (path: string) => void }): ReactNode {
  const visibleFiles = folder.files.filter((file) => !matches || matches.has(file.path))
  const visibleFolders = [...folder.folders.values()].filter((child) => !matches || folderHasMatch(child, matches))
  const [open, setOpen] = useState(depth < 2)
  return <div className="tree-folder" key={folder.path || 'root'}>
    {folder.path && <button className="tree-row folder-row" style={{ paddingLeft: 8 + depth * 13 }} role="treeitem" aria-expanded={matches ? true : open} onClick={() => setOpen(!open)}><span className="tree-chevron">{matches || open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</span>{matches || open ? <FolderOpen size={14} /> : <Folder size={14} />}<span>{folder.name}</span></button>}
    {(matches || open || !folder.path) && <div role="group">
      {visibleFolders.map((child) => <FolderRows key={child.path} folder={child} depth={depth + 1} matches={matches} selectedPath={selectedPath} onSelect={onSelect} />)}
      {[...visibleFiles].sort((a, b) => a.path.localeCompare(b.path)).map((file) => <button key={file.path} aria-label={file.path} className={`tree-row file-row ${selectedPath === file.path ? 'selected' : ''}`} style={{ paddingLeft: 25 + depth * 13 }} role="treeitem" aria-current={selectedPath === file.path ? 'page' : undefined} onClick={() => onSelect(file.path)}><FileCode2 size={13} /><span>{file.path.split('/').at(-1)}</span>{!file.analyzed && <span className="tree-unparsed" title="Not included in dependency parsing">·</span>}</button>)}
    </div>}
  </div>
}

function folderHasMatch(folder: TreeFolder, matches: Set<string>): boolean {
  return folder.files.some((file) => matches.has(file.path)) || [...folder.folders.values()].some((child) => folderHasMatch(child, matches))
}
