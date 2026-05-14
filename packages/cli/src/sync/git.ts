import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

const exec = promisify(execFile)

export interface GitSyncConfig {
  repo: string
  token: string
  /** Local directory to clone the repo into */
  cacheDir: string
}

export class GitSyncBackend {
  private repo: string
  private token: string
  private cacheDir: string
  private dataDir: string

  constructor(config: GitSyncConfig) {
    this.repo = config.repo
    this.token = config.token
    this.cacheDir = config.cacheDir
    this.dataDir = join(config.cacheDir, 'data')
  }

  private get remoteUrl(): string {
    return `https://x-access-token:${this.token}@github.com/${this.repo}.git`
  }

  private async git(args: string[], cwd?: string): Promise<string> {
    const { stdout } = await exec('git', args, {
      cwd: cwd ?? this.cacheDir,
      timeout: 60_000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    })
    return stdout.trim()
  }

  /** Clone or pull the repo to get latest remote state */
  async prepare(): Promise<void> {
    try {
      await stat(join(this.cacheDir, '.git'))
      // Repo exists — pull latest
      await this.git(['fetch', 'origin', 'main', '--depth=1'])
      await this.git(['reset', '--hard', 'origin/main'])
    } catch {
      // First time — shallow clone
      await mkdir(this.cacheDir, { recursive: true })
      await exec('git', ['clone', '--depth=1', this.remoteUrl, this.cacheDir], {
        timeout: 120_000,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      })
    }
  }

  async readFile(path: string): Promise<{ sha: string; content: string } | null> {
    try {
      const fullPath = join(this.dataDir, path)
      const content = await readFile(fullPath, 'utf-8')
      return { sha: '', content }
    } catch {
      return null
    }
  }

  async writeFile(path: string, content: string, _sha?: string): Promise<void> {
    const fullPath = join(this.dataDir, path)
    await mkdir(join(fullPath, '..'), { recursive: true })
    await writeFile(fullPath, content, 'utf-8')
  }

  async listFiles(): Promise<string[]> {
    try {
      return await this.walkDir(this.dataDir, '')
    } catch {
      return []
    }
  }

  /** Commit and push all changes. Returns true if anything was pushed. */
  async flush(): Promise<boolean> {
    // Check if there are any changes
    const status = await this.git(['status', '--porcelain'])
    if (!status) return false

    await this.git(['add', 'data/'])
    await this.git(['commit', '-m', `sync ${new Date().toISOString()}`])
    await this.git(['push', 'origin', 'main'])
    return true
  }

  private async walkDir(dir: string, prefix: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true })
    const files: string[] = []

    for (const entry of entries) {
      const relPath = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        files.push(...await this.walkDir(join(dir, entry.name), relPath))
      } else if (entry.name.endsWith('.ndjson')) {
        files.push(relPath)
      }
    }

    return files.sort()
  }
}
