export type ErrorCode = 'INVALID_INPUT' | 'NOT_FOUND' | 'BRANCH_NOT_FOUND' | 'RATE_LIMITED' | 'GITHUB_UNAVAILABLE' | 'UNSUPPORTED_REPOSITORY' | 'SOURCE_NOT_FOUND' | 'TOO_LARGE' | 'METHOD_NOT_ALLOWED'
import { ApiErrorSchema } from '../../../src/lib/validation/schemas.ts'

export class SafeError extends Error {
  constructor(public readonly code: ErrorCode, message: string, public readonly status: number) {
    super(message)
    this.name = 'SafeError'
  }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof SafeError) {
    const headers = error.code === 'RATE_LIMITED' ? { 'retry-after': '60' } : undefined
    return Response.json(ApiErrorSchema.parse({ error: error.message, code: error.code }), { status: error.status, headers })
  }
  return Response.json(ApiErrorSchema.parse({ error: 'GitHub could not be reached. Please try again shortly.', code: 'GITHUB_UNAVAILABLE' }), { status: 502 })
}
