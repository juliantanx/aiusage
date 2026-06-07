// packages/cli/tests/api/server-config.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import http from 'node:http'
import Database from 'better-sqlite3'
import { initializeDatabase } from '../../src/db/index.js'

vi.mock('../../src/config.js', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    loadConfig: vi.fn(() => null),
    saveConfig: vi.fn(),
    AIUSAGE_DIR: '/tmp/test-aiusage',
    CONFIG_PATH: '/tmp/test-aiusage/config.json',
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
import { buildConsentConfig, loadConfig, saveConfig, loadCredential } from '../../src/config.js'
import { getState, setState, setSyncConsent } from '../../src/init.js'

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
    expect(data.credentialKeys).toEqual([])
    expect(data).not.toHaveProperty('sources')
    expect(data.sync).toBeNull()
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
    expect(data.credentialKeys).toEqual(['GITHUB_TOKEN'])
    expect(data).not.toHaveProperty('credentials')
    expect(data.sync.repo).toBe('user/repo')
    expect(data).not.toHaveProperty('sources')
  })
})

describe('PUT /api/config', () => {
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
    expect(vi.mocked(setSyncConsent)).toHaveBeenCalledWith('\/tmp\/test-aiusage', 'github:user/repo', expect.objectContaining({
      syncConsentAt: expect.any(Number),
      syncConsentTarget: expect.any(String),
    }))
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

  it('returns 400 when credential ref is missing', async () => {
    const res = await fetch(`${baseUrl}/api/config/credential`)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      error: {
        code: 'MISSING_CREDENTIAL_REF',
        message: 'credential ref is required',
      },
    })
  })

  it('returns 404 when credential is not found', async () => {
    vi.mocked(loadConfig).mockReturnValue({
      credentials: {},
    } as any)

    const res = await fetch(`${baseUrl}/api/config/credential?ref=github/user/repo/token`)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({
      error: {
        code: 'CREDENTIAL_NOT_FOUND',
        message: 'Credential not found',
      },
    })
  })

  it('returns the stored credential value for an existing ref', async () => {
    vi.mocked(loadCredential).mockReturnValue('super-secret')
    vi.mocked(loadConfig).mockReturnValue({
      credentials: {
        'github/user/repo/token': 'super-secret',
      },
    } as any)

    const res = await fetch(`${baseUrl}/api/config/credential?ref=github/user/repo/token`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ value: 'super-secret' })
  })
})
