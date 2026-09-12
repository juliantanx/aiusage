import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { AIUSAGE_DIR } from '../config.js'
import { GitHubAuthError } from './errors.js'

export type GitHubCredentials = { method: 'pat'; accessToken: string } | {
  method: 'github-app'; accessToken: string; refreshToken?: string
  expiresAt?: number; refreshExpiresAt?: number; clientId: string
}
const require = createRequire(import.meta.url)
const directory = join(AIUSAGE_DIR, 'github-credentials')

function file(id: string): string {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid GitHub credential reference')
  return join(directory, `${id}.json`)
}
function entry(id: string) {
  file(id)
  const { Entry } = require('@napi-rs/keyring')
  return new Entry('aiusage.github', id)
}
function privateDirectory() {
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  if (lstatSync(directory).isSymbolicLink()) throw new Error('Unsafe credential directory')
  chmodSync(directory, 0o700)
}

/** Prefer the native keychain. A POSIX fallback is atomic and owner-only.
 * Windows must use Credential Manager: chmod alone does not secure a Windows file.
 * Once a record has a storage location, refresh never silently switches stores.
 */
export function saveGitHubCredentials(creds: GitHubCredentials, existingId?: string): string {
  const id = existingId ?? randomUUID()
  const path = file(id)
  const data = JSON.stringify(creds)
  try {
    if (!existsSync(path)) {
      try { entry(id).setPassword(data); return id } catch {
        // Only a new record may fall back. Refresh must not lose a rotated pair.
        if (existingId) throw new Error('Keychain unavailable')
      }
    }
    if (process.platform === 'win32') throw new Error('Keychain unavailable')
    privateDirectory()
    const temp = `${path}.${randomUUID()}.tmp`
    try {
      writeFileSync(temp, data, { mode: 0o600, flag: 'wx' })
      renameSync(temp, path)
      chmodSync(path, 0o600)
    } finally { try { unlinkSync(temp) } catch { /* already renamed */ } }
    return id
  } catch {
    throw new GitHubAuthError('Cannot securely save GitHub credentials. Unlock the OS keychain or use AIUSAGE_GITHUB_TOKEN for manual PAT authentication.')
  }
}

export function loadGitHubCredentials(id: string): GitHubCredentials | null {
  const path = file(id)
  try {
    if (existsSync(path)) {
      if (process.platform === 'win32') throw new Error('Unsafe credential file')
      privateDirectory()
      if (lstatSync(path).isSymbolicLink()) throw new Error('Unsafe credential file')
      chmodSync(path, 0o600)
      return JSON.parse(readFileSync(path, 'utf8'))
    }
    const value = entry(id).getPassword()
    return value ? JSON.parse(value) : null
  } catch {
    throw new GitHubAuthError('Cannot read GitHub credentials. Unlock the OS keychain or run aiusage github login again.')
  }
}
