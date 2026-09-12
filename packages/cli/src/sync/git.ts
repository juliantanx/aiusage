import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, writeFile, mkdir, readdir, stat, unlink, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { gitCredentialOptions } from '../github/git-credentials.js'
import { validateRepo, GitHubAuthError } from '../github/auth.js'

const exec = promisify(execFile)

export interface GitSyncConfig {
  repo: string
  token?: string
  getToken?: () => Promise<string>
  /** Local directory to clone the repo into */
  cacheDir: string
  /** Branch to sync with (default: 'main') */
  branch?: string
}

export class GitSyncBackend {
  private repo: string
  private getToken: () => Promise<string>
  private cacheDir: string
  private dataDir: string
  private branch: string

  constructor(config: GitSyncConfig) {
    validateRepo(config.repo)
    this.repo = config.repo
    this.getToken = config.getToken ?? (async () => config.token ?? '')
    this.cacheDir = config.cacheDir
    this.dataDir = join(config.cacheDir, 'data')
    this.branch = config.branch ?? 'main'
    if (!/^[A-Za-z0-9][A-Za-z0-9_./-]*$/.test(this.branch) || this.branch.includes('..')) throw new Error('Invalid GitHub sync branch')
  }

  private get remoteUrl(): string {
    return `https://github.com/${this.repo}.git`
  }

  private async git(args: string[], cwd?: string): Promise<string> {
    const network = ['clone', 'fetch', 'pull', 'push'].includes(args[0])
    try {
      const token = network ? await this.getToken() : undefined
      const credentials = gitCredentialOptions(this.repo, token)
      const { stdout } = await exec('git', [...credentials.args, ...args], {
        cwd: cwd ?? this.cacheDir,
        timeout: 60_000,
        env: credentials.env,
        windowsHide: true,
      })
      // Network output is never consumed or surfaced: servers can echo secrets.
      return network ? '' : stdout.trim()
    } catch (error) {
      if (error instanceof GitHubAuthError) throw error
      // Never retain child-process message, stack, stdout, stderr, cmd, or cause.
      throw new Error('GitHub Git operation failed or was rejected. Check repository access, network connectivity, and Git identity.')
    }
  }

  /** Clone or pull the repo to get latest remote state */
  async prepare(): Promise<void> {
    let exists = false
    try {
      await stat(join(this.cacheDir, '.git'))
      exists = true
    } catch { /* clone below */ }
    if (exists) {
      // Remove legacy authenticated URLs before any Git operation. Do not expose
      // the old config via subprocess output or errors, even on migration failure.
      try {
        const path = join(this.cacheDir, '.git', 'config')
        const config = await readFile(path, 'utf8')
        await writeFile(path, config.replace(/https:\/\/[^\s/]*@github\.com/gi, 'https://github.com'), { mode: 0o600 })
      } catch { throw new Error('Cannot migrate the GitHub sync cache configuration.') }
      await this.git(['config', '--replace-all', 'remote.origin.url', this.remoteUrl])
      await this.git(['config', '--replace-all', 'remote.origin.pushurl', this.remoteUrl])
      await this.git(['fetch', this.remoteUrl, this.branch, '--depth=1'])
      await this.git(['checkout', '-f', '-B', this.branch, 'FETCH_HEAD'])
    } else {
      await mkdir(this.cacheDir, { recursive: true })
      await this.git(['clone', '--depth=1', '--branch', this.branch, this.remoteUrl, this.cacheDir], this.cacheDir)
    }
  }

  async readFile(path: string): Promise<string | null> {
    try {
      const fullPath = join(this.dataDir, path)
      return await readFile(fullPath, 'utf-8')
    } catch {
      return null
    }
  }

  async writeFile(path: string, content: string): Promise<void> {
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

  async deleteFile(path: string): Promise<void> {
    const fullPath = join(this.dataDir, path)
    try {
      await unlink(fullPath)
    } catch {
      // file may not exist
    }
  }

  async deleteAllData(): Promise<number> {
    try {
      const files = await this.listFiles()
      await rm(this.dataDir, { recursive: true, force: true })
      return files.length
    } catch {
      return 0
    }
  }

  private static readonly MAX_PUSH_RETRIES = 3

  /** Commit and push all changes. Returns true if anything was pushed. */
  async flush(): Promise<boolean> {
    const status = await this.git(['status', '--porcelain'])
    if (!status) return false

    await this.git(['add', 'data/'])
    await this.git(['commit', '-m', `sync ${new Date().toISOString()}`])

    for (let attempt = 1; attempt <= GitSyncBackend.MAX_PUSH_RETRIES; attempt++) {
      try {
        await this.git(['push', this.remoteUrl, this.branch])
        return true
      } catch (error) {
        if (attempt >= GitSyncBackend.MAX_PUSH_RETRIES) throw error
        await this.git(['pull', '--rebase', this.remoteUrl, this.branch])
      }
    }

    return false
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
