import { RepositoryRequestSchema } from '../../../src/lib/validation/schemas.ts'
import { BUDGETS } from './budgets.ts'
import { SafeError } from './errors.ts'

const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/
const REPOSITORY = /^[A-Za-z0-9_.-]{1,100}$/

export interface RepositoryIdentity { owner: string; repository: string; branch: string }

export function parseRepositoryInput(input: unknown): RepositoryIdentity {
  const parsed = RepositoryRequestSchema.safeParse(input)
  if (!parsed.success) throw new SafeError('INVALID_INPUT', 'Enter a GitHub repository and branch.', 400)
  const repository = parseRepository(parsed.data.repository)
  const branch = validateBranch(parsed.data.branch)
  return { ...repository, branch }
}

export function parseRepository(value: string): { owner: string; repository: string } {
  const input = value.trim()
  let segments: string[]
  if (/^https?:\/\//i.test(input)) {
    let url: URL
    try { url = new URL(input) } catch { throw invalidRepository() }
    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'github.com' || url.port || url.username || url.password || url.search || url.hash) throw invalidRepository()
    segments = url.pathname.split('/').filter(Boolean)
  } else {
    segments = input.split('/')
  }
  if (segments.length !== 2) throw invalidRepository()
  const [owner, rawRepository] = segments
  const repository = rawRepository.replace(/\.git$/i, '')
  if (!OWNER.test(owner) || !REPOSITORY.test(repository) || repository === '.' || repository === '..' || repository.includes('..')) throw invalidRepository()
  return { owner, repository }
}

export function validateBranch(value: string): string {
  const branch = value.trim()
  const invalid = branch.length === 0 || branch.length > 200 || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(branch) || branch.includes('..') || branch.includes('@{') || branch.includes('//') || branch.endsWith('/') || branch.endsWith('.') || branch.split('/').some((part) => part.startsWith('.') || part.endsWith('.lock'))
  if (invalid) throw new SafeError('INVALID_INPUT', 'Enter a valid Git branch name.', 400)
  return branch
}

export function validateRepositoryPath(path: string): boolean {
  const hasControlCharacter = [...path].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  return path.length > 0 && path.length <= 500 && !path.startsWith('/') && !path.includes('\\') && !hasControlCharacter && path.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
}

export async function readJsonBody(request: Request, maxBytes = BUDGETS.maxRequestBytes): Promise<unknown> {
  const length = Number(request.headers.get('content-length') || 0)
  if (length > maxBytes) throw new SafeError('TOO_LARGE', 'The request is too large.', 413)
  if (!request.body) throw new SafeError('INVALID_INPUT', 'The request body must be valid JSON.', 400)
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) {
        await reader.cancel()
        throw new SafeError('TOO_LARGE', 'The request is too large.', 413)
      }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  const body = new TextDecoder().decode(bytes)
  try { return JSON.parse(body) as unknown } catch { throw new SafeError('INVALID_INPUT', 'The request body must be valid JSON.', 400) }
}

function invalidRepository(): SafeError {
  return new SafeError('INVALID_INPUT', 'Enter a public GitHub repository URL or owner/repository identifier.', 400)
}
