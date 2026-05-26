import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { initializeDatabase } from '../../src/db/index.js'

function seedSession(db: Database.Database) {
  const base = 1715683200000
  db.prepare(`
    INSERT INTO records (id, ts, ingested_at, updated_at, line_offset, tool, model, provider,
      input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens,
      cost, cost_source, session_id, source_file, device, device_instance_id)
    VALUES (?, ?, ?, ?, 0, 'claude-code', 'claude-sonnet-4-6', 'anthropic',
      1000, 200, 300, 100, 0, 0.005, 'pricing', 'sess-1', '/tmp/test.jsonl', 'mac', 'dev-1')
  `).run('r1', base, base, base)
  db.prepare(`
    INSERT INTO records (id, ts, ingested_at, updated_at, line_offset, tool, model, provider,
      input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens,
      cost, cost_source, session_id, source_file, device, device_instance_id)
    VALUES (?, ?, ?, ?, 0, 'claude-code', 'claude-sonnet-4-6', 'anthropic',
      2000, 400, 600, 200, 0, 0.01, 'pricing', 'sess-1', '/tmp/test.jsonl', 'mac', 'dev-1')
  `).run('r2', base + 60000, base, base)
  db.prepare(`
    INSERT INTO tool_calls (id, record_id, tool, name, ts, call_index)
    VALUES ('tc1', 'r1', 'claude-code', 'Read', ?, 0)
  `).run(base + 100)
  db.prepare(`
    INSERT INTO tool_calls (id, record_id, tool, name, ts, call_index)
    VALUES ('tc2', 'r1', 'claude-code', 'mcp__brave__search', ?, 1)
  `).run(base + 200)
  db.prepare(`
    INSERT INTO tool_calls (id, record_id, tool, name, ts, call_index)
    VALUES ('tc3', 'r2', 'claude-code', 'Bash', ?, 0)
  `).run(base + 60100)
}

describe('sessions list query', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initializeDatabase(db)
    seedSession(db)
  })

  afterEach(() => db.close())

  it('returns duration as MAX(ts) - MIN(ts)', () => {
    const row = db.prepare(`
      SELECT session_id, MAX(ts) - MIN(ts) AS duration
      FROM records
      WHERE session_id = 'sess-1'
      GROUP BY session_id
    `).get() as any
    expect(row.duration).toBe(60000)
  })

  it('returns toolCallCount via LEFT JOIN', () => {
    const row = db.prepare(`
      SELECT r.session_id, COUNT(DISTINCT tc.id) AS toolCallCount
      FROM records r
      LEFT JOIN tool_calls tc ON tc.record_id = r.id
      WHERE r.session_id = 'sess-1'
      GROUP BY r.session_id
    `).get() as any
    expect(row.toolCallCount).toBe(3)
  })
})

describe('session detail query', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initializeDatabase(db)
    seedSession(db)
  })

  afterEach(() => db.close())

  it('returns records in ascending ts order', () => {
    const rows = db.prepare(`
      SELECT id, ts FROM records
      WHERE session_id = 'sess-1'
      ORDER BY ts ASC
    `).all() as any[]
    expect(rows[0].id).toBe('r1')
    expect(rows[1].id).toBe('r2')
  })

  it('returns tool calls grouped by record_id', () => {
    const rows = db.prepare(`
      SELECT tc.record_id, tc.name, tc.call_index
      FROM tool_calls tc
      JOIN records r ON r.id = tc.record_id
      WHERE r.session_id = 'sess-1'
      ORDER BY tc.record_id, tc.call_index ASC
    `).all() as any[]
    expect(rows).toHaveLength(3)
    expect(rows[0]).toMatchObject({ record_id: 'r1', name: 'Read', call_index: 0 })
    expect(rows[1]).toMatchObject({ record_id: 'r1', name: 'mcp__brave__search', call_index: 1 })
    expect(rows[2]).toMatchObject({ record_id: 'r2', name: 'Bash', call_index: 0 })
  })

  it('returns session metadata aggregate', () => {
    const row = db.prepare(`
      SELECT session_id, MIN(ts) AS firstTs, MAX(ts) AS lastTs,
             MAX(ts) - MIN(ts) AS duration,
             SUM(input_tokens) AS inputTokens, SUM(output_tokens) AS outputTokens,
             SUM(cost) AS cost, COUNT(*) AS recordCount
      FROM records
      WHERE session_id = 'sess-1'
      GROUP BY session_id
    `).get() as any
    expect(row.firstTs).toBe(1715683200000)
    expect(row.duration).toBe(60000)
    expect(row.inputTokens).toBe(3000)
    expect(row.recordCount).toBe(2)
  })
})
