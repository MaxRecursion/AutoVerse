import type { z } from 'zod'
import type { AnalysisResultSchema } from '@/lib/validation/schemas'

export type AnalysisResult = z.infer<typeof AnalysisResultSchema>
export type GraphNode = AnalysisResult['nodes'][number]
export type GraphEdge = AnalysisResult['edges'][number]
export type RepositoryAnalysis = AnalysisResult
