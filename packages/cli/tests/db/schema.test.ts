import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { unlinkSync, existsSync } from 'node:fs'
import { initializeDatabase } from '../../src/db/index.js'

describe('Database Schema', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
  })

  afterEach(() => {
    db.close()
  })

  it('creates schema_version table', () => {
    initializeDatabase(db)
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
    const tableNames = tables.map((t: any) => t.name)
    expect(tableNames).toContain('schema_version')
  })

  it('creates records table with correct columns', () => {
    initializeDatabase(db)
    const columns = db.prepare("PRAGMA table_info(records)").all()
    const columnNames = columns.map((c: any) => c.name)
    expect(columnNames).toContain('id')
    expect(columnNames).toContain('ts')
    expect(columnNames).toContain('ingested_at')
    expect(columnNames).toContain('synced_at')
    expect(columnNames).toContain('updated_at')
    expect(columnNames).toContain('line_offset')
    expect(columnNames).toContain('tool')
    expect(columnNames).toContain('model')
    expect(columnNames).toContain('provider')
    expect(columnNames).toContain('input_tokens')
    expect(columnNames).toContain('output_tokens')
    expect(columnNames).toContain('cache_read_tokens')
    expect(columnNames).toContain('cache_write_tokens')
    expect(columnNames).toContain('thinking_tokens')
    expect(columnNames).toContain('cost')
    expect(columnNames).toContain('cost_source')
    expect(columnNames).toContain('session_id')
    expect(columnNames).toContain('source_file')
    expect(columnNames).toContain('device')
    expect(columnNames).toContain('device_instance_id')
  })

  it('creates synced_records table', () => {
    initializeDatabase(db)
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
    const tableNames = tables.map((t: any) => t.name)
    expect(tableNames).toContain('synced_records')
  })

  it('creates sync_tombstones table', () => {
    initializeDatabase(db)
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
    const tableNames = tables.map((t: any) => t.name)
    expect(tableNames).toContain('sync_tombstones')
  })

  it('creates tool_calls table', () => {
    initializeDatabase(db)
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
    const tableNames = tables.map((t: any) => t.name)
    expect(tableNames).toContain('tool_calls')
  })

  it('creates all required indexes', () => {
    initializeDatabase(db)
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all()
    const indexNames = indexes.map((i: any) => i.name)
    expect(indexNames).toContain('idx_records_ts')
    expect(indexNames).toContain('idx_records_tool')
    expect(indexNames).toContain('idx_records_model')
    expect(indexNames).toContain('idx_records_session')
    expect(indexNames).toContain('idx_records_source')
  })

  it('sets WAL mode', () => {
    // WAL mode is not supported on :memory: databases, use a temp file
    const tmpPath = join(tmpdir(), `test-wal-${Date.now()}.db`)
    const tmpDb = new Database(tmpPath)
    initializeDatabase(tmpDb)
    const mode = tmpDb.pragma('journal_mode', { simple: true })
    expect(mode).toBe('wal')
    tmpDb.close()
    if (existsSync(tmpPath)) unlinkSync(tmpPath)
  })

  it('sets foreign_keys on', () => {
    initializeDatabase(db)
    const fk = db.pragma('foreign_keys', { simple: true })
    expect(fk).toBe(1)
  })

  it('records schema version 1', () => {
    initializeDatabase(db)
    const version = db.prepare('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1').get()
    expect((version as any).version).toBe(1)
  })
})
