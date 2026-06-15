import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { runParseZcode } from '../../src/commands/parse-zcode.js'

// Minimal re-creation of the ZCode `model_usage` + `tool_usage` + `session` schema,
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
    CREATE TABLE tool_usage (
      id TEXT PRIMARY KEY,
      tool_name TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at INTEGER NOT NULL
    );
  `)
}

interface InsertModelRow {
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

interface InsertToolRow {
  id: string
  tool_name: string
  status?: string
  started_at: number
}

function insertModelUsage(db: Database.Database, row: InsertModelRow): void {
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

function insertToolUsage(db: Database.Database, row: InsertToolRow): void {
  db.prepare(`
    INSERT INTO tool_usage (id, tool_name, status, started_at)
    VALUES (@id, @tool_name, @status, @started_at)
  `).run({
    id: row.id,
    tool_name: row.tool_name,
    status: row.status ?? 'completed',
    started_at: row.started_at,
  })
}

const baseOpts = {
  dbPath: '/home/user/.zcode/cli/db/db.sqlite',
  device: 'laptop',
  deviceInstanceId: 'device-abc',
  platform: 'win32' as const,
  now: 1781490000000,
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

  describe('token records (model_usage)', () => {
    it('imports completed model_usage rows with token data', () => {
      db.prepare(`INSERT INTO session (id, directory) VALUES ('sess_a', 'D:/proj')`).run()
      insertModelUsage(db, {
        id: 'usage_1',
        session_id: 'sess_a',
        model_id: 'GLM-5.2',
        started_at: 1781486799684,
        input_tokens: 1000,
        output_tokens: 200,
        cache_read_input_tokens: 500,
      })

      const result = runParseZcode(db, { ...baseOpts, cursor: null, toolCursor: null })

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
      insertModelUsage(db, {
        id: 'usage_1',
        session_id: 'sess_a',
        model_id: 'GLM-5.2',
        started_at: 1781486799684,
        input_tokens: 100,
        output_tokens: 10,
      })

      const result = runParseZcode(db, { ...baseOpts, cursor: null, toolCursor: null })

      expect(result.records[0].model).toBe('glm-5.2')
      expect(result.records[0].provider).toBe('zhipu')
    })

    it('skips error and zero-token rows', () => {
      insertModelUsage(db, { id: 'ok', session_id: 's1', model_id: 'GLM-5.2', started_at: 100, input_tokens: 5, output_tokens: 5 })
      insertModelUsage(db, { id: 'err', session_id: 's2', model_id: 'GLM-5.2', started_at: 200, status: 'error' })
      insertModelUsage(db, { id: 'zero', session_id: 's3', model_id: 'GLM-5.2', started_at: 300 })

      const result = runParseZcode(db, { ...baseOpts, cursor: null, toolCursor: null })

      expect(result.records).toHaveLength(1)
      expect(result.records[0].sessionId).toBe('s1')
      expect(result.records[0].inputTokens).toBe(5)
    })

    it('respects cursor for incremental import', () => {
      insertModelUsage(db, { id: 'old', session_id: 's', model_id: 'GLM-5.2', started_at: 100, input_tokens: 5, output_tokens: 5 })
      insertModelUsage(db, { id: 'new', session_id: 's', model_id: 'GLM-5.2', started_at: 200, input_tokens: 8, output_tokens: 8 })

      const first = runParseZcode(db, { ...baseOpts, cursor: null, toolCursor: null })
      expect(first.records).toHaveLength(2)
      expect(first.nextCursor).toEqual({ lastStartedAt: 200, lastId: 'new' })

      const second = runParseZcode(db, { ...baseOpts, cursor: first.nextCursor, toolCursor: null })
      expect(second.records).toHaveLength(0)
      expect(second.nextCursor).toBeNull()
    })

    it('handles missing session directory gracefully', () => {
      insertModelUsage(db, { id: 'u1', session_id: 'orphan', model_id: 'GLM-5.2', started_at: 100, input_tokens: 10, output_tokens: 2 })

      const result = runParseZcode(db, { ...baseOpts, cursor: null, toolCursor: null })

      expect(result.records).toHaveLength(1)
      expect(result.records[0].cwd).toBe('')
    })
  })

  describe('tool calls (tool_usage)', () => {
    it('imports completed tool calls as orphans', () => {
      insertToolUsage(db, { id: 't1', tool_name: 'Bash', started_at: 500 })
      insertToolUsage(db, { id: 't2', tool_name: 'Read', started_at: 600 })
      insertToolUsage(db, { id: 't3', tool_name: 'Edit', started_at: 700, status: 'error' })

      const result = runParseZcode(db, { ...baseOpts, cursor: null, toolCursor: null })

      expect(result.toolCalls).toHaveLength(2)
      // All orphan (no parent record)
      expect(result.toolCalls.every(tc => tc.recordId === null)).toBe(true)
      // Names preserved
      expect(result.toolCalls.map(tc => tc.name)).toEqual(['Bash', 'Read'])
      // callIndex increments within the batch
      expect(result.toolCalls[0].callIndex).toBe(0)
      expect(result.toolCalls[1].callIndex).toBe(1)
      // IDs are stable hashes
      expect(result.toolCalls[0].id).toHaveLength(16)
      expect(result.nextToolCursor).toEqual({ lastStartedAt: 600, lastId: 't2' })
    })

    it('respects tool cursor independently of token cursor', () => {
      insertToolUsage(db, { id: 't1', tool_name: 'Bash', started_at: 500 })
      insertToolUsage(db, { id: 't2', tool_name: 'Read', started_at: 600 })

      // Token cursor null, but tool cursor past everything → no tool calls
      const result = runParseZcode(db, {
        ...baseOpts,
        cursor: null,
        toolCursor: { lastStartedAt: 600, lastId: 't2' },
      })
      expect(result.toolCalls).toHaveLength(0)
      expect(result.nextToolCursor).toBeNull()
    })

    it('skips running tool calls', () => {
      insertToolUsage(db, { id: 't1', tool_name: 'Bash', started_at: 500, status: 'running' })
      insertToolUsage(db, { id: 't2', tool_name: 'Read', started_at: 600 })

      const result = runParseZcode(db, { ...baseOpts, cursor: null, toolCursor: null })

      expect(result.toolCalls).toHaveLength(1)
      expect(result.toolCalls[0].name).toBe('Read')
    })
  })
})
