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

  it('creates readonly views for visualization tools', () => {
    initializeDatabase(db)
    const views = db.prepare("SELECT name FROM sqlite_master WHERE type='view'").all()
    const viewNames = views.map((v: any) => v.name)
    expect(viewNames).toContain('v_usage_records')
    expect(viewNames).toContain('v_tool_calls')
    expect(viewNames).toContain('v_sessions')
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

  it('records latest schema version', () => {
    initializeDatabase(db)
    const version = db.prepare('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1').get()
    expect((version as any).version).toBe(4)
  })

  it('queries visualization views successfully', () => {
    initializeDatabase(db)
    const recordTs = 1715683200123
    const toolCallTs = 1715683200456

    db.prepare(`
      INSERT INTO records (
        id, ts, ingested_at, synced_at, updated_at, line_offset,
        tool, model, provider, input_tokens, output_tokens,
        cache_read_tokens, cache_write_tokens, thinking_tokens,
        cost, cost_source, session_id, source_file, device, device_instance_id
      ) VALUES (
        'r1', @recordTs, @recordTs, NULL, @recordTs, 0,
        'codex', 'gpt-4.1', 'openai', 100, 50,
        10, 5, 20,
        1.25, 'pricing', 's1', '/tmp/session.jsonl', 'macbook', 'device-1'
      )
    `).run({ recordTs })

    db.prepare(`
      INSERT INTO tool_calls (id, record_id, tool, name, ts, call_index)
      VALUES ('tc1', 'r1', 'codex', 'Read', @toolCallTs, 0)
    `).run({ toolCallTs })

    const usageRow = db.prepare('SELECT * FROM v_usage_records WHERE id = ?').get('r1') as any
    expect(usageRow.timestamp).toBe(new Date(recordTs).toISOString().replace('T', ' '))
    expect(usageRow.total_tokens).toBe(185)

    const toolCallRow = db.prepare('SELECT * FROM v_tool_calls WHERE id = ?').get('tc1') as any
    expect(toolCallRow.name).toBe('Read')
    expect(toolCallRow.session_id).toBe('s1')

    const sessionRow = db.prepare('SELECT * FROM v_sessions WHERE session_id = ?').get('s1') as any
    expect(sessionRow.record_count).toBe(1)
    expect(sessionRow.total_tokens).toBe(185)
    expect(sessionRow.total_cost).toBe(1.25)
  })
})
