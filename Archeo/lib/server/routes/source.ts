import { GitHubClient } from '../github/client.ts'
import { BUDGETS } from '../security/budgets.ts'
import { errorResponse, SafeError } from '../security/errors.ts'
import { readJsonBody, validateRepositoryPath, type RepositoryIdentity } from '../security/validation.ts'
import { SourceRequestSchema, SourceResponseSchema } from '../../../src/lib/validation/schemas.ts'

const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx'])
const PREVIEW_MANIFESTS = new Set(['package.json', 'tsconfig.json', 'jsconfig.json'])

export async function handleSource(request: Request): Promise<Response> {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { allow: 'POST' } })
  try {
    const parsed = SourceRequestSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) throw new SafeError('INVALID_INPUT', 'The source request is invalid.', 400)
    const input = parsed.data
    const supportedSource = SOURCE_EXTENSIONS.has(extension(input.path)) || PREVIEW_MANIFESTS.has(input.path.split('/').at(-1) ?? '')
    if (!validateRepositoryPath(input.path) || !supportedSource) throw new SafeError('INVALID_INPUT', 'This source path is not supported.', 400)
    const identity: RepositoryIdentity = { owner: input.owner, repository: input.repository, branch: input.commitSha }
    const github = new GitHubClient(Date.now() + 12_000)
    const repository = await github.repository(identity)
    if (repository.private) throw new SafeError('UNSUPPORTED_REPOSITORY', 'Only public GitHub repositories can be viewed.', 403)
    const tree = await github.tree(identity, input.commitSha)
    const entry = tree.entries.find((candidate) => candidate.type === 'blob' && candidate.path === input.path && candidate.sha === input.blobSha)
    if (!entry) throw new SafeError('SOURCE_NOT_FOUND', 'That source file is not present at the analyzed commit.', 404)
    if (typeof entry.size === 'number' && entry.size > BUDGETS.maxSourceResponseBytes) throw new SafeError('TOO_LARGE', 'This file exceeds the source preview size limit.', 413)
    const blob = await github.blob(identity, input.blobSha)
    if (blob.encoding !== 'base64' || blob.size > BUDGETS.maxSourceResponseBytes) throw new SafeError('TOO_LARGE', 'This file exceeds the source preview size limit.', 413)
    const code = decodeBase64(blob.content)
    if (code.includes('\0')) throw new SafeError('UNSUPPORTED_REPOSITORY', 'This file is not plain text and cannot be previewed.', 422)
    return Response.json(SourceResponseSchema.parse({ path: input.path, code, url: `https://github.com/${input.owner}/${input.repository}/blob/${input.commitSha}/${input.path.split('/').map(encodeURIComponent).join('/')}` }), { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    return errorResponse(error)
  }
}

function extension(filePath: string): string { return filePath.slice(filePath.lastIndexOf('.')).toLowerCase() }

function decodeBase64(content: string): string {
  const normalized = content.replace(/\s/g, '')
  if (normalized.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) throw new SafeError('GITHUB_UNAVAILABLE', 'GitHub returned malformed source data.', 502)
  return Buffer.from(normalized, 'base64').toString('utf8')
}
