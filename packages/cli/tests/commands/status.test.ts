import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { initializeDatabase } from '../../src/db/index.js'
import { generateStatus } from '../../src/commands/status.js'

describe('Status Command', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initializeDatabase(db)
  })

  afterEach(() => {
    db.close()
  })

  it('returns status with database info', () => {
    const status = generateStatus(db)
    expect(status.version).toBeDefined()
    expect(status.deviceName).toBeDefined()
    expect(status.databaseSize).toBeDefined()
    expect(status.recordCount).toBe(0)
  })

  it('returns correct record count', () => {
    db.prepare("INSERT INTO records (id, ts, ingested_at, updated_at, line_offset, tool, model, provider, session_id, source_file, device, device_instance_id) VALUES ('r1', 1000, 1000, 1000, 0, 'claude-code', 'test', 'test', 's1', '/f1', 'd1', 'di1')").run()
    const status = generateStatus(db)
    expect(status.recordCount).toBe(1)
  })

  it('returns empty state when no state.json exists', () => {
    const status = generateStatus(db)
    expect(status.syncStatus).toBe('not_configured')
  })
})
