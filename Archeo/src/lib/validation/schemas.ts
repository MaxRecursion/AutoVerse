import { z } from 'zod'

export const RepositoryRequestSchema = z.object({
  repository: z.string().trim().min(1).max(500),
  branch: z.string().trim().min(1).max(200).default('main'),
}).strict()

const EvidenceSchema = z.object({
  path: z.string().min(1).max(500),
  line: z.number().int().min(1),
  specifier: z.string().min(1).max(500),
  relation: z.enum(['static-import', 're-export', 'dynamic-import', 'commonjs-require']),
}).strict()

export const GraphNodeSchema = z.object({
  id: z.string().min(1).max(800),
  type: z.enum(['project', 'module', 'file', 'package', 'unresolved']),
  label: z.string().min(1).max(300),
  path: z.string().max(500).optional(),
  packageKind: z.enum(['npm', 'builtin']).optional(),
  fileCount: z.number().int().nonnegative().optional(),
  exports: z.array(z.string().max(200)).max(100).optional(),
}).strict()

export const GraphEdgeSchema = z.object({
  id: z.string().min(1).max(1_200),
  source: z.string().min(1).max(800),
  target: z.string().min(1).max(800),
  type: z.enum(['contains', 'imports', 'references-package']),
  status: z.enum(['verified', 'unresolved']).optional(),
  evidence: z.array(EvidenceSchema).max(100),
  resolutionNote: z.string().max(200).optional(),
}).strict()

export const AnalyzedFileSchema = z.object({
  path: z.string().min(1).max(500),
  blobSha: z.string().regex(/^[a-f0-9]{40}$/i),
  size: z.number().int().nonnegative(),
  language: z.enum(['JavaScript', 'TypeScript', 'JSON']),
  analyzed: z.boolean(),
}).strict()

export const AnalysisResultSchema = z.object({
  repository: z.object({ owner: z.string(), name: z.string(), url: z.string().url() }).strict(),
  requestedBranch: z.string(),
  commitSha: z.string().regex(/^[a-f0-9]{40}$/i),
  commitUrl: z.string().url(),
  analyzedAt: z.string().datetime(),
  analyzerVersion: z.string(),
  partial: z.boolean(),
  warnings: z.array(z.string().max(400)).max(100),
  counts: z.object({
    discoveredFiles: z.number().int().nonnegative(),
    analyzedFiles: z.number().int().nonnegative(),
    skippedFiles: z.number().int().nonnegative(),
    sourceBytes: z.number().int().nonnegative(),
    modules: z.number().int().nonnegative(),
    internalDependencies: z.number().int().nonnegative(),
    externalDependencies: z.number().int().nonnegative(),
    unresolvedDependencies: z.number().int().nonnegative(),
  }).strict(),
  languages: z.array(z.object({ name: z.string(), files: z.number().int().nonnegative() }).strict()),
  frameworks: z.array(z.string()),
  packageManagers: z.array(z.string()),
  files: z.array(AnalyzedFileSchema).max(2_500),
  nodes: z.array(GraphNodeSchema).max(500),
  edges: z.array(GraphEdgeSchema).max(1_200),
}).strict()

export const SourceRequestSchema = z.object({
  owner: z.string().regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/),
  repository: z.string().regex(/^[A-Za-z0-9_.-]{1,100}$/).refine((value) => value !== '.' && value !== '..' && !value.includes('..')),
  commitSha: z.string().regex(/^[a-f0-9]{40}$/i),
  path: z.string().min(1).max(500),
  blobSha: z.string().regex(/^[a-f0-9]{40}$/i),
}).strict()

export const SourceResponseSchema = z.object({
  path: z.string().min(1).max(500),
  code: z.string().max(96 * 1_024),
  url: z.string().url(),
}).strict()

export const ApiErrorSchema = z.object({ error: z.string().min(1).max(400), code: z.string().min(1).max(60) }).strict()

export type AnalysisRequest = z.infer<typeof RepositoryRequestSchema>
export type AnalysisResultData = z.infer<typeof AnalysisResultSchema>
