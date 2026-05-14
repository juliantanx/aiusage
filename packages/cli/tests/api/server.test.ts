import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import http from 'node:http'
import { createApiServer } from '../../src/api/server.js'
import Database from 'better-sqlite3'
import { initializeDatabase } from '../../src/db/index.js'
import { SyncRuntimeController } from '../../src/sync/runtime.js'

function insertTestRecord(db: Database.Database, overrides: Record<string, unknown> = {}) {
  const defaults = {
    id: 'local00000001',
    ts: new Date().toISOString(),
    ingested_at: Date.now(),
    synced_at: null,
    updated_at: Date.now(),
    line_offset: 0,
    tool: 'claude-code',
    model: 'claude-sonnet-4-6',
    provider: 'anthropic',
    input_tokens: 100,
    output_tokens: 50,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    thinking_tokens: 0,
    cost: 0.001,
    cost_source: 'pricing',
    session_id: 'session1',
    source_file: '/test/file.jsonl',
    device: 'local-device',
    device_instance_id: 'local-uuid-0000',
  }
  const vals = { ...defaults, ...overrides }
  db.prepare(`
    INSERT INTO records (id, ts, ingested_at, synced_at, updated_at, line_offset,
      tool, model, provider, input_tokens, output_tokens, cache_read_tokens,
      cache_write_tokens, thinking_tokens, cost, cost_source, session_id,
      source_file, device, device_instance_id)
    VALUES (@id, @ts, @ingested_at, @synced_at, @updated_at, @line_offset,
      @tool, @model, @provider, @input_tokens, @output_tokens, @cache_read_tokens,
      @cache_write_tokens, @thinking_tokens, @cost, @cost_source, @session_id,
      @source_file, @device, @device_instance_id)
  `).run(vals)
}

function insertTestSyncedRecord(db: Database.Database, overrides: Record<string, unknown> = {}) {
  const defaults = {
    id: 'synced0000001',
    ts: new Date().toISOString(),
    tool: 'codex',
    model: 'gpt-4.1',
    provider: 'openai',
    input_tokens: 200,
    output_tokens: 100,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    thinking_tokens: 0,
    cost: 0.003,
    cost_source: 'pricing',
    session_key: 'sessionkey1',
    device: 'remote-device',
    device_instance_id: 'remote-uuid-0001',
    updated_at: Date.now(),
  }
  const vals = { ...defaults, ...overrides }
  db.prepare(`
    INSERT INTO synced_records (id, ts, tool, model, provider, input_tokens, output_tokens,
      cache_read_tokens, cache_write_tokens, thinking_tokens, cost, cost_source,
      session_key, device, device_instance_id, updated_at)
    VALUES (@id, @ts, @tool, @model, @provider, @input_tokens, @output_tokens,
      @cache_read_tokens, @cache_write_tokens, @thinking_tokens, @cost, @cost_source,
      @session_key, @device, @device_instance_id, @updated_at)
  `).run(vals)
}

describe('API Server', () => {
  let db: Database.Database
  let server: http.Server
  let baseUrl: string

  beforeEach(async () => {
    db = new Database(':memory:')
    initializeDatabase(db)
    server = createApiServer(db)
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address() as any
        baseUrl = `http://127.0.0.1:${address.port}`
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

  it('returns summary data', async () => {
    const response = await fetch(`${baseUrl}/api/summary?range=day`)
    expect(response.ok).toBe(true)
    const data = await response.json()
    expect(data).toHaveProperty('totalTokens')
    expect(data).toHaveProperty('totalCost')
  })

  it('returns 400 for invalid range', async () => {
    const response = await fetch(`${baseUrl}/api/summary?range=invalid`)
    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error.code).toBe('INVALID_PARAM')
  })

  it('returns empty data array when no records exist', async () => {
    const response = await fetch(`${baseUrl}/api/tokens?range=day`)
    expect(response.ok).toBe(true)
    const data = await response.json()
    expect(data.data).toEqual([])
  })
})

describe('Device filtering', () => {
  let db: Database.Database
  let server: http.Server
  let baseUrl: string
  const CURRENT_DEVICE_ID = 'local-uuid-0000'

  beforeEach(async () => {
    db = new Database(':memory:')
    initializeDatabase(db)
    insertTestRecord(db)
    insertTestSyncedRecord(db)
    server = createApiServer(db, { currentDeviceInstanceId: CURRENT_DEVICE_ID })
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address() as any
        baseUrl = `http://127.0.0.1:${address.port}`
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

  it('GET /api/devices returns device list', async () => {
    const res = await fetch(`${baseUrl}/api/devices`)
    expect(res.ok).toBe(true)
    const data = await res.json()
    expect(data.currentDeviceInstanceId).toBe(CURRENT_DEVICE_ID)
    expect(data.devices.length).toBe(2)
    expect(data.devices[0].deviceInstanceId).toBe(CURRENT_DEVICE_ID)
  })

  it('summary with no device param returns merged data', async () => {
    const res = await fetch(`${baseUrl}/api/summary?range=all`)
    const data = await res.json()
    // local: 100 input + 50 output = 150 tokens
    // remote synced: 200 input + 100 output = 300 tokens
    expect(data.totalTokens).toBe(450)
  })

  it('summary with current device returns only local data', async () => {
    const res = await fetch(`${baseUrl}/api/summary?range=all&device=${CURRENT_DEVICE_ID}`)
    const data = await res.json()
    expect(data.totalTokens).toBe(150)
  })

  it('summary with other device returns only that device synced data', async () => {
    const res = await fetch(`${baseUrl}/api/summary?range=all&device=remote-uuid-0001`)
    const data = await res.json()
    expect(data.totalTokens).toBe(300)
  })

  it('tokens with no device param returns merged data', async () => {
    const res = await fetch(`${baseUrl}/api/tokens?range=all`)
    const data = await res.json()
    expect(data.data.length).toBeGreaterThan(0)
    const totalInput = data.data.reduce((s: number, d: any) => s + d.inputTokens, 0)
    expect(totalInput).toBe(300) // 100 local + 200 remote
  })

  it('tokens with current device returns only local', async () => {
    const res = await fetch(`${baseUrl}/api/tokens?range=all&device=${CURRENT_DEVICE_ID}`)
    const data = await res.json()
    const totalInput = data.data.reduce((s: number, d: any) => s + d.inputTokens, 0)
    expect(totalInput).toBe(100)
  })

  it('cost with no device param returns merged data', async () => {
    const res = await fetch(`${baseUrl}/api/cost?range=all`)
    const data = await res.json()
    expect(data.byTool['claude-code']).toBeCloseTo(0.001)
    expect(data.byTool['codex']).toBeCloseTo(0.003)
  })

  it('models with no device param returns merged data', async () => {
    const res = await fetch(`${baseUrl}/api/models?range=all`)
    const data = await res.json()
    const models = data.models.map((m: any) => m.model)
    expect(models).toContain('claude-sonnet-4-6')
    expect(models).toContain('gpt-4.1')
  })

  it('sessions with other device returns empty', async () => {
    const res = await fetch(`${baseUrl}/api/sessions?range=all&device=remote-uuid-0001`)
    const data = await res.json()
    expect(data.sessions).toEqual([])
  })

  it('projects with no device param returns merged data', async () => {
    const res = await fetch(`${baseUrl}/api/projects?range=all`)
    const data = await res.json()
    expect(data.projects.length).toBeGreaterThan(0)
  })
})

describe('Sync API', () => {
  let db: Database.Database
  let server: http.Server
  let baseUrl: string

  beforeEach(async () => {
    db = new Database(':memory:')
    initializeDatabase(db)
  })

  afterEach(async () => {
    if (server?.listening) {
      server.closeIdleConnections?.()
      server.closeAllConnections?.()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
    db.close()
  })

  it('starts sync in the background and reports running status', async () => {
    let resolveSync: (() => void) | null = null
    let persistedStatus = {
      deviceInstanceId: 'dev-1',
      lastSyncStatus: 'failed' as const,
      lastSyncError: 'Previous failure',
    }

    const controller = new SyncRuntimeController({
      runSync: ({ onProgress }) => new Promise<void>((resolve) => {
        resolveSync = () => {
          persistedStatus = {
            ...persistedStatus,
            lastSyncStatus: 'ok',
            lastSyncError: undefined,
            lastSyncAt: Date.now(),
            lastSyncUploaded: 10,
            lastSyncPulled: 2,
          }
          resolve()
        }
        onProgress?.({ phase: 'uploading', currentPath: '2026/05.ndjson', completedFiles: 0, totalFiles: 1, uploadedCount: 0 })
      }),
      getPersistedState: () => persistedStatus,
    })

    server = createApiServer(db, {
      onSyncStart: () => controller.start(),
      getSyncStatus: () => controller.getStatus(),
    })

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address() as any
        baseUrl = `http://127.0.0.1:${address.port}`
        resolve()
      })
    })

    const startRes = await fetch(`${baseUrl}/api/sync`, { method: 'POST' })
    expect(startRes.status).toBe(202)
    const startData = await startRes.json()
    expect(startData.accepted).toBe(true)
    expect(startData.status.isRunning).toBe(true)
    expect(startData.status.phase).toBeUndefined()

    const duplicateRes = await fetch(`${baseUrl}/api/sync`, { method: 'POST' })
    expect(duplicateRes.status).toBe(200)
    const duplicateData = await duplicateRes.json()
    expect(duplicateData.accepted).toBe(false)
    expect(duplicateData.alreadyRunning).toBe(true)
    expect(duplicateData.status.phase).toBe('uploading')

    resolveSync?.()
    await new Promise(resolve => setTimeout(resolve, 0))

    const statusRes = await fetch(`${baseUrl}/api/sync`)
    expect(statusRes.ok).toBe(true)
    const statusData = await statusRes.json()
    expect(statusData.status.isRunning).toBe(false)
    expect(statusData.status.lastSyncStatus).toBe('ok')
    expect(statusData.status.lastSyncUploaded).toBe(10)
  })

  it('defers sync work until after start returns', async () => {
    let resolveSync: (() => void) | null = null
    let started = false
    const controller = new SyncRuntimeController({
      runSync: () => new Promise<void>((resolve) => {
        started = true
        resolveSync = resolve
      }),
      getPersistedState: () => ({ deviceInstanceId: 'dev-1', lastSyncStatus: 'failed' as const }),
    })

    const result = controller.start()
    expect(result.accepted).toBe(true)
    expect(started).toBe(false)

    await new Promise(resolve => setImmediate(resolve))
    expect(started).toBe(true)

    resolveSync?.()
  })
})
