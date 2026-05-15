import { describe, it, expect, vi, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { initializeDatabase } from '../../src/db/index.js'
import { SyncOrchestrator, getSyncPath } from '../../src/sync/index.js'
import { generateSyncRecordId } from '@aiusage/core'
import type { SyncRecord } from '@aiusage/core'

describe('SyncOrchestrator', () => {
  let db: Database.Database
  const mockBackend = {
    readFile: vi.fn<(path: string) => Promise<string | null>>(),
    writeFile: vi.fn<(path: string, content: string) => Promise<void>>(),
    listFiles: vi.fn<() => Promise<string[]>>(),
  }

  beforeEach(() => {
    db = new Database(':memory:')
    initializeDatabase(db)
    vi.clearAllMocks()
  })

  it('skips sync when consent is not verified', async () => {
    const orchestrator = new SyncOrchestrator(db, mockBackend as any, {
      deviceInstanceId: 'device-123',
      consentVerified: false,
    })

    const result = await orchestrator.sync()
    expect(result.status).toBe('blocked_pending_consent')
    expect(mockBackend.readFile).not.toHaveBeenCalled()
  })

  it('pulls records from remote', async () => {
    const remoteRecord: SyncRecord = {
      id: 'remote-1',
      ts: 1776738085346,
      tool: 'claude-code',
      model: 'claude-sonnet-4-6',
      provider: 'anthropic',
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadTokens: 0,
      cacheWriteTokens: 200,
      thinkingTokens: 0,
      cost: 0.001,
      costSource: 'pricing',
      sessionKey: 'abc123',
      device: 'other-device',
      deviceInstanceId: 'device-456',
      updatedAt: 1776738085700,
    }

    mockBackend.listFiles.mockResolvedValueOnce(['device-456/2026/05/13.ndjson'])
    mockBackend.readFile.mockResolvedValueOnce(JSON.stringify(remoteRecord) + '\n')

    const orchestrator = new SyncOrchestrator(db, mockBackend as any, {
      deviceInstanceId: 'device-123',
      consentVerified: true,
    })

    const result = await orchestrator.sync()
    expect(result.pulledCount).toBe(1)

    const synced = db.prepare('SELECT * FROM synced_records WHERE id = ?').get('remote-1')
    expect(synced).not.toBeNull()
  })

  it('uploads unsynced local records', async () => {
    db.prepare("INSERT INTO records (id, ts, ingested_at, updated_at, line_offset, tool, model, provider, session_id, source_file, device, device_instance_id) VALUES ('r1', 1000, 1000, 1000, 0, 'claude-code', 'test', 'test', 's1', '/f1', 'd1', 'di1')").run()

    mockBackend.listFiles.mockResolvedValue([])
    mockBackend.readFile.mockResolvedValue(null)
    mockBackend.writeFile.mockResolvedValue(undefined)

    const orchestrator = new SyncOrchestrator(db, mockBackend as any, {
      deviceInstanceId: 'di1',
      consentVerified: true,
    })

    const result = await orchestrator.sync()
    expect(result.uploadedCount).toBe(1)
    expect(mockBackend.writeFile).toHaveBeenCalled()
    expect(mockBackend.writeFile.mock.calls[0][0]).toBe('di1/1970/01/01.ndjson')

    // Verify the written content contains only the unsynced record
    const written = mockBackend.writeFile.mock.calls[0][1] as string
    const records = written.trim().split('\n').map((l: string) => JSON.parse(l))
    expect(records).toHaveLength(1)
    // Sync record ID is generated from deviceInstanceId + sourceFile + lineOffset
    const expectedSyncId = generateSyncRecordId('di1', '/f1', 0)
    expect(records[0].id).toBe(expectedSyncId)
  })

  it('groups uploads by day per device', async () => {
    // Two records on the same day but different hours → same file
    db.prepare("INSERT INTO records (id, ts, ingested_at, updated_at, line_offset, tool, model, provider, session_id, source_file, device, device_instance_id) VALUES ('r1', 1778634900000, 1000, 1000, 0, 'claude-code', 'test', 'test', 's1', '/f1', 'd1', 'di1')").run()
    db.prepare("INSERT INTO records (id, ts, ingested_at, updated_at, line_offset, tool, model, provider, session_id, source_file, device, device_instance_id) VALUES ('r2', 1778640300000, 1000, 1000, 1, 'claude-code', 'test', 'test', 's1', '/f1', 'd1', 'di1')").run()

    mockBackend.listFiles.mockResolvedValue([])
    mockBackend.readFile.mockResolvedValue(null)
    mockBackend.writeFile.mockResolvedValue(undefined)

    const orchestrator = new SyncOrchestrator(db, mockBackend as any, {
      deviceInstanceId: 'di1',
      consentVerified: true,
    })

    const result = await orchestrator.sync()
    expect(result.uploadedCount).toBe(2)
    expect(mockBackend.writeFile).toHaveBeenCalledTimes(1)
    expect(mockBackend.writeFile.mock.calls[0][0]).toBe('di1/2026/05/13.ndjson')
  })

  it('merges with own previous upload data', async () => {
    db.prepare("INSERT INTO records (id, ts, ingested_at, updated_at, line_offset, tool, model, provider, session_id, source_file, device, device_instance_id) VALUES ('local-1', 2000, 2000, 2000, 0, 'claude-code', 'test', 'test', 's1', '/f1', 'd1', 'di1')").run()

    const previousRecord: SyncRecord = {
      id: 'prev-1',
      ts: 1000,
      tool: 'claude-code',
      model: 'claude-sonnet-4-6',
      provider: 'anthropic',
      inputTokens: 500,
      outputTokens: 200,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      thinkingTokens: 0,
      cost: 0.001,
      costSource: 'pricing',
      sessionKey: 'abc',
      device: 'd1',
      deviceInstanceId: 'di1',
      updatedAt: 1000,
    }

    mockBackend.listFiles.mockResolvedValue([])
    mockBackend.readFile.mockResolvedValue(JSON.stringify(previousRecord) + '\n')
    mockBackend.writeFile.mockResolvedValue(undefined)

    const orchestrator = new SyncOrchestrator(db, mockBackend as any, {
      deviceInstanceId: 'di1',
      consentVerified: true,
    })

    const result = await orchestrator.sync()
    expect(result.uploadedCount).toBe(1)

    const written = mockBackend.writeFile.mock.calls[0][1] as string
    const records = written.trim().split('\n').map((l: string) => JSON.parse(l))
    expect(records).toHaveLength(2)
    expect(records.some((r: any) => r.id === 'prev-1')).toBe(true)
  })

  it('keeps newer record when local and remote have same sync id', async () => {
    // generateSyncRecordId('di1', '/f1', 0) is deterministic
    const syncId = generateSyncRecordId('di1', '/f1', 0)

    // Local record with newer updatedAt
    db.prepare(`INSERT INTO records (id, ts, ingested_at, updated_at, line_offset, tool, model, provider, session_id, source_file, device, device_instance_id) VALUES ('local-${syncId}', 2000, 2000, 3000, 0, 'claude-code', 'new-model', 'test', 's1', '/f1', 'd1', 'di1')`).run()

    // Remote has same sync ID but older updatedAt
    const remoteRecord: SyncRecord = {
      id: syncId,
      ts: 1000,
      tool: 'claude-code',
      model: 'old-model',
      provider: 'test',
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      thinkingTokens: 0,
      cost: 0.001,
      costSource: 'pricing',
      sessionKey: 'abc',
      device: 'd1',
      deviceInstanceId: 'di1',
      updatedAt: 1000,
    }

    mockBackend.listFiles.mockResolvedValue(['di1/1970/01/01.ndjson'])
    mockBackend.readFile.mockResolvedValue(JSON.stringify(remoteRecord) + '\n')
    mockBackend.writeFile.mockResolvedValue(undefined)

    const orchestrator = new SyncOrchestrator(db, mockBackend as any, {
      deviceInstanceId: 'di1',
      consentVerified: true,
    })

    const result = await orchestrator.sync()
    expect(result.uploadedCount).toBe(1)

    // Verify the written content uses the local (newer) record
    const written = mockBackend.writeFile.mock.calls[0][1] as string
    const records = written.trim().split('\n').map((l: string) => JSON.parse(l))
    expect(records).toHaveLength(1)
    expect(records[0].model).toBe('new-model')
    expect(records[0].updatedAt).toBe(3000)
  })

  it('derives a daily device-partitioned sync path from timestamps', () => {
    expect(getSyncPath(1778664420000, 'device-abc')).toBe('device-abc/2026/05/13.ndjson')
  })

  it('does not count already-existing remote records as uploaded', async () => {
    const syncId = generateSyncRecordId('di1', '/f1', 0)

    db.prepare(`INSERT INTO records (id, ts, ingested_at, updated_at, line_offset, tool, model, provider, session_id, source_file, device, device_instance_id) VALUES ('r1', 2000, 2000, 1000, 0, 'claude-code', 'test', 'test', 's1', '/f1', 'd1', 'di1')`).run()

    // Remote already has the same record with the same updatedAt (not newer)
    const remoteRecord: SyncRecord = {
      id: syncId,
      ts: 1000,
      tool: 'claude-code',
      model: 'test',
      provider: 'test',
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      thinkingTokens: 0,
      cost: 0.001,
      costSource: 'pricing',
      sessionKey: 'abc',
      device: 'd1',
      deviceInstanceId: 'di1',
      updatedAt: 1000,
    }

    mockBackend.listFiles.mockResolvedValue(['di1/1970/01/01.ndjson'])
    mockBackend.readFile.mockResolvedValue(JSON.stringify(remoteRecord) + '\n')
    mockBackend.writeFile.mockResolvedValue(undefined)

    const orchestrator = new SyncOrchestrator(db, mockBackend as any, {
      deviceInstanceId: 'di1',
      consentVerified: true,
    })

    const result = await orchestrator.sync()
    // Local updatedAt (1000) is not > remote updatedAt (1000), so it's not actually updated
    expect(result.uploadedCount).toBe(0)
  })
})
