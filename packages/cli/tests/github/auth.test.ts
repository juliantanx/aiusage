import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('../../src/config.js', () => ({ AIUSAGE_DIR: '/tmp/aiusage-github-tests', loadConfig: vi.fn(() => ({})), saveConfig: vi.fn(), loadCredential: vi.fn() }))
vi.mock('../../src/github/credentials.js', () => ({ loadGitHubCredentials: vi.fn(), saveGitHubCredentials: vi.fn(() => '11111111-1111-1111-1111-111111111111') }))
vi.mock('../../src/lock.js', () => ({ acquireLock: vi.fn(() => true), releaseLock: vi.fn() }))
vi.mock('node:fs', () => ({ mkdirSync: vi.fn() }))
vi.mock('../../src/commands/init.js', () => ({ runInit: vi.fn(() => ({ success: true })) }))
import { connectRepository, githubToken, installationRepositories, pollDeviceAuthorization, safeGitHubError, setPat, startDeviceAuthorization } from '../../src/github/auth.js'
import { loadGitHubCredentials, saveGitHubCredentials } from '../../src/github/credentials.js'
import { loadCredential, saveConfig, type Config, type SyncConfig } from '../../src/config.js'
import { acquireLock, releaseLock } from '../../src/lock.js'
import { credentialStatus, publicSyncConfig } from '../../src/api/credential-settings.js'
import { createGitHubDeviceSessions } from '../../src/github/device-sessions.js'

const fetchMock = vi.fn()
const reply = (data: unknown) => fetchMock.mockResolvedValueOnce({ ok: true, json: async () => data })
const pair = { access_token: 'ghu_private', refresh_token: 'ghr_private', expires_in: 28800, refresh_token_expires_in: 15897600, scope: '' }
const sync: SyncConfig = { backend: 'github', repo: 'owner/data', githubAuth: { method: 'github-app', credentialId: '11111111-1111-1111-1111-111111111111', login: 'owner', installationId: 1, clientId: 'Iv1.test' } }
async function start() {
  reply({ device_code: 'private-device-code', user_code: 'ABCD-1234', verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 5 })
  const flow = await startDeviceAuthorization()
  vi.setSystemTime(flow.nextPollAt)
  return flow
}
beforeEach(() => {
  vi.clearAllMocks(); fetchMock.mockReset(); vi.useFakeTimers(); vi.setSystemTime(1_000_000)
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('AIUSAGE_GITHUB_APP_CLIENT_ID', 'Iv1.test'); vi.stubEnv('AIUSAGE_GITHUB_APP_SLUG', 'aiusage-sync')
  vi.stubEnv('AIUSAGE_GITHUB_TOKEN', '')
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('GitHub App device authorization', () => {
  it('authorizes with a public client ID and no OAuth repo scope or secret', async () => {
    const flow = await start(); reply(pair)
    expect(await pollDeviceAuthorization(flow)).toMatchObject({ method: 'github-app', accessToken: pair.access_token, refreshToken: pair.refresh_token, expiresAt: Date.now() + 28800_000 })
    const startBody = fetchMock.mock.calls[0][1].body as URLSearchParams
    expect([...startBody.keys()]).toEqual(['client_id'])
    const body = fetchMock.mock.calls[1][1].body as URLSearchParams
    expect(body.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:device_code')
    expect(body.has('client_secret')).toBe(false)
  })
  it('enforces pending and cumulative slow-down polling intervals', async () => {
    const flow = await start(); reply({ error: 'authorization_pending' })
    expect(await pollDeviceAuthorization(flow)).toBeNull()
    expect(await pollDeviceAuthorization(flow)).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    vi.setSystemTime(flow.nextPollAt); reply({ error: 'slow_down' })
    await pollDeviceAuthorization(flow); expect(flow.interval).toBe(10000)
    vi.setSystemTime(flow.nextPollAt); reply({ error: 'slow_down' })
    await pollDeviceAuthorization(flow); expect(flow.interval).toBe(15000)
  })
  it.each([['access_denied', 'denied'], ['expired_token', 'expired'], ['incorrect_device_code', 'failed']])('handles %s without echoing response data', async (error, message) => {
    const flow = await start(); reply({ error, error_description: 'ghu_secret private-device-code' })
    await expect(pollDeviceAuthorization(flow)).rejects.toThrow(message)
  })
  it('does not poll beyond local expiry', async () => {
    const flow = await start(); vi.setSystemTime(flow.expiresAt)
    await expect(pollDeviceAuthorization(flow)).rejects.toThrow('expired')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('rejects conventional OAuth App tokens and unsafe verification URLs', async () => {
    const flow = await start(); reply({ access_token: 'gho_oauth', scope: 'repo' })
    await expect(pollDeviceAuthorization(flow)).rejects.toThrow('GitHub App')
    reply({ device_code: 'secret', user_code: 'CODE', verification_uri: 'https://evil.example', expires_in: 10, interval: 5 })
    await expect(startDeviceAuthorization()).rejects.toThrow('unavailable')
  })
  it('sanitizes transport errors, nested causes, and arbitrary remote errors', async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new Error('ghu_secret ghr_secret private-device-code'), { cause: 'secret' }))
    await expect(startDeviceAuthorization()).rejects.toThrow('request failed')
    expect(safeGitHubError(new Error('ghu_secret'))).not.toContain('ghu_secret')
  })
})
describe('credentials, refresh and compatibility', () => {
  it('rotates both tokens automatically without a client secret', async () => {
    vi.mocked(loadGitHubCredentials).mockReturnValue({ method: 'github-app', clientId: 'Iv1.test', accessToken: 'ghu_old', refreshToken: 'ghr_old', expiresAt: Date.now(), refreshExpiresAt: Date.now() + 100000 })
    reply(pair)
    expect(await githubToken(sync)).toBe('ghu_private')
    expect(saveGitHubCredentials).toHaveBeenCalledWith(expect.objectContaining({ accessToken: 'ghu_private', refreshToken: 'ghr_private' }), sync.githubAuth!.credentialId)
    expect(fetchMock.mock.calls[0][1].body.get('client_secret')).toBeNull()
    expect(releaseLock).toHaveBeenCalled()
  })
  it('reuses valid and non-expiring tokens without refreshing', async () => {
    vi.mocked(loadGitHubCredentials).mockReturnValue({ method: 'github-app', clientId: 'Iv1.test', accessToken: 'ghu_valid' })
    expect(await githubToken(sync)).toBe('ghu_valid'); expect(fetchMock).not.toHaveBeenCalled()
  })
  it('requires reauthentication on expired refresh tokens and releases the lock', async () => {
    vi.mocked(loadGitHubCredentials).mockReturnValue({ method: 'github-app', clientId: 'Iv1.test', accessToken: 'ghu_old', refreshToken: 'ghr_old', expiresAt: Date.now(), refreshExpiresAt: Date.now() })
    await expect(githubToken(sync)).rejects.toThrow('login again')
    expect(fetchMock).not.toHaveBeenCalled(); expect(releaseLock).toHaveBeenCalled()
  })
  it('reloads credentials after waiting for another process to refresh', async () => {
    vi.mocked(acquireLock).mockReturnValueOnce(false).mockReturnValue(true)
    vi.mocked(loadGitHubCredentials).mockReturnValue({ method: 'github-app', clientId: 'Iv1.test', accessToken: 'ghu_rotated' })
    const result = githubToken(sync)
    await vi.advanceTimersByTimeAsync(100)
    expect(await result).toBe('ghu_rotated'); expect(fetchMock).not.toHaveBeenCalled()
  })
  it('preserves legacy PAT access without reauthentication or rewriting config', async () => {
    vi.mocked(loadCredential).mockReturnValue('legacy-pat')
    expect(await githubToken({ backend: 'github', repo: 'owner/data' })).toBe('legacy-pat')
    expect(saveConfig).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled()
  })
  it('uses an environment PAT only in PAT mode, not to override App credentials', async () => {
    vi.stubEnv('AIUSAGE_GITHUB_TOKEN', 'ci-pat')
    expect(await githubToken({ backend: 'github', repo: 'owner/data', githubAuth: { method: 'pat' } })).toBe('ci-pat')
    vi.mocked(loadGitHubCredentials).mockReturnValue({ method: 'github-app', clientId: 'Iv1.test', accessToken: 'ghu_app' })
    expect(await githubToken(sync)).toBe('ghu_app')
  })
  it('migrates a replaced PAT to the secure store and removes its old config value', () => {
    const config: Config = { sync: { backend: 'github', repo: 'owner/data', credentialRef: 'github/owner/data/token' }, credentials: { 'github/owner/data/token': 'old' } }
    setPat(config, 'new')
    expect(config.sync?.githubAuth?.method).toBe('pat'); expect(JSON.stringify(config)).not.toContain('"old"')
    expect(JSON.stringify(config)).not.toContain('"new"'); expect(config.sync?.credentialRef).toBeUndefined()
  })
  it('does not leak credential IDs or token data through public settings/status', () => {
    const publicConfig = publicSyncConfig(sync)
    expect(publicConfig?.githubAuth).toEqual({ method: 'github-app', login: 'owner' })
    expect(JSON.stringify(publicConfig)).not.toContain(sync.githubAuth!.credentialId!)
    expect(credentialStatus({ sync })).toEqual({ githubApp: true, githubToken: false })
  })
})
describe('repository selection', () => {
  it('selects only writable, active repositories in installations with Contents write', async () => {
    reply({ installations: [{ id: 1, permissions: { contents: 'read' } }, { id: 2, permissions: { contents: 'write' } }] })
    reply({ repositories: [{ full_name: 'owner/read', permissions: { push: false } }, { full_name: 'owner/data', permissions: { push: true }, default_branch: 'master' }] })
    expect(await installationRepositories('ghu_test')).toEqual([{ repo: 'owner/data', installationId: 2, branch: 'master' }])
    connectRepository({ method: 'github-app', clientId: 'Iv1.test', accessToken: 'ghu_test' }, 'owner', { repo: 'owner/data', installationId: 2, branch: 'master' })
    expect(saveConfig).toHaveBeenCalledWith(expect.objectContaining({ sync: expect.objectContaining({ branch: 'master', githubAuth: expect.objectContaining({ method: 'github-app', installationId: 2 }) }) }))
    expect(JSON.stringify(vi.mocked(saveConfig).mock.calls)).not.toContain('ghu_test')
  })
})

describe('local dashboard device sessions', () => {
  it('completes device authorization and repository installation without exposing credentials', async () => {
    const action = createGitHubDeviceSessions()
    reply({ device_code: 'private-device-code', user_code: 'ABCD-1234', verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 5 })
    const startResponse = await action('start', {})
    expect(JSON.stringify(startResponse)).not.toContain('private-device-code')
    const body = { sessionId: startResponse.sessionId }
    vi.setSystemTime(Date.now() + 5000); reply(pair); reply({ login: 'owner', id: 10 })
    const poll = await action('poll', body)
    expect(poll).toEqual({ status: 'authorized', login: 'owner' })
    reply({ installations: [{ id: 2, permissions: { contents: 'write' } }] })
    reply({ repositories: [{ full_name: 'owner/data', permissions: { push: true }, default_branch: 'main' }] })
    const repos = await action('repositories', body)
    reply({ installations: [{ id: 2, permissions: { contents: 'write' } }] })
    reply({ repositories: [{ full_name: 'owner/data', permissions: { push: true }, default_branch: 'main' }] })
    const connected = await action('connect', { ...body, repo: 'owner/data' })
    expect(connected.ok).toBe(true)
    const responses = JSON.stringify([startResponse, poll, repos, connected, vi.mocked(saveConfig).mock.calls])
    expect(responses).not.toMatch(/ghu_private|ghr_private|private-device-code/)
    await expect(action('connect', { ...body, repo: 'owner/data' })).rejects.toThrow('expired')
  })
  it('requires an unpredictable session capability and invalidates cancelled sessions', async () => {
    const action = createGitHubDeviceSessions()
    await expect(action('poll', { sessionId: 'guessed' })).rejects.toThrow('expired')
    reply({ device_code: 'secret', user_code: 'CODE', verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 5 })
    const response = await action('start', {})
    await action('cancel', { sessionId: response.sessionId })
    await expect(action('poll', { sessionId: response.sessionId })).rejects.toThrow('expired')
  })
})
