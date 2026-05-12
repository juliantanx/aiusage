import { describe, it, expect, vi, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { initializeDatabase } from '../../src/db/index.js'
import { SyncOrchestrator } from '../../src/sync/index.js'
import type { SyncRecord } from '@aiusage/core'

describe('SyncOrchestrator', () => {
  let db: Database.Database
  const mockBackend = {
    readFile: vi.fn(),
    writeFile: vi.fn(),
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

    mockBackend.readFile.mockResolvedValueOnce({
      sha: 'abc123',
      content: JSON.stringify(remoteRecord) + '\n',
    })

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

    mockBackend.readFile.mockResolvedValue(null)
    mockBackend.writeFile.mockResolvedValue(undefined)

    const orchestrator = new SyncOrchestrator(db, mockBackend as any, {
      deviceInstanceId: 'di1',
      consentVerified: true,
    })

    const result = await orchestrator.sync()
    expect(result.uploadedCount).toBe(1)
    expect(mockBackend.writeFile).toHaveBeenCalled()
  })
})
