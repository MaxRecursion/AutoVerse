import { analyzeRepository } from '../analysis/analyze.ts'
import { errorResponse } from '../security/errors.ts'
import { parseRepositoryInput, readJsonBody } from '../security/validation.ts'

export async function handleAnalyze(request: Request): Promise<Response> {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { allow: 'POST' } })
  try {
    const input = parseRepositoryInput(await readJsonBody(request))
    return Response.json(await analyzeRepository(input), { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    return errorResponse(error)
  }
}
