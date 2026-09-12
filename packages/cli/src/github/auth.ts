import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { AIUSAGE_DIR, loadConfig, loadCredential, saveConfig, type Config, type SyncConfig } from '../config.js'
import { acquireLock, releaseLock } from '../lock.js'
import { loadGitHubCredentials, saveGitHubCredentials, type GitHubCredentials } from './credentials.js'
import { GitHubAuthError } from './errors.js'
export { GitHubAuthError, safeGitHubError } from './errors.js'

export function validateRepo(repo: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(repo) || repo.endsWith('/.') || repo.endsWith('/..')) {
    throw new GitHubAuthError('Use a GitHub repository in owner/repo format.')
  }
}
export function appSettings() {
  const clientId = process.env.AIUSAGE_GITHUB_APP_CLIENT_ID ?? ''
  const slug = process.env.AIUSAGE_GITHUB_APP_SLUG ?? ''
  if (!/^Iv[0-9A-Za-z.]+$/.test(clientId) || !/^[a-z0-9-]+$/.test(slug)) {
    throw new GitHubAuthError('Set AIUSAGE_GITHUB_APP_CLIENT_ID and AIUSAGE_GITHUB_APP_SLUG to your GitHub App registration, then retry. Advanced fallback: AIUSAGE_GITHUB_TOKEN.')
  }
  return { clientId, installUrl: `https://github.com/apps/${slug}/installations/new` }
}
async function oauth(body: Record<string, string>, device = false): Promise<any> {
  try {
    const res = await fetch(`https://github.com/login/${device ? 'device/code' : 'oauth/access_token'}`, {
      method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body), signal: AbortSignal.timeout(30_000), redirect: 'error',
    })
    if (!res.ok) throw new Error()
    return await res.json()
  } catch { throw new GitHubAuthError('GitHub authorization request failed. Check connectivity and try again.') }
}
export async function githubApi<T = any>(token: string, path: string): Promise<T> {
  try {
    const res = await fetch(`https://api.github.com${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      signal: AbortSignal.timeout(30_000), redirect: 'error',
    })
    if (!res.ok) throw new Error()
    return await res.json() as T
  } catch { throw new GitHubAuthError('GitHub API request failed. Check connectivity, authorization, and repository access.') }
}
export interface DeviceAuthorization {
  clientId: string; deviceCode: string; userCode: string; verificationUrl: string
  expiresAt: number; interval: number; nextPollAt: number
}
export async function startDeviceAuthorization(): Promise<DeviceAuthorization> {
  const { clientId } = appSettings()
  const data = await oauth({ client_id: clientId }, true)
  if (typeof data.device_code !== 'string' || !/^[A-Z0-9-]+$/.test(data.user_code) || data.verification_uri !== 'https://github.com/login/device'
    || !(data.expires_in > 0) || !(data.interval > 0)) throw new GitHubAuthError('GitHub device authorization is unavailable. Enable device flow in the GitHub App settings.')
  const interval = Math.max(5, data.interval) * 1000
  return { clientId, deviceCode: data.device_code, userCode: data.user_code, verificationUrl: data.verification_uri,
    expiresAt: Date.now() + Math.min(data.expires_in, 900) * 1000, interval, nextPollAt: Date.now() + interval }
}
function tokens(data: any, clientId: string): GitHubCredentials {
  if (typeof data.access_token !== 'string' || !data.access_token.startsWith('ghu_') || data.scope) {
    throw new GitHubAuthError('GitHub App authorization failed. Run aiusage github login again.')
  }
  if (data.expires_in !== undefined && (!(data.expires_in > 0) || typeof data.refresh_token !== 'string' || !(data.refresh_token_expires_in > 0))) {
    throw new GitHubAuthError('GitHub returned invalid token expiration data. Please sign in again.')
  }
  return { method: 'github-app', clientId, accessToken: data.access_token, refreshToken: data.refresh_token,
    expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
    refreshExpiresAt: data.refresh_token_expires_in ? Date.now() + data.refresh_token_expires_in * 1000 : undefined }
}
/** One poll, shared by CLI and local API. Enforce timing on the server as well as the client. */
export async function pollDeviceAuthorization(flow: DeviceAuthorization): Promise<GitHubCredentials | null> {
  if (Date.now() >= flow.expiresAt) throw new GitHubAuthError('GitHub authorization expired. Connect GitHub again.')
  if (Date.now() < flow.nextPollAt) return null
  // Reserve the interval before awaiting network I/O to prevent overlapping polls.
  flow.nextPollAt = Date.now() + flow.interval
  const data = await oauth({ client_id: flow.clientId, device_code: flow.deviceCode, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' })
  if (data.error === 'authorization_pending') return null
  if (data.error === 'slow_down') { flow.interval += 5000; flow.nextPollAt = Date.now() + flow.interval; return null }
  if (data.error === 'access_denied') throw new GitHubAuthError('GitHub authorization denied. Connect GitHub again when ready.')
  if (data.error === 'expired_token') throw new GitHubAuthError('GitHub authorization expired. Connect GitHub again.')
  if (data.error) throw new GitHubAuthError('GitHub authorization failed. Check the App device-flow settings and retry.')
  return tokens(data, flow.clientId)
}
export interface RepositoryChoice { repo: string; installationId: number; branch: string }
export async function installationRepositories(token: string): Promise<RepositoryChoice[]> {
  const result: RepositoryChoice[] = []
  for (let page = 1; ; page++) {
    const { installations } = await githubApi(token, `/user/installations?per_page=100&page=${page}`)
    for (const installation of installations) {
      if (installation.suspended_at || installation.permissions?.contents !== 'write') continue
      for (let rp = 1; ; rp++) {
        const { repositories } = await githubApi(token, `/user/installations/${installation.id}/repositories?per_page=100&page=${rp}`)
        for (const repo of repositories) {
          if (repo.permissions?.push && !repo.archived) result.push({ repo: repo.full_name, installationId: installation.id, branch: repo.default_branch })
        }
        if (repositories.length < 100) break
      }
    }
    if (installations.length < 100) break
  }
  return result
}
export function connectRepository(creds: GitHubCredentials, login: string, choice: RepositoryChoice): void {
  validateRepo(choice.repo)
  if (creds.method !== 'github-app') throw new GitHubAuthError('GitHub App credentials required.')
  const credentialId = saveGitHubCredentials(creds)
  const config = loadConfig() ?? {}
  config.sync = { backend: 'github', repo: choice.repo, branch: choice.branch,
    githubAuth: { method: 'github-app', credentialId, login, installationId: choice.installationId, clientId: creds.clientId } }
  saveConfig(config)
}

/** Refresh is serialized across CLI/dashboard processes; reload after acquiring the lock. */
export async function githubToken(sync: SyncConfig): Promise<string> {
  const auth = sync.githubAuth
  if (!auth || auth.method === 'pat') {
    const token = process.env.AIUSAGE_GITHUB_TOKEN || (auth?.credentialId ? loadGitHubCredentials(auth.credentialId)?.accessToken : loadCredential(`github/${sync.repo}/token`))
    if (!token) throw new GitHubAuthError('GitHub is not connected. Run aiusage github login or configure an advanced PAT.')
    return token
  }
  mkdirSync(AIUSAGE_DIR, { recursive: true, mode: 0o700 })
  const lock = join(AIUSAGE_DIR, 'github-refresh.lock')
  const deadline = Date.now() + 35_000
  while (!acquireLock(lock)) {
    if (Date.now() >= deadline) throw new GitHubAuthError('GitHub credentials are busy. Retry shortly.')
    await sleep(100)
  }
  try {
    let creds = loadGitHubCredentials(auth.credentialId)
    if (!creds || creds.method !== 'github-app' || creds.clientId !== auth.clientId) throw new GitHubAuthError('GitHub credentials are unavailable. Run aiusage github login again.')
    if (creds.expiresAt && creds.expiresAt <= Date.now() + 60_000) {
      if (!creds.refreshToken || !creds.refreshExpiresAt || creds.refreshExpiresAt <= Date.now()) throw new GitHubAuthError('GitHub authorization expired. Run aiusage github login again.')
      creds = tokens(await oauth({ client_id: creds.clientId, grant_type: 'refresh_token', refresh_token: creds.refreshToken }), creds.clientId)
      saveGitHubCredentials(creds, auth.credentialId)
    }
    return creds.accessToken
  } finally { releaseLock(lock) }
}

/** New PATs use the same secure store. Existing config.json PATs remain readable. */
export function setPat(config: Config, token: string): void {
  if (!config.sync?.repo) throw new GitHubAuthError('Select a repository first.')
  validateRepo(config.sync.repo)
  config.sync.githubAuth = { method: 'pat', credentialId: saveGitHubCredentials({ method: 'pat', accessToken: token }) }
  delete config.sync.credentialRef
  if (config.credentials) delete config.credentials[`github/${config.sync.repo}/token`]
}
