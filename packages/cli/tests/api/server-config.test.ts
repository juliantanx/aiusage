// packages/cli/tests/api/server-config.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import http from 'node:http'
import Database from 'better-sqlite3'
import { initializeDatabase } from '../../src/db/index.js'

vi.mock('../../src/config.js', () => ({
  loadConfig: vi.fn(() => null),
  saveConfig: vi.fn(),
  AIUSAGE_DIR: '/tmp/test-aiusage',
  CONFIG_PATH: '/tmp/test-aiusage/config.json',
  buildConsentConfig: vi.fn(() => null),
  loadCredential: vi.fn(() => null),
  saveCredential: vi.fn(),
  SYNC_FIELDS: [],
}))

import { createApiServer } from '../../src/api/server.js'
import { loadConfig, saveConfig, loadCredential } from '../../src/config.js'

describe('GET /api/config', () => {
  let db: Database.Database
  let server: http.Server
  let baseUrl: string

  beforeEach(async () => {
    vi.mocked(loadConfig).mockReturnValue(null)
    vi.mocked(saveConfig).mockReset()
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
    expect(data.sources).toEqual({ 'claude-code': null, codex: null, openclaw: null, opencode: null })
    expect(data.sync).toBeNull()
  })

  it('returns config values and masks credential values', async () => {
    vi.mocked(loadConfig).mockReturnValue({
      device: 'my-mac',
      weekStart: 0,
      retentionDays: 30,
      credentials: { GITHUB_TOKEN: 'super-secret' },
      sync: { backend: 'github', repo: 'user/repo', credentialRef: 'GITHUB_TOKEN' },
      sources: { 'claude-code': '/custom/path' },
    } as any)
    const res = await fetch(`${baseUrl}/api/config`)
    const data = await res.json()
    expect(data.device).toBe('my-mac')
    expect(data.weekStart).toBe(0)
    expect(data.retentionDays).toBe(30)
    expect(data.credentialKeys).toEqual(['GITHUB_TOKEN'])
    expect(data).not.toHaveProperty('credentials')
    expect(data.sync.repo).toBe('user/repo')
    expect(data.sources['claude-code']).toBe('/custom/path')
    expect(data.sources.codex).toBeNull()
  })
})

describe('PUT /api/config', () => {
  let db: Database.Database
  let server: http.Server
  let baseUrl: string

  beforeEach(async () => {
    vi.mocked(loadConfig).mockReturnValue(null)
    vi.mocked(saveConfig).mockReset()
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
        body: JSON.stringify({ parseInterval: 0, retentionDays: null }),
      })

      expect(res.status).toBe(200)
      expect(onConfigUpdated).toHaveBeenCalledTimes(1)
    } finally {
      callbackServer.closeIdleConnections?.()
      callbackServer.closeAllConnections?.()
      callbackServer.close()
    }
  })

  it('removes parseInterval and retentionDays when saving zero-like values', async () => {
    vi.mocked(loadConfig).mockReturnValue({
      parseInterval: 60,
      retentionDays: 30,
    } as any)

    const res = await fetch(`${baseUrl}/api/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parseInterval: 0, retentionDays: 0 }),
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
