import path from 'node:path'
import { builtinModules } from 'node:module'
import ts from 'typescript'
import { AnalysisResultSchema, type AnalysisResultData } from '../../../src/lib/validation/schemas.ts'
import { BUDGETS } from '../security/budgets.ts'
import { SafeError } from '../security/errors.ts'
import { validateRepositoryPath, type RepositoryIdentity } from '../security/validation.ts'
import { GitHubClient, type GitHubTreeEntry } from '../github/client.ts'

const ANALYZER_VERSION = '0.1.0'
const SOURCE_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx'] as const
const RESOLUTION_EXTENSIONS = ['.d.ts', ...SOURCE_EXTENSIONS] as const
const RELEVANT_MANIFESTS = new Set(['package.json', 'tsconfig.json', 'jsconfig.json'])
const SKIP_SEGMENTS = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', 'vendor', 'third_party', '.next', '.nuxt', '.output', 'out', 'target', '.yarn', '.pnpm-store'])
const BUILTINS = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]))
const FRAMEWORK_NAMES: Record<string, string> = {
  react: 'React', 'react-dom': 'React DOM', next: 'Next.js', vite: 'Vite', vue: 'Vue', svelte: 'Svelte',
  '@angular/core': 'Angular', express: 'Express', fastify: 'Fastify', '@remix-run/react': 'Remix',
}

interface ParsedFile { entry: GitHubTreeEntry; source: string; language: 'JavaScript' | 'TypeScript'; imports: ImportReference[]; exports: string[]; malformed: boolean }
interface ImportReference { specifier: string; line: number; relation: 'static-import' | 're-export' | 'dynamic-import' | 'commonjs-require' }
interface PendingEdge { source: string; target: string; type: 'contains' | 'imports' | 'references-package'; status?: 'verified' | 'unresolved'; resolutionNote?: string; evidence: Array<{ path: string; line: number; specifier: string; relation: ImportReference['relation'] }> }
interface LanguageAdapter { languageFor(filePath: string): 'JavaScript' | 'TypeScript' | undefined; parse(filePath: string, source: string, language: 'JavaScript' | 'TypeScript'): ReturnType<typeof parseSource> }

const LANGUAGE_ADAPTERS: readonly LanguageAdapter[] = [{
  languageFor: (filePath) => isSourcePath(filePath) ? (filePath.endsWith('.ts') || filePath.endsWith('.tsx') ? 'TypeScript' : 'JavaScript') : undefined,
  parse: parseSource,
}]

export async function analyzeRepository(identity: RepositoryIdentity, github = new GitHubClient()): Promise<AnalysisResultData> {
  const deadline = Date.now() + BUDGETS.maxAnalysisMs
  const repository = await github.repository(identity)
  assertBeforeDeadline(deadline)
  if (repository.private) throw new SafeError('UNSUPPORTED_REPOSITORY', 'Only public GitHub repositories can be analyzed.', 403)
  const resolved = await github.branch(identity)
  assertBeforeDeadline(deadline)
  const tree = await github.tree(identity, resolved.sha)
  assertBeforeDeadline(deadline)
  const validEntries = tree.entries.filter((entry) => entry.type === 'blob' && validateRepositoryPath(entry.path) && !isExcluded(entry.path)).sort((a, b) => a.path.localeCompare(b.path))
  const boundedEntries = validEntries.slice(0, BUDGETS.maxTreeEntries)
  const candidateEntries = boundedEntries.filter(isCandidate)
  const sourceEntries = candidateEntries.filter(isSource)
  const manifestEntries = candidateEntries.filter(isManifest)
  if (validEntries.length === 0) throw new SafeError('UNSUPPORTED_REPOSITORY', 'This repository is empty or has no files the analyzer can inspect.', 422)
  if (sourceEntries.length === 0) throw new SafeError('UNSUPPORTED_REPOSITORY', 'No JavaScript or TypeScript source files were found in the supported repository paths.', 422)
  const warnings: string[] = []
  let partial = tree.truncated || validEntries.length > BUDGETS.maxTreeEntries
  if (tree.truncated) warnings.push('GitHub marked the repository tree as truncated; this result covers only entries returned by the API.')
  if (validEntries.length > BUDGETS.maxTreeEntries) warnings.push(`The tree contains more than ${BUDGETS.maxTreeEntries.toLocaleString()} eligible entries; later entries were not inspected.`)

  const sourcePlan: GitHubTreeEntry[] = []
  const skippedTooLarge = new Set<string>()
  let plannedBytes = 0
  for (const entry of sourceEntries) {
    if (sourcePlan.length >= BUDGETS.maxAnalyzedFiles) { partial = true; continue }
    const size = entry.size ?? 0
    if (size > BUDGETS.maxFileBytes) { skippedTooLarge.add(entry.path); partial = true; continue }
    if (plannedBytes + size > BUDGETS.maxTotalSourceBytes) { skippedTooLarge.add(entry.path); partial = true; continue }
    sourcePlan.push(entry)
    plannedBytes += size
  }
  for (const entry of manifestEntries) {
    if ((entry.size ?? 0) > BUDGETS.maxFileBytes || plannedBytes + (entry.size ?? 0) > BUDGETS.maxTotalSourceBytes) {
      skippedTooLarge.add(entry.path)
      partial = true
      continue
    }
    plannedBytes += entry.size ?? 0
  }
  if (sourceEntries.length > BUDGETS.maxAnalyzedFiles) warnings.push(`Only the first ${BUDGETS.maxAnalyzedFiles} source files by path were selected for parsing.`)
  if (skippedTooLarge.size > 0) warnings.push(`${skippedTooLarge.size} source or manifest file(s) exceeded the per-file or total byte budget and were skipped.`)

  const fetchEntries = [...sourcePlan, ...manifestEntries.filter((entry) => !skippedTooLarge.has(entry.path))]
  let actualSourceBytes = 0
  let actualBudgetExhausted = false
  const fetched = await mapLimit(fetchEntries, BUDGETS.maxConcurrentBlobs, async (entry) => {
    try {
      if (actualBudgetExhausted) return { entry, source: undefined, error: new SafeError('TOO_LARGE', 'The total source byte budget was reached.', 413) }
      const blob = await github.blob(identity, entry.sha)
      if (blob.encoding !== 'base64' || blob.size > BUDGETS.maxFileBytes) throw new SafeError('TOO_LARGE', 'A source blob exceeded the configured size limit.', 413)
      const source = decodeBase64(blob.content)
      const actualBytes = Buffer.byteLength(source)
      if (actualBytes > BUDGETS.maxFileBytes || actualSourceBytes + actualBytes > BUDGETS.maxTotalSourceBytes) {
        actualBudgetExhausted = true
        throw new SafeError('TOO_LARGE', 'The total source byte budget was reached.', 413)
      }
      actualSourceBytes += actualBytes
      if (source.includes('\0')) throw new SafeError('UNSUPPORTED_REPOSITORY', 'A binary source blob was skipped.', 422)
      return { entry, source, error: undefined as unknown }
    } catch (error) {
      if (error instanceof SafeError && error.code === 'RATE_LIMITED') throw error
      return { entry, source: undefined, error }
    }
  })

  assertBeforeDeadline(deadline)
  const byPath = new Map(fetched.filter((item) => item.source !== undefined).map((item) => [item.entry.path, item.source!]))
  const failedFetches = fetched.filter((item) => item.error !== undefined)
  if (failedFetches.length > 0) {
    partial = true
    warnings.push(`${failedFetches.length} selected source or manifest file(s) could not be retrieved.`)
  }
  const parsedFiles: ParsedFile[] = []
  for (const entry of sourcePlan) {
    const source = byPath.get(entry.path)
    if (source === undefined) continue
    const adapter = LANGUAGE_ADAPTERS.find((candidate) => candidate.languageFor(entry.path) !== undefined)
    const language = adapter?.languageFor(entry.path)
    if (!adapter || !language) continue
    const parsed = adapter.parse(entry.path, source, language)
    parsedFiles.push({ entry, source, language, imports: parsed.imports, exports: parsed.exports, malformed: parsed.malformed })
    if (parsed.malformed) { partial = true; warnings.push(`Some syntax in ${entry.path} could not be parsed completely; extracted declarations are best-effort.`) }
  }

  const manifestData = parseManifests(manifestEntries, byPath)
  const packageManagers = detectPackageManagers(boundedEntries.map((entry) => entry.path), manifestData.packageManagers)
  const frameworks = detectFrameworks(manifestData.packages)
  const graph = createGraph(identity.repository, parsedFiles, manifestData.tsConfigPaths, manifestData.tsConfigBase, manifestData.packages)
  assertBeforeDeadline(deadline)
  partial ||= graph.partial
  if (graph.partial && !warnings.includes('Some relationships were omitted to keep the graph within its size budget.')) warnings.push('Some relationships were omitted to keep the graph within its size budget.')

  const fileRows = candidateEntries.map((entry) => ({
    path: entry.path,
    blobSha: entry.sha,
    size: entry.size ?? 0,
    language: isSource(entry) ? (entry.path.endsWith('.ts') || entry.path.endsWith('.tsx') ? 'TypeScript' as const : 'JavaScript' as const) : 'JSON' as const,
    analyzed: parsedFiles.some((file) => file.entry.path === entry.path),
  }))
  const languages = ['JavaScript', 'TypeScript'].map((name) => ({ name, files: parsedFiles.filter((file) => file.language === name).length })).filter((item) => item.files > 0)
  const skippedFiles = Math.max(0, sourceEntries.length - parsedFiles.length)
  const result: AnalysisResultData = {
    repository: { owner: identity.owner, name: identity.repository, url: `https://github.com/${identity.owner}/${identity.repository}` },
    requestedBranch: identity.branch,
    commitSha: resolved.sha,
    commitUrl: resolved.url,
    analyzedAt: new Date().toISOString(),
    analyzerVersion: ANALYZER_VERSION,
    partial,
    warnings: [...new Set(warnings)].slice(0, 100),
    counts: {
      discoveredFiles: sourceEntries.length,
      analyzedFiles: parsedFiles.length,
      skippedFiles,
      sourceBytes: [...byPath.values()].reduce((sum, source) => sum + Buffer.byteLength(source), 0),
      modules: graph.nodes.filter((node) => node.type === 'module').length,
      internalDependencies: graph.edges.filter((edge) => edge.type === 'imports' && edge.status === 'verified').length,
      externalDependencies: graph.nodes.filter((node) => node.type === 'package' && node.packageKind === 'npm').length,
      unresolvedDependencies: graph.edges.filter((edge) => edge.status === 'unresolved').length,
    },
    languages,
    frameworks,
    packageManagers,
    files: fileRows.slice(0, 2_500),
    nodes: graph.nodes,
    edges: graph.edges,
  }
  const output = AnalysisResultSchema.parse(result)
  if (Buffer.byteLength(JSON.stringify(output)) > BUDGETS.maxAnalysisResponseBytes) {
    output.partial = true
    output.warnings = [...new Set([...output.warnings, 'The response was trimmed to stay within the serverless payload budget.'])].slice(0, 100)
    const analyzed = output.files.filter((file) => file.analyzed)
    const additional = output.files.filter((file) => !file.analyzed).slice(0, 100)
    output.files = [...analyzed, ...additional]
    let remainingEvidence = 1_200
    output.edges = output.edges.flatMap((edge) => {
      const evidence = edge.evidence.slice(0, Math.max(0, remainingEvidence))
      remainingEvidence -= evidence.length
      if (edge.type !== 'contains' && evidence.length === 0) return []
      return [{ ...edge, evidence }]
    })
    output.counts.modules = output.nodes.filter((node) => node.type === 'module').length
    output.counts.internalDependencies = output.edges.filter((edge) => edge.type === 'imports' && edge.status === 'verified').length
    output.counts.externalDependencies = output.nodes.filter((node) => node.type === 'package' && node.packageKind === 'npm').length
    output.counts.unresolvedDependencies = output.edges.filter((edge) => edge.status === 'unresolved').length
  }
  if (Buffer.byteLength(JSON.stringify(output)) > BUDGETS.maxAnalysisResponseBytes) throw new SafeError('TOO_LARGE', 'The analyzed graph is too large to return safely. Try a smaller repository.', 413)
  return AnalysisResultSchema.parse(output)
}

function parseSource(filePath: string, source: string, language: 'JavaScript' | 'TypeScript'): { imports: ImportReference[]; exports: string[]; malformed: boolean } {
  const kind = filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : filePath.endsWith('.jsx') ? ts.ScriptKind.JSX : language === 'TypeScript' ? ts.ScriptKind.TS : ts.ScriptKind.JS
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, kind)
  const imports: ImportReference[] = []
  const exports = new Set<string>()
  const add = (specifier: ts.StringLiteralLike, relation: ImportReference['relation']) => {
    const line = sourceFile.getLineAndCharacterOfPosition(specifier.getStart(sourceFile)).line + 1
    imports.push({ specifier: specifier.text, line, relation })
  }
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) add(node.moduleSpecifier, 'static-import')
    else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) add(node.moduleSpecifier, 're-export')
    else if (ts.isCallExpression(node)) {
      const first = node.arguments[0]
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword && first && ts.isStringLiteralLike(first)) add(first, 'dynamic-import')
      else if (ts.isIdentifier(node.expression) && node.expression.text === 'require' && first && ts.isStringLiteralLike(first)) add(first, 'commonjs-require')
    }
    if (ts.canHaveModifiers(node)) {
      const modifiers = ts.getModifiers(node) ?? []
      if (modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
        if (ts.isVariableStatement(node)) {
          for (const declaration of node.declarationList.declarations) if (ts.isIdentifier(declaration.name)) exports.add(declaration.name.text)
        } else if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node)) && node.name) exports.add(node.name.text)
      }
      if (modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)) exports.add('default')
    }
    if (ts.isExportDeclaration(node) && node.exportClause) {
      if (ts.isNamedExports(node.exportClause)) for (const element of node.exportClause.elements) exports.add(element.name.text)
      else if (ts.isNamespaceExport(node.exportClause)) exports.add(node.exportClause.name.text)
    }
    if (ts.isExportAssignment(node) && !node.isExportEquals) exports.add('default')
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  const diagnostics = (sourceFile as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics
  return { imports: imports.sort((a, b) => a.line - b.line || a.specifier.localeCompare(b.specifier)), exports: [...exports].sort().slice(0, 100), malformed: diagnostics.length > 0 }
}

function parseManifests(entries: GitHubTreeEntry[], sourceMap: Map<string, string>): { packages: Set<string>; packageManagers: Set<string>; tsConfigPaths: Record<string, string[]>; tsConfigBase: string } {
  const packages = new Set<string>()
  const packageManagers = new Set<string>()
  let tsConfigPaths: Record<string, string[]> = {}
  let tsConfigBase = ''
  for (const entry of entries) {
    const source = sourceMap.get(entry.path)
    if (!source) continue
    try {
      const value: unknown = JSON.parse(source)
      if (!value || typeof value !== 'object') continue
      const manifest = value as Record<string, unknown>
      if (entry.path.endsWith('package.json')) {
        if (typeof manifest.packageManager === 'string') {
          const name = manifest.packageManager.split('@')[0]
          if (name === 'npm' || name === 'pnpm' || name === 'yarn' || name === 'bun') packageManagers.add(name === 'yarn' ? 'Yarn' : name)
        }
        for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
          const dependencies = manifest[field]
          if (dependencies && typeof dependencies === 'object') for (const name of Object.keys(dependencies)) packages.add(name)
        }
      }
      if ((entry.path === 'tsconfig.json' || entry.path === 'jsconfig.json') && manifest.compilerOptions && typeof manifest.compilerOptions === 'object') {
        const options = manifest.compilerOptions as Record<string, unknown>
        if (options.paths && typeof options.paths === 'object') {
          tsConfigPaths = Object.fromEntries(Object.entries(options.paths as Record<string, unknown>).filter(([, targets]) => Array.isArray(targets) && targets.every((target) => typeof target === 'string')) as [string, string[]][])
          tsConfigBase = typeof options.baseUrl === 'string' ? path.posix.normalize(path.posix.join(path.posix.dirname(entry.path), options.baseUrl)) : path.posix.dirname(entry.path)
        }
      }
    } catch {
      // A malformed manifest is an analysis input warning, not an executable config.
    }
  }
  return { packages, packageManagers, tsConfigPaths, tsConfigBase }
}

function createGraph(repositoryName: string, parsedFiles: ParsedFile[], aliases: Record<string, string[]>, aliasBase: string, declaredPackages: Set<string>): { nodes: AnalysisResultData['nodes']; edges: AnalysisResultData['edges']; partial: boolean } {
  const nodes: AnalysisResultData['nodes'] = [{ id: 'project:root', type: 'project', label: repositoryName }]
  const nodeIds = new Set(['project:root'])
  const edges: PendingEdge[] = []
  let partial = false
  let evidenceCount = 0
  const moduleFiles = new Map<string, ParsedFile[]>()
  for (const file of parsedFiles) {
    const directory = path.posix.dirname(file.entry.path)
    if (directory !== '.') moduleFiles.set(directory, [...(moduleFiles.get(directory) ?? []), file])
  }
  const modulePaths = [...moduleFiles.keys()].sort()
  for (const modulePath of modulePaths) {
    const id = `module:${modulePath}`
    nodes.push({ id, type: 'module', label: path.posix.basename(modulePath), path: modulePath, fileCount: moduleFiles.get(modulePath)?.length ?? 0 })
    nodeIds.add(id)
    edges.push({ source: 'project:root', target: id, type: 'contains', resolutionNote: 'Derived from GitHub tree directory paths.', evidence: [] })
  }
  for (const file of parsedFiles) {
    const id = `file:${file.entry.path}`
    nodes.push({ id, type: 'file', label: path.posix.basename(file.entry.path), path: file.entry.path, ...(file.exports.length > 0 ? { exports: file.exports } : {}) })
    nodeIds.add(id)
    const parent = path.posix.dirname(file.entry.path)
    edges.push({ source: parent === '.' ? 'project:root' : `module:${parent}`, target: id, type: 'contains', resolutionNote: 'Derived from GitHub tree directory paths.', evidence: [] })
  }
  const filePaths = new Set(parsedFiles.map((file) => file.entry.path))
  const aliasCandidates = (specifier: string): string[] => {
    const results: string[] = []
    for (const [pattern, targets] of Object.entries(aliases)) {
      const starIndex = pattern.indexOf('*')
      const prefix = starIndex >= 0 ? pattern.slice(0, starIndex) : pattern
      const suffix = starIndex >= 0 ? pattern.slice(starIndex + 1) : ''
      if (starIndex >= 0 && specifier.startsWith(prefix) && specifier.endsWith(suffix)) {
        const matched = specifier.slice(prefix.length, specifier.length - suffix.length)
        for (const target of targets) results.push(path.posix.normalize(path.posix.join(aliasBase, target.replace('*', matched))))
      } else if (pattern === specifier) results.push(...targets.map((target) => path.posix.normalize(path.posix.join(aliasBase, target))))
    }
    return results
  }
  const resolveInternal = (from: string, specifier: string): string | undefined => {
    const bases = specifier.startsWith('.') ? [path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier))] : aliasCandidates(specifier).map((target) => path.posix.normalize(target))
    for (const base of bases) {
      if (base === '..' || base.startsWith('../') || base.startsWith('/')) continue
      const candidates = [base, ...RESOLUTION_EXTENSIONS.map((extension) => `${base}${extension}`), ...RESOLUTION_EXTENSIONS.map((extension) => `${base}/index${extension}`)]
      const match = candidates.find((candidate) => filePaths.has(candidate))
      if (match) return match
    }
    return undefined
  }
  const packageImports = new Set<string>()
  const unresolvedImports = new Set<string>()
  const pendingImports: PendingEdge[] = []
  for (const file of parsedFiles) {
    for (const reference of file.imports) {
      if (evidenceCount >= BUDGETS.maxGraphEvidence || reference.specifier.length > 500) { partial = true; continue }
      evidenceCount += 1
      const evidence = [{ path: file.entry.path, line: reference.line, specifier: reference.specifier, relation: reference.relation }]
      if (reference.specifier.startsWith('.') || aliasCandidates(reference.specifier).length > 0) {
        const targetPath = resolveInternal(file.entry.path, reference.specifier)
        if (targetPath) pendingImports.push({ source: `file:${file.entry.path}`, target: `file:${targetPath}`, type: 'imports', status: 'verified', evidence })
        else {
          const label = reference.specifier
          unresolvedImports.add(label)
          pendingImports.push({ source: `file:${file.entry.path}`, target: `unresolved:${label}`, type: 'imports', status: 'unresolved', resolutionNote: 'No analyzed source file matched this relative or configured alias import.', evidence })
        }
        continue
      }
      const packageName = packageFromSpecifier(reference.specifier)
      if (!packageName) {
        const label = reference.specifier || '(empty specifier)'
        unresolvedImports.add(label)
        pendingImports.push({ source: `file:${file.entry.path}`, target: `unresolved:${label}`, type: 'imports', status: 'unresolved', resolutionNote: 'The module specifier could not be classified.', evidence })
        continue
      }
      if (BUILTINS.has(packageName) || BUILTINS.has(`node:${packageName}`)) {
        packageImports.add(`builtin:${packageName}`)
        pendingImports.push({ source: `file:${file.entry.path}`, target: `package:builtin:${packageName}`, type: 'references-package', status: 'verified', evidence })
      } else if (declaredPackages.has(packageName)) {
        packageImports.add(`npm:${packageName}`)
        pendingImports.push({ source: `file:${file.entry.path}`, target: `package:npm:${packageName}`, type: 'references-package', status: 'verified', evidence })
      } else {
        unresolvedImports.add(reference.specifier)
        pendingImports.push({ source: `file:${file.entry.path}`, target: `unresolved:${reference.specifier}`, type: 'imports', status: 'unresolved', resolutionNote: 'No analyzed package manifest declares this bare module specifier.', evidence })
      }
    }
  }
  const fixedNodeCount = nodes.length
  const capacity = Math.max(0, BUDGETS.maxGraphNodes - fixedNodeCount)
  const packageNodes = [...packageImports].sort().slice(0, capacity)
  for (const key of packageNodes) {
    const packageKind = key.startsWith('npm:') ? 'npm' : 'builtin'
    const name = key.slice(packageKind.length + 1)
    const id = `package:${packageKind}:${name}`
    nodes.push({ id, type: 'package', packageKind, label: name })
    nodeIds.add(id)
  }
  if (packageNodes.length < packageImports.size) partial = true
  const roomAfterPackages = Math.max(0, BUDGETS.maxGraphNodes - nodes.length)
  const unresolvedNodes = [...unresolvedImports].sort().slice(0, roomAfterPackages)
  for (const specifier of unresolvedNodes) {
    const id = `unresolved:${specifier}`
    nodes.push({ id, type: 'unresolved', label: specifier })
    nodeIds.add(id)
  }
  if (unresolvedNodes.length < unresolvedImports.size) partial = true

  const combined = [...edges, ...pendingImports]
  const grouped = new Map<string, PendingEdge>()
  for (const edge of combined) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) { partial = true; continue }
    const key = `${edge.type}\u0000${edge.source}\u0000${edge.target}\u0000${edge.status ?? ''}`
    const existing = grouped.get(key)
    if (existing) {
      existing.evidence.push(...edge.evidence)
      if (existing.evidence.length > 100) { existing.evidence.length = 100; partial = true }
    } else grouped.set(key, { ...edge })
  }
  const allEdges = [...grouped.values()].sort((a, b) => (a.type === 'contains' ? -1 : 1) - (b.type === 'contains' ? -1 : 1) || a.source.localeCompare(b.source) || a.target.localeCompare(b.target))
  if (allEdges.length > BUDGETS.maxGraphEdges) partial = true
  const boundedEdges = allEdges.slice(0, BUDGETS.maxGraphEdges).map((edge) => ({
    id: `${edge.type}:${edge.source}->${edge.target}`,
    source: edge.source,
    target: edge.target,
    type: edge.type,
    ...(edge.status ? { status: edge.status } : {}),
    ...(edge.resolutionNote ? { resolutionNote: edge.resolutionNote } : {}),
    evidence: edge.evidence,
  }))
  return { nodes, edges: boundedEdges, partial }
}

function packageFromSpecifier(specifier: string): string | undefined {
  if (!specifier || specifier.startsWith('node:')) return specifier || undefined
  const parts = specifier.split('/')
  if (specifier.startsWith('@')) return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : undefined
  return parts[0]
}

function detectFrameworks(packages: Set<string>): string[] {
  return Object.entries(FRAMEWORK_NAMES).filter(([dependency]) => packages.has(dependency)).map(([, name]) => name).sort()
}

function detectPackageManagers(paths: string[], declared: Set<string>): string[] {
  const managers = new Set<string>()
  for (const file of paths) {
    if (file === 'package-lock.json' || file === 'npm-shrinkwrap.json') managers.add('npm')
    if (file === 'yarn.lock') managers.add('Yarn')
    if (file === 'pnpm-lock.yaml') managers.add('pnpm')
    if (file === 'bun.lock' || file === 'bun.lockb') managers.add('Bun')
  }
  if (managers.size === 0 && declared.size > 0) return [...declared].sort()
  if (managers.size === 0 && paths.includes('package.json')) managers.add('npm (inferred from package.json)')
  return [...managers].sort()
}

function isExcluded(filePath: string): boolean { return filePath.split('/').some((part) => SKIP_SEGMENTS.has(part)) || /\.min\.(?:js|jsx|ts|tsx)$/i.test(filePath) }
function isSource(entry: GitHubTreeEntry): boolean { return isSourcePath(entry.path) }
function isSourcePath(filePath: string): boolean { return SOURCE_EXTENSIONS.some((extension) => filePath.endsWith(extension)) }
function isManifest(entry: GitHubTreeEntry): boolean { return RELEVANT_MANIFESTS.has(path.posix.basename(entry.path)) }
function isCandidate(entry: GitHubTreeEntry): boolean { return isSource(entry) || isManifest(entry) }

function assertBeforeDeadline(deadline: number): void {
  if (Date.now() > deadline) throw new SafeError('GITHUB_UNAVAILABLE', 'Analysis reached its time limit. Retry with a smaller repository.', 504)
}

function decodeBase64(content: string): string {
  const normalized = content.replace(/\s/g, '')
  if (normalized.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) throw new SafeError('GITHUB_UNAVAILABLE', 'GitHub returned malformed source data.', 502)
  return Buffer.from(normalized, 'base64').toString('utf8')
}

async function mapLimit<T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = next++
      if (index >= items.length) return
      results[index] = await mapper(items[index]!)
    }
  })
  await Promise.all(workers)
  return results
}
