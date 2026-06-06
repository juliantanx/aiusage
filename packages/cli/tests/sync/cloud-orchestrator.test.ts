import { describe, it, expect, vi, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { initializeDatabase } from '../../src/db/index.js'

vi.mock('../../src/sync/cloud.js', () => ({
  CloudSyncError: class CloudSyncError extends Error {},
  cloudPull: vi.fn(async () => ({
    records: [],
    tombstones: [],
    hasMore: false,
    syncGeneration: 1,
  })),
  cloudPush: vi.fn(async () => ({
    inserted: 0,
    updated: 0,
    skipped: 1,
    syncGeneration: 1,
  })),
}))

describe('CloudSyncOrchestrator', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initializeDatabase(db)
    vi.clearAllMocks()
  })

  it('counts local records processed by cloud push even when the server reports no changes', async () => {
    const { CloudSyncOrchestrator } = await import('../../src/sync/cloud-orchestrator.js')
    const { cloudPush } = await import('../../src/sync/cloud.js')

    db.prepare(`
      INSERT INTO records (
        id, ts, ingested_at, updated_at, line_offset,
        tool, model, provider, session_id, source_file, device, device_instance_id
      ) VALUES (
        'r1', 1000, 1000, 1000, 0,
        'codex', 'gpt-5.5', 'openai', 's1', '/f1', 'd1', 'di1'
      )
    `).run()

    const orchestrator = new CloudSyncOrchestrator(db, { deviceInstanceId: 'di1' })
    const result = await orchestrator.sync()

    expect(result.status).toBe('ok')
    expect(result.uploadedCount).toBe(1)
    expect(cloudPush).toHaveBeenCalledTimes(1)

    const row = db.prepare('SELECT synced_at FROM records WHERE id = ?').get('r1') as { synced_at: number | null }
    expect(row.synced_at).toBeTypeOf('number')
  })
})
