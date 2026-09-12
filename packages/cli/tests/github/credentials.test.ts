import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ values: new Map<string, string>(), unavailable: false, directory: '' }))
vi.mock('../../src/config.js', () => ({ get AIUSAGE_DIR() { return mock.directory } }))
vi.mock('node:module', () => ({ createRequire: () => () => ({ Entry: class {
  constructor(private service: string, private id: string) {}
  setPassword(value: string) { if (mock.unavailable) throw new Error('secret in native exception'); mock.values.set(this.id, value) }
  getPassword() { if (mock.unavailable) throw new Error('secret in native exception'); return mock.values.get(this.id) ?? null }
} }) }))
let store: typeof import('../../src/github/credentials.js')
const nativePlatform = process.platform
beforeEach(async () => {
  mock.directory = mkdtempSync(join(tmpdir(), 'aiusage-credential-test-')); mock.values.clear(); mock.unavailable = false
  vi.resetModules(); store = await import('../../src/github/credentials.js')
})
afterEach(() => { Object.defineProperty(process, 'platform', { value: nativePlatform }); rmSync(mock.directory, { recursive: true, force: true }) })
describe('secure GitHub credential storage', () => {
  it('prefers OS keychain and keeps credentials off disk', () => {
    const creds = { method: 'pat' as const, accessToken: 'test-secret' }
    const id = store.saveGitHubCredentials(creds)
    expect(store.loadGitHubCredentials(id)).toEqual(creds)
    expect(existsSync(join(mock.directory, 'github-credentials'))).toBe(false)
  })
  it('never downgrades an existing keychain record on refresh', () => {
    const id = store.saveGitHubCredentials({ method: 'pat', accessToken: 'old' }); mock.unavailable = true
    expect(() => store.saveGitHubCredentials({ method: 'pat', accessToken: 'new' }, id)).toThrow('securely save')
    expect(existsSync(join(mock.directory, 'github-credentials'))).toBe(false)
    expect(() => store.loadGitHubCredentials(id)).toThrow('Cannot read')
  })
  it('fails closed on Windows if Credential Manager is unavailable', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' }); mock.unavailable = true
    expect(() => store.saveGitHubCredentials({ method: 'pat', accessToken: 'test-secret' })).toThrow('securely save')
    expect(existsSync(join(mock.directory, 'github-credentials'))).toBe(false)
  })
  it.skipIf(nativePlatform === 'win32')('uses atomic owner-only files on POSIX, including after replacement', () => {
    mock.unavailable = true
    const id = store.saveGitHubCredentials({ method: 'pat', accessToken: 'test-secret' })
    const dir = join(mock.directory, 'github-credentials'), path = join(dir, `${id}.json`)
    expect(statSync(dir).mode & 0o777).toBe(0o700); expect(statSync(path).mode & 0o777).toBe(0o600)
    chmodSync(path, 0o644)
    store.saveGitHubCredentials({ method: 'pat', accessToken: 'replacement' }, id)
    expect(statSync(path).mode & 0o777).toBe(0o600)
    expect(JSON.parse(readFileSync(path, 'utf8')).accessToken).toBe('replacement')
  })
  it('rejects path traversal references', () => {
    expect(() => store.loadGitHubCredentials('../../config')).toThrow('Invalid')
  })
})
