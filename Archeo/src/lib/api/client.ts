import { AnalysisResultSchema, ApiErrorSchema, SourceRequestSchema, SourceResponseSchema } from '@/lib/validation/schemas'
import type { AnalysisResultData } from '@/lib/validation/schemas'

export class ApiError extends Error {
  constructor(message: string, public readonly code: string, public readonly status: number) { super(message); this.name = 'ApiError' }
}

export async function analyzeRepository(repository: string, branch: string): Promise<AnalysisResultData> {
  const response = await fetch('/api/analyze', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ repository, branch }),
  })
  const payload: unknown = await parsePayload(response)
  if (!response.ok) throw toApiError(payload, response.status)
  const result = AnalysisResultSchema.safeParse(payload)
  if (!result.success) throw new ApiError('The analyzer returned an unexpected response. Try again shortly.', 'INVALID_RESPONSE', 502)
  return result.data
}

export interface SourcePreview { path: string; code: string; url: string }

export async function fetchSource(input: { owner: string; repository: string; commitSha: string; path: string; blobSha: string }): Promise<SourcePreview> {
  const validated = SourceRequestSchema.safeParse(input)
  if (!validated.success) throw new ApiError('This source path is not available for preview.', 'INVALID_INPUT', 400)
  const response = await fetch('/api/source', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(validated.data),
  })
  const payload = await parsePayload(response)
  if (!response.ok) throw toApiError(payload, response.status)
  const result = SourceResponseSchema.safeParse(payload)
  if (!result.success) {
    throw new ApiError('The source endpoint returned an unexpected response.', 'INVALID_RESPONSE', 502)
  }
  return result.data
}

async function parsePayload(response: Response): Promise<unknown> {
  try { return await response.json() as unknown } catch { return null }
}
function toApiError(payload: unknown, status: number): ApiError {
  const parsed = ApiErrorSchema.safeParse(payload)
  if (parsed.success) return new ApiError(parsed.data.error, parsed.data.code, status)
  return new ApiError('The request could not be completed. Try again shortly.', 'REQUEST_FAILED', status)
}
