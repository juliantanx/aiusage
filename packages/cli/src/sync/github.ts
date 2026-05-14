import { ConflictError } from './index.js'

export interface GitHubConfig {
  repo: string
  token: string
}

const REQUEST_TIMEOUT_MS = 120_000

export class GitHubSyncBackend {
  private repo: string
  private token: string
  private baseUrl = 'https://api.github.com'

  constructor(config: GitHubConfig) {
    this.repo = config.repo
    this.token = config.token
  }

  getFileUrl(path: string): string {
    return `${this.baseUrl}/repos/${this.repo}/contents/data/${path}`
  }

  private async fetchWithTimeout(url: string, init: RequestInit, label: string): Promise<Response> {
    try {
      return await fetch(url, {
        ...init,
        signal: init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (error) {
      if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        throw new Error(`GitHub request timed out after ${REQUEST_TIMEOUT_MS}ms (${label})`)
      }
      throw error
    }
  }

  /**
   * Fetch with manual redirect handling to preserve the Authorization header.
   * GitHub Contents API returns 302 redirects which cause Node.js fetch to
   * drop the auth header on the redirected request, resulting in 400 errors.
   */
  private async authedFetch(url: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers)
    if (!headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${this.token}`)
    }
    if (!headers.has('User-Agent')) {
      headers.set('User-Agent', 'aiusage-sync/0.0.1')
    }
    if (!headers.has('X-GitHub-Api-Version')) {
      headers.set('X-GitHub-Api-Version', '2022-11-28')
    }

    let response = await this.fetchWithTimeout(url, { ...init, headers, redirect: 'manual' }, `${init.method ?? 'GET'} ${url}`)

    // Follow up to 5 redirects, preserving auth header
    for (let i = 0; i < 5 && response.status >= 300 && response.status < 400; i++) {
      const location = response.headers.get('location')
      if (!location) break
      response = await this.fetchWithTimeout(location, { ...init, headers, redirect: 'manual' }, `${init.method ?? 'GET'} ${location}`)
    }

    return response
  }

  private async githubError(label: string, response: Response): Promise<never> {
    const body = await response.text().catch(() => '')
    throw new Error(`GitHub API error (${label}): ${response.status} - ${body}`)
  }

  async readFile(path: string): Promise<{ sha: string; content: string } | null> {
    const url = this.getFileUrl(path)

    // First get the SHA via metadata
    const metaResponse = await this.authedFetch(url, {
      headers: { Accept: 'application/vnd.github.v3+json' },
    })

    if (metaResponse.status === 404) return null
    if (!metaResponse.ok) await this.githubError('read-meta', metaResponse)

    const meta = await metaResponse.json()

    // Fetch raw content to avoid base64 truncation for files >1MB
    const rawResponse = await this.authedFetch(url, {
      headers: { Accept: 'application/vnd.github.raw' },
    })

    if (!rawResponse.ok) await this.githubError('read-raw', rawResponse)

    return {
      sha: meta.sha,
      content: await rawResponse.text(),
    }
  }

  async writeFile(path: string, content: string, sha?: string): Promise<void> {
    const url = this.getFileUrl(path)
    const body: any = {
      message: `Update ${path}`,
      content: Buffer.from(content).toString('base64'),
    }
    if (sha) body.sha = sha

    const response = await this.authedFetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (response.status === 409) throw new ConflictError(path)
    if (!response.ok) await this.githubError('write', response)
  }

  async listFiles(): Promise<string[]> {
    const files = await this.listDirectory('data')
    return files
      .filter(path => path.endsWith('.ndjson'))
      .map(path => path.replace(/^data\//, ''))
      .sort()
  }

  private async listDirectory(path: string): Promise<string[]> {
    const url = `${this.baseUrl}/repos/${this.repo}/contents/${path}/`
    const response = await this.authedFetch(url, {
      headers: { Accept: 'application/vnd.github.v3+json' },
    })

    if (response.status === 404) return []
    if (!response.ok) await this.githubError(`list-${path}`, response)

    const entries = await response.json()
    const files: string[] = []

    for (const entry of entries) {
      if (entry.type === 'file') {
        files.push(entry.path)
        continue
      }
      if (entry.type === 'dir') {
        files.push(...await this.listDirectory(entry.path))
      }
    }

    return files
  }
}
