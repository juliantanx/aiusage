export interface GitHubConfig {
  repo: string
  token: string
}

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

  async readFile(path: string): Promise<{ sha: string; content: string } | null> {
    const url = this.getFileUrl(path)
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    })

    if (response.status === 404) return null
    if (!response.ok) throw new Error(`GitHub API error: ${response.status}`)

    const data = await response.json()
    return {
      sha: data.sha,
      content: Buffer.from(data.content, 'base64').toString('utf-8'),
    }
  }

  async writeFile(path: string, content: string, sha?: string): Promise<void> {
    const url = this.getFileUrl(path)
    const body: any = {
      message: `Update ${path}`,
      content: Buffer.from(content).toString('base64'),
    }
    if (sha) body.sha = sha

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) throw new Error(`GitHub API error: ${response.status}`)
  }

  async listFiles(): Promise<string[]> {
    // List year directories under data/
    const dataUrl = `${this.baseUrl}/repos/${this.repo}/contents/data/`
    const dataResponse = await fetch(dataUrl, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    })
    if (dataResponse.status === 404) return []
    if (!dataResponse.ok) throw new Error(`GitHub API error: ${dataResponse.status}`)

    const years = await dataResponse.json()
    const files: string[] = []

    for (const year of years) {
      if (year.type !== 'dir') continue
      const yearUrl = `${this.baseUrl}/repos/${this.repo}/contents/data/${year.name}/`
      const monthResponse = await fetch(yearUrl, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      })
      if (!monthResponse.ok) continue
      const months = await monthResponse.json()
      for (const month of months) {
        if (month.type === 'file' && month.name.endsWith('.ndjson')) {
          files.push(`${year.name}/${month.name}`)
        }
      }
    }

    return files.sort()
  }
}
