import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { runParseZcode } from '../../src/commands/parse-zcode.js'

// Minimal re-creation of the ZCode `model_usage` + `session` schema,
// limited to the columns the parser reads.
function createSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE session (
      id TEXT PRIMARY KEY,
      directory TEXT
    );
    CREATE TABLE model_usage (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      reasoning_tokens INTEGER NOT NULL DEFAULT 0,
      cache_creation_input_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_input_tokens INTEGER NOT NULL DEFAULT 0
    );
  `)
}

interface InsertRow {
  id: string
  session_id: string
  model_id: string
  status?: string
  started_at: number
  input_tokens?: number
  output_tokens?: number
  reasoning_tokens?: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

function insertUsage(db: Database.Database, row: InsertRow): void {
  db.prepare(`
    INSERT INTO model_usage (id, session_id, model_id, status, started_at,
      input_tokens, output_tokens, reasoning_tokens,
      cache_creation_input_tokens, cache_read_input_tokens)
    VALUES (@id, @session_id, @model_id, @status, @started_at,
      @input_tokens, @output_tokens, @reasoning_tokens,
      @cache_creation_input_tokens, @cache_read_input_tokens)
  `).run({
    id: row.id,
    session_id: row.session_id,
    model_id: row.model_id,
    status: row.status ?? 'completed',
    started_at: row.started_at,
    input_tokens: row.input_tokens ?? 0,
    output_tokens: row.output_tokens ?? 0,
    reasoning_tokens: row.reasoning_tokens ?? 0,
    cache_creation_input_tokens: row.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: row.cache_read_input_tokens ?? 0,
  })
}

describe('parse-zcode', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    createSchema(db)
  })

  afterEach(() => {
    db.close()
  })

  it('imports completed model_usage rows with token data', () => {
    db.prepare(`INSERT INTO session (id, directory) VALUES ('sess_a', 'D:/proj')`).run()
    insertUsage(db, {
      id: 'usage_1',
      session_id: 'sess_a',
      model_id: 'GLM-5.2',
      started_at: 1781486799684,
      input_tokens: 1000,
      output_tokens: 200,
      cache_read_input_tokens: 500,
    })

    const result = runParseZcode(db, {
      dbPath: '/home/user/.zcode/cli/db/db.sqlite',
      device: 'laptop',
      deviceInstanceId: 'device-abc',
      platform: 'win32',
      now: 1781490000000,
      cursor: null,
    })

    expect(result.errors).toHaveLength(0)
    expect(result.records).toHaveLength(1)
    const r = result.records[0]
    expect(r).toMatchObject({
      tool: 'zcode',
      model: 'glm-5.2',
      provider: 'zhipu',
      inputTokens: 1000,
      outputTokens: 200,
      cacheReadTokens: 500,
      cacheWriteTokens: 0,
      thinkingTokens: 0,
      sessionId: 'sess_a',
      cwd: 'D:/proj',
      sourceFile: '/home/user/.zcode/cli/db/db.sqlite',
      device: 'laptop',
      deviceInstanceId: 'device-abc',
      platform: 'win32',
    })
    expect(r.ts).toBe(1781486799684)
    expect(result.nextCursor).toEqual({ lastStartedAt: 1781486799684, lastId: 'usage_1' })
  })

  it('lowercases model_id so inferProvider matches the glm- prefix', () => {
    insertUsage(db, {
      id: 'usage_1',
      session_id: 'sess_a',
      model_id: 'GLM-5.2',
      started_at: 1781486799684,
      input_tokens: 100,
      output_tokens: 10,
    })

    const result = runParseZcode(db, {
      dbPath: '/db.sqlite',
      device: 'd',
      deviceInstanceId: 'i',
      now: 1781490000000,
      cursor: null,
    })

    expect(result.records[0].model).toBe('glm-5.2')
    expect(result.records[0].provider).toBe('zhipu')
  })

  it('skips error and zero-token rows', () => {
    insertUsage(db, { id: 'ok', session_id: 's1', model_id: 'GLM-5.2', started_at: 100, input_tokens: 5, output_tokens: 5 })
    insertUsage(db, { id: 'err', session_id: 's2', model_id: 'GLM-5.2', started_at: 200, status: 'error' })
    insertUsage(db, { id: 'zero', session_id: 's3', model_id: 'GLM-5.2', started_at: 300 })

    const result = runParseZcode(db, {
      dbPath: '/db.sqlite',
      device: 'd',
      deviceInstanceId: 'i',
      now: 1000,
      cursor: null,
    })

    expect(result.records).toHaveLength(1)
    expect(result.records[0].sessionId).toBe('s1')
    expect(result.records[0].inputTokens).toBe(5)
  })

  it('respects cursor for incremental import', () => {
    insertUsage(db, { id: 'old', session_id: 's', model_id: 'GLM-5.2', started_at: 100, input_tokens: 5, output_tokens: 5 })
    insertUsage(db, { id: 'new', session_id: 's', model_id: 'GLM-5.2', started_at: 200, input_tokens: 8, output_tokens: 8 })

    const first = runParseZcode(db, {
      dbPath: '/db.sqlite',
      device: 'd',
      deviceInstanceId: 'i',
      now: 1000,
      cursor: null,
    })
    expect(first.records).toHaveLength(2)
    expect(first.nextCursor).toEqual({ lastStartedAt: 200, lastId: 'new' })

    const second = runParseZcode(db, {
      dbPath: '/db.sqlite',
      device: 'd',
      deviceInstanceId: 'i',
      now: 1000,
      cursor: first.nextCursor,
    })
    expect(second.records).toHaveLength(0)
    expect(second.nextCursor).toBeNull()
  })

  it('handles missing session directory gracefully', () => {
    // model_usage row whose session_id has no matching session row
    insertUsage(db, { id: 'u1', session_id: 'orphan', model_id: 'GLM-5.2', started_at: 100, input_tokens: 10, output_tokens: 2 })

    const result = runParseZcode(db, {
      dbPath: '/db.sqlite',
      device: 'd',
      deviceInstanceId: 'i',
      now: 1000,
      cursor: null,
    })

    expect(result.records).toHaveLength(1)
    expect(result.records[0].cwd).toBe('')
  })
})
