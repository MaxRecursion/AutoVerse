import { BUDGETS } from '../security/budgets.ts'
import { SafeError } from '../security/errors.ts'
import type { RepositoryIdentity } from '../security/validation.ts'

const API_ORIGIN = 'https://api.github.com'
const USER_AGENT = 'Codebase-Archaeologist/0.1'

export interface GitHubRepository { defaultBranch: string; private: boolean; size: number }
export interface GitHubBranch { sha: string; url: string }
export interface GitHubTreeEntry { path: string; sha: string; size?: number; type: 'blob' | 'tree'; mode: string }
export interface GitHubTree { truncated: boolean; entries: GitHubTreeEntry[] }
export interface GitHubBlob { content: string; encoding: string; size: number }

export class GitHubClient {
  constructor(private readonly deadline = Date.now() + BUDGETS.maxAnalysisMs) {}

  async repository(identity: RepositoryIdentity): Promise<GitHubRepository> {
    const data = await this.json(`/repos/${segment(identity.owner)}/${segment(identity.repository)}`)
    return { defaultBranch: stringField(data, 'default_branch'), private: data.private === true, size: numberField(data, 'size') }
  }

  async branch(identity: RepositoryIdentity): Promise<GitHubBranch> {
    try {
      const data = await this.json(`/repos/${segment(identity.owner)}/${segment(identity.repository)}/branches/${segment(identity.branch)}`)
      const commit = objectField(data, 'commit')
      const sha = stringField(commit, 'sha')
      if (!/^[a-f0-9]{40}$/i.test(sha)) throw new SafeError('GITHUB_UNAVAILABLE', 'GitHub returned an invalid commit identifier.', 502)
      return { sha, url: `https://github.com/${identity.owner}/${identity.repository}/commit/${sha}` }
    } catch (error) {
      if (error instanceof SafeError && error.code === 'NOT_FOUND') throw new SafeError('BRANCH_NOT_FOUND', `Branch “${identity.branch}” was not found in this repository.`, 404)
      throw error
    }
  }

  async tree(identity: RepositoryIdentity, commitSha: string): Promise<GitHubTree> {
    const data = await this.json(`/repos/${segment(identity.owner)}/${segment(identity.repository)}/git/trees/${segment(commitSha)}?recursive=1`, BUDGETS.maxGitHubJsonBytes)
    if (!Array.isArray(data.tree)) throw new SafeError('GITHUB_UNAVAILABLE', 'GitHub returned an invalid repository tree.', 502)
    const entries: GitHubTreeEntry[] = []
    for (const raw of data.tree as unknown[]) {
      if (!raw || typeof raw !== 'object') continue
      const row = raw as Record<string, unknown>
      if (typeof row.path !== 'string' || typeof row.sha !== 'string' || (row.type !== 'blob' && row.type !== 'tree')) continue
      if (!/^[a-f0-9]{40}$/i.test(row.sha)) continue
      entries.push({ path: row.path, sha: row.sha, type: row.type, mode: typeof row.mode === 'string' ? row.mode : '', ...(typeof row.size === 'number' ? { size: row.size } : {}) })
    }
    return { truncated: data.truncated === true, entries }
  }

  async blob(identity: RepositoryIdentity, blobSha: string): Promise<GitHubBlob> {
    const data = await this.json(`/repos/${segment(identity.owner)}/${segment(identity.repository)}/git/blobs/${segment(blobSha)}`, BUDGETS.maxFileBytes * 2)
    return { content: stringField(data, 'content'), encoding: stringField(data, 'encoding'), size: numberField(data, 'size') }
  }

  private async json(path: string, maxBytes = BUDGETS.maxGitHubJsonBytes): Promise<Record<string, unknown>> {
    const url = new URL(path, API_ORIGIN)
    if (url.origin !== API_ORIGIN) throw new SafeError('GITHUB_UNAVAILABLE', 'GitHub API request was rejected.', 502)
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const remaining = this.deadline - Date.now()
      if (remaining <= 0) throw new SafeError('GITHUB_UNAVAILABLE', 'Analysis reached its time limit. Retry with a smaller repository.', 504)
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), Math.min(BUDGETS.maxGitHubRequestMs, remaining))
      try {
        const response = await fetch(url, {
          headers: {
            accept: 'application/vnd.github+json',
            'x-github-api-version': '2022-11-28',
            'user-agent': USER_AGENT,
            ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
          },
          signal: controller.signal,
        })
        if (response.status >= 500 && attempt === 0) {
          await response.body?.cancel()
          continue
        }
        if (!response.ok) {
          if (response.status === 404) throw new SafeError('NOT_FOUND', 'Public repository not found. Check the repository name and visibility.', 404)
          if (response.status === 403 && (response.headers.get('x-ratelimit-remaining') === '0' || response.headers.get('retry-after'))) throw new SafeError('RATE_LIMITED', 'GitHub’s anonymous API limit was reached. Wait a little and try again.', 429)
          if (response.status === 403) throw new SafeError('GITHUB_UNAVAILABLE', 'GitHub refused this request. The repository may be unavailable to anonymous API access.', 502)
          if (response.status >= 500) throw new SafeError('GITHUB_UNAVAILABLE', 'GitHub is temporarily unavailable. Please try again shortly.', 502)
          throw new SafeError('GITHUB_UNAVAILABLE', 'GitHub rejected the repository request.', 502)
        }
        const body = await readBounded(response, maxBytes)
        try {
          const parsed: unknown = JSON.parse(body)
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('shape')
          return parsed as Record<string, unknown>
        } catch {
          throw new SafeError('GITHUB_UNAVAILABLE', 'GitHub returned a malformed response.', 502)
        }
      } catch (error) {
        if (error instanceof SafeError) throw error
        if (controller.signal.aborted) throw new SafeError('GITHUB_UNAVAILABLE', 'GitHub took too long to respond. Try again.', 504)
        if (attempt === 1) throw new SafeError('GITHUB_UNAVAILABLE', 'GitHub could not be reached. Please try again shortly.', 502)
      } finally {
        clearTimeout(timer)
      }
      if (Date.now() < this.deadline - 150) await new Promise((resolve) => setTimeout(resolve, 150))
    }
    throw new SafeError('GITHUB_UNAVAILABLE', 'GitHub could not be reached. Please try again shortly.', 502)
  }
}

async function readBounded(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) throw new SafeError('GITHUB_UNAVAILABLE', 'GitHub returned an empty response.', 502)
  const declaredSize = Number(response.headers.get('content-length') || 0)
  if (declaredSize > maxBytes) {
    await response.body.cancel()
    throw new SafeError('TOO_LARGE', 'GitHub returned a response larger than this analysis can safely process.', 413)
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) {
        await reader.cancel()
        throw new SafeError('TOO_LARGE', 'GitHub returned a response larger than this analysis can safely process.', 413)
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const joined = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength }
  return new TextDecoder().decode(joined)
}

function segment(value: string): string { return encodeURIComponent(value) }
function objectField(value: Record<string, unknown>, key: string): Record<string, unknown> {
  const result = value[key]
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new SafeError('GITHUB_UNAVAILABLE', 'GitHub returned an incomplete response.', 502)
  return result as Record<string, unknown>
}
function stringField(value: Record<string, unknown>, key: string): string {
  const result = value[key]
  if (typeof result !== 'string') throw new SafeError('GITHUB_UNAVAILABLE', 'GitHub returned an incomplete response.', 502)
  return result
}
function numberField(value: Record<string, unknown>, key: string): number {
  const result = value[key]
  return typeof result === 'number' && Number.isFinite(result) ? result : 0
}
