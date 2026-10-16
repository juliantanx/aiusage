// packages/cli/tests/api/server-config.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import http from 'node:http'
import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { initializeDatabase } from '../../src/db/index.js'
vi.mock('../../src/github/credentials.js', () => ({
  saveGitHubCredentials: vi.fn(() => '11111111-1111-1111-1111-111111111111'),
  loadGitHubCredentials: vi.fn(),
  deleteGitHubCredentials: vi.fn(),
}))

vi.mock('../../src/config.js', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  // Inside the test home (tests/setup-home.ts): the settings lock the
  // handlers take creates a file in this directory.
  const { homedir } = await import('node:os')
  const { join } = await import('node:path')
  const aiusageDir = join(homedir(), '.aiusage-server-config-test')
  return {
    ...actual,
    loadConfig: vi.fn(() => null),
    saveConfig: vi.fn(),
    AIUSAGE_DIR: aiusageDir,
    CONFIG_PATH: join(aiusageDir, 'config.json'),
    buildConsentConfig: vi.fn(() => null),
    loadCredential: vi.fn(() => null),
    saveCredential: vi.fn(),
    SYNC_FIELDS: [],
  }
})

vi.mock('../../src/init.js', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    getState: vi.fn(() => null),
    setState: vi.fn(),
    setSyncConsent: vi.fn(),
  }
})

import { createApiServer } from '../../src/api/server.js'
import { AIUSAGE_DIR, buildConsentConfig, loadConfig, saveConfig, loadCredential } from '../../src/config.js'
import { getState, setState, setSyncConsent } from '../../src/init.js'
import { deleteGitHubCredentials, saveGitHubCredentials } from '../../src/github/credentials.js'

/**
 * Whether another process can take the settings lock now, as one saving
 * state.json or config.json would. Runs synchronously, so called from inside
 * a mocked keychain write it blocks this process the way a keychain prompt
 * does.
 */
function lockFreeForAnotherProcess(): boolean {
  mkdirSync(AIUSAGE_DIR, { recursive: true })
  const child = spawnSync(process.execPath, ['-e', `
    const Database = require('better-sqlite3')
    const lock = new Database(process.argv[1], { timeout: 500 })
    try { lock.exec('BEGIN EXCLUSIVE'); lock.exec('COMMIT') } catch { process.exit(3) }
  `, join(AIUSAGE_DIR, 'settings.lock')], { cwd: join(__dirname, '..', '..'), stdio: ['ignore', 'ignore', 'inherit'] })
  return child.status === 0
}

describe('GET /api/config', () => {
  let db: Database.Database
  let server: http.Server
  let baseUrl: string

  beforeEach(async () => {
    vi.mocked(loadConfig).mockReturnValue(null)
    vi.mocked(saveConfig).mockReset()
    vi.mocked(buildConsentConfig).mockReturnValue(null)
    vi.mocked(getState).mockReturnValue(null as any)
    vi.mocked(setState).mockReset()
    vi.mocked(setSyncConsent).mockReset()
    db = new Database(':memory:')
    initializeDatabase(db)
    server = createApiServer(db)
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as { port: number }
        baseUrl = `http://127.0.0.1:${addr.port}`
        resolve()
      })
    })
  })

  afterEach(async () => {
    if (server?.listening) {
      server.closeIdleConnections?.()
      server.closeAllConnections?.()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
    db.close()
  })

  it('returns defaults when no config file exists', async () => {
    vi.mocked(loadConfig).mockReturnValue(null)
    const res = await fetch(`${baseUrl}/api/config`)
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.weekStart).toBe(1)
    expect(data.device).toBeNull()
    expect(data.retentionDays).toBeNull()
    expect(data).not.toHaveProperty('credentialKeys')
    expect(data.credentialStatus).toEqual({})
    expect(data).not.toHaveProperty('sources')
    expect(data.sync).toBeNull()
  })

  it('exposes only the GitHub App method and account, never stored credentials or references', async () => {
    vi.mocked(loadConfig).mockReturnValue({ sync: {
      backend: 'github', repo: 'owner/data', credentialRef: 'old-private-reference',
      githubAuth: { method: 'github-app', login: 'owner', clientId: 'Iv1.test', installationId: 1,
        credentialId: 'private-keychain-reference', accessToken: 'ghu_private', refreshToken: 'ghr_private' } as any,
    }, credentials: { legacy: 'secret' } })
    const response = await fetch(baseUrl + '/api/config')
    const data = await response.json()
    expect(data.sync.githubAuth).toEqual({ method: 'github-app', login: 'owner' })
    expect(data.credentialStatus).toEqual({ githubApp: true, githubToken: false })
    expect(JSON.stringify(data)).not.toMatch(/private|ghu_|ghr_|secret|credentialId|credentialRef/)
  })

  it('returns config values and masks credential values', async () => {
    vi.mocked(loadConfig).mockReturnValue({
      device: 'my-mac',
      weekStart: 0,
      retentionDays: 30,
      credentials: { GITHUB_TOKEN: 'super-secret' },
      sync: { backend: 'github', repo: 'user/repo', credentialRef: 'GITHUB_TOKEN' },
    } as any)
    const res = await fetch(`${baseUrl}/api/config`)
    const data = await res.json()
    expect(data.device).toBe('my-mac')
    expect(data.weekStart).toBe(0)
    expect(data.retentionDays).toBe(30)
    expect(data).not.toHaveProperty('credentialKeys')
    expect(data.sync).not.toHaveProperty('credentialRef')
    expect(JSON.stringify(data)).not.toContain('super-secret')
    expect(JSON.stringify(data)).not.toContain('GITHUB_TOKEN')
    expect(data).not.toHaveProperty('credentials')
    expect(data.sync.repo).toBe('user/repo')
    expect(data).not.toHaveProperty('sources')
  })
})

describe('PUT /api/config', () => {
  let db: Database.Database
  let server: http.Server
  let baseUrl: string
  let onConfigUpdated: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.mocked(loadConfig).mockReturnValue(null)
    vi.mocked(saveConfig).mockReset()
    vi.mocked(buildConsentConfig).mockReturnValue(null)
    vi.mocked(getState).mockReturnValue(null as any)
    vi.mocked(setState).mockReset()
    vi.mocked(setSyncConsent).mockReset()
    db = new Database(':memory:')
    initializeDatabase(db)
    onConfigUpdated = vi.fn()
    server = createApiServer(db, { onConfigUpdated })
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as { port: number }
        baseUrl = `http://127.0.0.1:${addr.port}`
        resolve()
      })
    })
  })

  afterEach(async () => {
    if (server?.listening) {
      server.closeIdleConnections?.()
      server.closeAllConnections?.()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
    db.close()
  })

  it('saves general settings and returns ok', async () => {
    vi.mocked(loadConfig).mockReturnValue({} as any)
    const res = await fetch(`${baseUrl}/api/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device: 'new-mac', weekStart: 0 }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(vi.mocked(saveConfig)).toHaveBeenCalledWith(
      expect.objectContaining({ device: 'new-mac', weekStart: 0 })
    )
  })

  it('deletes field when empty string is provided', async () => {
    vi.mocked(loadConfig).mockReturnValue({ device: 'old-mac', weekStart: 1 } as any)
    await fetch(`${baseUrl}/api/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device: '' }),
    })
    const saved = vi.mocked(saveConfig).mock.calls[0][0] as any
    expect(saved).not.toHaveProperty('device')
    expect(saved.weekStart).toBe(1)
  })

  it('does not overwrite credential when empty string is provided', async () => {
    vi.mocked(loadConfig).mockReturnValue({
      credentials: { GITHUB_TOKEN: 'existing-secret' },
    } as any)
    await fetch(`${baseUrl}/api/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credentials: { GITHUB_TOKEN: '' } }),
    })
    const saved = vi.mocked(saveConfig).mock.calls[0][0] as any
    expect(saved.credentials.GITHUB_TOKEN).toBe('existing-secret')
  })

  it('saves new credential value', async () => {
    vi.mocked(loadConfig).mockReturnValue({} as any)
    await fetch(`${baseUrl}/api/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credentials: { GITHUB_TOKEN: 'new-token' } }),
    })
    const saved = vi.mocked(saveConfig).mock.calls[0][0] as any
    expect(saved.credentials.GITHUB_TOKEN).toBe('new-token')
  })

  it('removes sync when backend is empty', async () => {
    vi.mocked(loadConfig).mockReturnValue({
      sync: { backend: 'github', repo: 'user/repo' },
    } as any)
    await fetch(`${baseUrl}/api/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sync: { backend: '' } }),
    })
    const saved = vi.mocked(saveConfig).mock.calls[0][0] as any
    expect(saved).not.toHaveProperty('sync')
  })

  it('records consent when saving GitHub sync from the web config API', async () => {
    vi.mocked(loadConfig).mockReturnValue({} as any)
    vi.mocked(buildConsentConfig).mockReturnValue({
      backend: 'github',
      target: 'user/repo',
      endpoint: 'https://api.github.com',
      region: 'global',
      fields: ['ts', 'tool'],
      operations: ['read', 'write'],
      schemaVersion: 'v1',
    })

    const res = await fetch(`${baseUrl}/api/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sync: {
          backend: 'github',
          repo: 'user/repo',
          credentialRef: 'github/user/repo/token',
        },
        credentials: {
          'github/user/repo/token': 'ghp_test',
        },
      }),
    })

    expect(res.status).toBe(200)
    expect(vi.mocked(saveConfig)).toHaveBeenCalledWith(expect.objectContaining({
      sync: expect.objectContaining({ backend: 'github', repo: 'user/repo' }),
    }))
    expect(vi.mocked(setSyncConsent)).toHaveBeenCalledWith(AIUSAGE_DIR, 'github:user/repo', expect.objectContaining({
      syncConsentAt: expect.any(Number),
      syncConsentTarget: expect.any(String),
    }))
  })

  it('reports settings that were saved when the consent could not be, and applies them', async () => {
    vi.mocked(loadConfig).mockReturnValue({} as any)
    vi.mocked(buildConsentConfig).mockReturnValue({
      backend: 'github', target: 'user/repo', endpoint: 'https://api.github.com', region: 'global',
      fields: ['ts'], operations: ['read', 'write'], schemaVersion: 'v1',
    })
    vi.mocked(setSyncConsent).mockImplementationOnce(() => { throw new Error('state.json is locked') })

    const res = await fetch(`${baseUrl}/api/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sync: { backend: 'github', repo: 'user/repo' }, credentials: { 'github/user/repo/token': 'ghp_test' } }),
    })

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: { code: 'CONSENT_NOT_SAVED', message: 'The settings were saved, but the sync consent was not: state.json is locked' } })
    expect(vi.mocked(saveConfig)).toHaveBeenCalledTimes(1)
    expect(onConfigUpdated).toHaveBeenCalledTimes(1)
  })

  it('answers an invalid repository with 400 INVALID_SYNC_CONFIG, saving nothing', async () => {
    vi.mocked(loadConfig).mockReturnValue({} as any)

    const res = await fetch(`${baseUrl}/api/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sync: { backend: 'github', repo: 'not a repo' } }),
    })

    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('INVALID_SYNC_CONFIG')
    expect(vi.mocked(saveConfig)).not.toHaveBeenCalled()
    expect(onConfigUpdated).not.toHaveBeenCalled()
  })

  it('answers a body that is not JSON with 400 INVALID_JSON', async () => {
    const res = await fetch(`${baseUrl}/api/config`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{' })

    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('INVALID_JSON')
    expect(vi.mocked(saveConfig)).not.toHaveBeenCalled()
  })

  it('does not reset local record sync markers when the sync target changes', async () => {
    vi.mocked(loadConfig).mockReturnValue({
      sync: { backend: 'cloud' },
    } as any)
    db.prepare(`
      INSERT INTO records (
        id, ts, ingested_at, synced_at, updated_at, line_offset,
        source_file, session_id, device, device_instance_id, platform, cwd,
        tool, model, provider, input_tokens, output_tokens, cache_read_tokens,
        cache_write_tokens, thinking_tokens, cost, cost_source
      ) VALUES (
        'r1', 1700000000000, 1700000000000, 1700000000000, 1700000000000, 0,
        '/tmp/source.jsonl', 's1', 'device', 'device-id', 'darwin', '/tmp',
        'claude', 'model', 'anthropic', 1, 2, 0, 0, 0, 0.01, 'pricing'
      )
    `).run()

    const res = await fetch(`${baseUrl}/api/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sync: {
          backend: 's3',
          bucket: 'aiusage-data',
          endpoint: 'https://example.r2.cloudflarestorage.com',
          region: 'auto',
          credentialRef: 's3/aiusage-data/accessKeyId',
        },
      }),
    })

    expect(res.status).toBe(200)
    expect(db.prepare('SELECT synced_at FROM records WHERE id = ?').get('r1')).toEqual({ synced_at: 1700000000000 })
  })

  it('invokes onConfigUpdated after saving config', async () => {
    vi.mocked(loadConfig).mockReturnValue({} as any)
    const onConfigUpdated = vi.fn()
    const callbackServer = createApiServer(db, { onConfigUpdated })
    try {
      const address = await new Promise<any>((resolve) => {
        callbackServer.listen(0, '127.0.0.1', () => resolve(callbackServer.address()))
      })
      const callbackUrl = `http://127.0.0.1:${address.port}`

      const res = await fetch(`${callbackUrl}/api/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshInterval: 0, retentionDays: null }),
      })

      expect(res.status).toBe(200)
      expect(onConfigUpdated).toHaveBeenCalledTimes(1)
    } finally {
      callbackServer.closeIdleConnections?.()
      callbackServer.closeAllConnections?.()
      callbackServer.close()
    }
  })

  it('removes refreshInterval and retentionDays when saving zero-like values', async () => {
    vi.mocked(loadConfig).mockReturnValue({
      refreshInterval: 60,
      retentionDays: 30,
    } as any)

    const res = await fetch(`${baseUrl}/api/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshInterval: 0, retentionDays: 0 }),
    })

    expect(res.status).toBe(200)
    expect(vi.mocked(saveConfig)).toHaveBeenCalledWith({})
  })

  it('stores a new GitHub token before taking the settings lock, so other processes can save meanwhile', async () => {
    vi.mocked(loadConfig).mockReturnValue({ sync: { backend: 'github', repo: 'user/repo' } } as any)
    let freeDuringKeychainWrite: boolean | undefined
    vi.mocked(saveGitHubCredentials).mockImplementationOnce(() => {
      freeDuringKeychainWrite = lockFreeForAnotherProcess()
      return '22222222-2222-2222-2222-222222222222'
    })

    const res = await fetch(`${baseUrl}/api/config`, { method: 'PUT', body: JSON.stringify({ syncCredentials: { githubToken: 'ghp_new' } }) })

    expect(res.status).toBe(200)
    expect(freeDuringKeychainWrite).toBe(true)
    expect(vi.mocked(saveGitHubCredentials)).toHaveBeenCalledWith({ method: 'pat', accessToken: 'ghp_new' })
    expect(vi.mocked(saveConfig).mock.calls[0][0].sync?.githubAuth).toEqual({ method: 'pat', credentialId: '22222222-2222-2222-2222-222222222222' })
    expect(vi.mocked(deleteGitHubCredentials)).not.toHaveBeenCalled()
  })

  it.each([
    ['the config does not use it (an S3 target)', { sync: { backend: 's3', bucket: 'bucket' } }, {}],
    ['the request is refused', { sync: { backend: 'github', repo: 'user/repo' } }, { syncInterval: 5 }],
  ])('removes a stored GitHub token again when %s', async (_case, config, extra) => {
    vi.mocked(loadConfig).mockReturnValue(config as any)
    vi.mocked(deleteGitHubCredentials).mockClear()

    await fetch(`${baseUrl}/api/config`, { method: 'PUT', body: JSON.stringify({ ...extra, syncCredentials: { githubToken: 'ghp_unused' } }) })

    expect(vi.mocked(deleteGitHubCredentials)).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111')
    for (const [saved] of vi.mocked(saveConfig).mock.calls) expect(JSON.stringify(saved)).not.toContain('11111111-1111-1111-1111-111111111111')
  })

  it('returns 400 for invalid JSON', async () => {
    const res = await fetch(`${baseUrl}/api/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    })
    expect(res.status).toBe(400)
  })
})

describe('GET /api/config/credential', () => {
  let db: Database.Database
  let server: http.Server
  let baseUrl: string

  beforeEach(async () => {
    vi.mocked(loadConfig).mockReturnValue(null)
    vi.mocked(loadCredential).mockReturnValue(null)
    db = new Database(':memory:')
    initializeDatabase(db)
    server = createApiServer(db)
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as { port: number }
        baseUrl = `http://127.0.0.1:${addr.port}`
        resolve()
      })
    })
  })

  afterEach(async () => {
    if (server?.listening) {
      server.closeIdleConnections?.()
      server.closeAllConnections?.()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
    db.close()
  })

  it.each(['', '?ref=github/user/repo/token', '?ref=s3/bucket/secretAccessKey', '?ref=GITHUB_TOKEN'])('never returns stored values from the removed endpoint (%s)', async query => {
    vi.mocked(loadCredential).mockReturnValue('super-secret')
    vi.mocked(loadConfig).mockReturnValue({ credentials: { GITHUB_TOKEN: 'super-secret' } })
    const response = await fetch(baseUrl + '/api/config/credential' + query)
    expect(response.status).toBe(404)
    expect(await response.text()).not.toContain('super-secret')
  })

  it('reports configured state without returning references or values', async () => {
    vi.mocked(loadConfig).mockReturnValue({
      sync: { backend: 's3', bucket: 'bucket', credentialRef: 'PRIVATE_REF' },
      credentials: {
        'github/user/repo/token': 'gh-secret',
        's3/bucket/accessKeyId': 'access-secret',
        's3/bucket/secretAccessKey': 's3-secret',
        PRIVATE_REF: 'private-secret',
      },
    })
    for (const route of ['/api/config', '/api/config/credentials/status?backend=s3&bucket=bucket']) {
      const response = await fetch(baseUrl + route)
      const data = await response.json()
      expect(data.credentialStatus ?? data).toEqual({ s3AccessKeyId: true, s3SecretAccessKey: true })
      const serialized = JSON.stringify(data)
      for (const secret of ['gh-secret', 'access-secret', 's3-secret', 'PRIVATE_REF', 'private-secret', 'credentialRef', 'credentialKeys', 's3/bucket/']) {
        expect(serialized).not.toContain(secret)
      }
    }
    const github = await fetch(baseUrl + '/api/config/credentials/status?backend=github&repo=user/repo')
    expect(await github.json()).toEqual({ githubToken: true, githubApp: false })
    const missing = await fetch(baseUrl + '/api/config/credentials/status?backend=s3&bucket=other')
    expect(await missing.json()).toEqual({ s3AccessKeyId: false, s3SecretAccessKey: false })
  })

  it.each([
    [{ backend: 'github', repo: 'user/repo' }, { githubToken: 'new-gh' }, { 'github/user/repo/token': 'new-gh' }],
    [{ backend: 's3', bucket: 'bucket' }, { s3AccessKeyId: 'new-id', s3SecretAccessKey: 'new-key' }, { 's3/bucket/accessKeyId': 'new-id', 's3/bucket/secretAccessKey': 'new-key' }],
  ])('sets and preserves write-only sync credentials for %j', async (sync, syncCredentials, expected) => {
    vi.mocked(saveConfig).mockReset()
    vi.mocked(loadConfig).mockReturnValue({ sync } as any)
    const write = await fetch(baseUrl + '/api/config', { method: 'PUT', body: JSON.stringify({ sync, syncCredentials }) })
    expect(write.status).toBe(200)
    expect(await write.json()).toEqual({ ok: true })
    const saved = vi.mocked(saveConfig).mock.calls[0][0]
    if (sync.backend === 'github') {
      expect(saved.sync?.githubAuth).toEqual({ method: 'pat', credentialId: '11111111-1111-1111-1111-111111111111' })
      expect(saved.credentials).toBeUndefined()
    } else expect(saved.credentials).toEqual(expected)
    vi.mocked(loadConfig).mockReturnValue(saved)
    const read = await fetch(baseUrl + '/api/config')
    const text = await read.text()
    for (const value of Object.values(expected)) expect(text).not.toContain(value)
    const blank = Object.fromEntries(Object.keys(syncCredentials).map(key => [key, '']))
    await fetch(baseUrl + '/api/config', { method: 'PUT', body: JSON.stringify({ syncCredentials: blank }) })
    expect(vi.mocked(saveConfig).mock.lastCall?.[0]).toEqual(saved)
  })
})
