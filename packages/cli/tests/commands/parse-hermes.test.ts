import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { runParseHermes } from '../../src/commands/parse-hermes.js'
import { initializeDatabase } from '../../src/db/index.js'

vi.mock('node:os', async () => {
  const actual = await vi.importActual('node:os')
  return {
    ...actual,
    homedir: () => join(tmpdir(), 'aiusage-parse-hermes-test'),
  }
})

// Must import after mock so it picks up the mocked homedir
const { runParse } = await import('../../src/commands/parse.js')

function createHermesDb(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      model TEXT,
      billing_provider TEXT,
      billing_base_url TEXT,
      started_at REAL NOT NULL,
      ended_at REAL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens INTEGER NOT NULL DEFAULT 0,
      cache_write_tokens INTEGER NOT NULL DEFAULT 0,
      reasoning_tokens INTEGER NOT NULL DEFAULT 0,
      estimated_cost_usd REAL,
      actual_cost_usd REAL
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      tool_calls TEXT,
      timestamp REAL NOT NULL
    )
  `)
}

const BASE_OPTIONS = {
  dbPath: '/home/user/.hermes/state.db',
  device: 'macbook',
  deviceInstanceId: 'device-abc',
  now: 1779500000000,
  cursor: null,
}

describe('runParseHermes', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    createHermesDb(db)
  })

  afterEach(() => {
    db.close()
  })

  it('imports a completed session with token data', () => {
    db.prepare(`
      INSERT INTO sessions (id, model, billing_provider, started_at, ended_at, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('sess_1', 'deepseek-v4-flash', 'custom', 1779408317.5, 1779408400.0, 5000, 200, 100, 50, 10)

    const result = runParseHermes(db, BASE_OPTIONS)

    expect(result.records).toHaveLength(1)
    expect(result.records[0].tool).toBe('hermes')
    expect(result.records[0].model).toBe('deepseek-v4-flash')
    expect(result.records[0].inputTokens).toBe(5000)
    expect(result.records[0].outputTokens).toBe(200)
    expect(result.records[0].cacheReadTokens).toBe(100)
    expect(result.records[0].cacheWriteTokens).toBe(50)
    expect(result.records[0].thinkingTokens).toBe(10)
    expect(result.records[0].ts).toBe(Math.round(1779408317.5 * 1000))
    expect(result.records[0].sessionId).toBe('sess_1')
    expect(result.records[0].sourceFile).toBe('/home/user/.hermes/state.db')
    expect(result.records[0].lineOffset).toBe(0)
    expect(result.errors).toHaveLength(0)
  })

  it('skips sessions with ended_at IS NULL (still running)', () => {
    db.prepare(`
      INSERT INTO sessions (id, model, started_at, ended_at, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('sess_running', 'deepseek-v4-flash', 1779408317.5, null, 5000, 200, 0, 0, 0)

    const result = runParseHermes(db, BASE_OPTIONS)

    expect(result.records).toHaveLength(0)
    expect(result.nextCursor).toBeNull()
  })

  it('infers provider from model when billing_provider is null', () => {
    db.prepare(`
      INSERT INTO sessions (id, model, billing_provider, started_at, ended_at, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('sess_1', 'deepseek-v4-flash', null, 1779408317.5, 1779408400.0, 100, 20, 0, 0, 0)

    const result = runParseHermes(db, BASE_OPTIONS)

    expect(result.records[0].provider).toBe('deepseek')
  })

  it('infers provider from model when billing_provider is "custom"', () => {
    db.prepare(`
      INSERT INTO sessions (id, model, billing_provider, started_at, ended_at, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('sess_1', 'glm-5.1', 'custom', 1779408317.5, 1779408400.0, 100, 20, 0, 0, 0)

    const result = runParseHermes(db, BASE_OPTIONS)

    expect(result.records[0].provider).toBe('zhipu')
  })

  it('uses actual_cost_usd when > 0 (costSource: log)', () => {
    db.prepare(`
      INSERT INTO sessions (id, model, billing_provider, started_at, ended_at, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens, actual_cost_usd, estimated_cost_usd)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('sess_1', 'gpt-4o', 'openai', 1779408317.5, 1779408400.0, 100, 20, 0, 0, 0, 0.005, 0.004)

    const result = runParseHermes(db, BASE_OPTIONS)

    expect(result.records[0].cost).toBe(0.005)
    expect(result.records[0].costSource).toBe('log')
  })

  it('uses estimated_cost_usd when actual_cost_usd is null and estimated > 0 (costSource: log)', () => {
    db.prepare(`
      INSERT INTO sessions (id, model, billing_provider, started_at, ended_at, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens, actual_cost_usd, estimated_cost_usd)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('sess_1', 'gpt-4o', 'openai', 1779408317.5, 1779408400.0, 100, 20, 0, 0, 0, null, 0.004)

    const result = runParseHermes(db, BASE_OPTIONS)

    expect(result.records[0].cost).toBe(0.004)
    expect(result.records[0].costSource).toBe('log')
  })

  it('falls back to pricing table when both cost fields are 0 or null', () => {
    db.prepare(`
      INSERT INTO sessions (id, model, billing_provider, started_at, ended_at, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens, actual_cost_usd, estimated_cost_usd)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('sess_1', 'claude-sonnet-4-6', null, 1779408317.5, 1779408400.0, 1000000, 0, 0, 0, 0, null, 0.0)

    const result = runParseHermes(db, BASE_OPTIONS)

    expect(result.records[0].cost).toBeCloseTo(3.0, 5)
    expect(result.records[0].costSource).toBe('pricing')
  })

  it('sets costSource unknown when model is unknown', () => {
    db.prepare(`
      INSERT INTO sessions (id, model, billing_provider, started_at, ended_at, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('sess_1', null, null, 1779408317.5, 1779408400.0, 100, 20, 0, 0, 0)

    const result = runParseHermes(db, BASE_OPTIONS)

    expect(result.records[0].model).toBe('unknown')
    expect(result.records[0].cost).toBe(0)
    expect(result.records[0].costSource).toBe('unknown')
  })

  it('extracts tool calls from messages table', () => {
    db.prepare(`
      INSERT INTO sessions (id, model, billing_provider, started_at, ended_at, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('sess_1', 'deepseek-v4-flash', null, 1779408317.5, 1779408400.0, 100, 20, 0, 0, 0)

    db.prepare(`
      INSERT INTO messages (session_id, role, tool_calls, timestamp)
      VALUES (?, ?, ?, ?)
    `).run('sess_1', 'assistant', JSON.stringify([
      { id: 'tc1', type: 'function', function: { name: 'terminal', arguments: '{}' } },
      { id: 'tc2', type: 'function', function: { name: 'read_file', arguments: '{}' } },
    ]), 1779408350.0)

    db.prepare(`
      INSERT INTO messages (session_id, role, tool_calls, timestamp)
      VALUES (?, ?, ?, ?)
    `).run('sess_1', 'assistant', JSON.stringify([
      { id: 'tc3', type: 'function', function: { name: 'patch', arguments: '{}' } },
    ]), 1779408360.0)

    const result = runParseHermes(db, BASE_OPTIONS)

    expect(result.toolCalls).toHaveLength(3)
    expect(result.toolCalls.map(tc => tc.name)).toEqual(['terminal', 'read_file', 'patch'])
    expect(result.toolCalls[0].callIndex).toBe(0)
    expect(result.toolCalls[1].callIndex).toBe(1)
    expect(result.toolCalls[2].callIndex).toBe(2)
    expect(result.toolCalls[0].recordId).toBe(result.records[0].id)
  })

  it('skips messages without tool_calls and user messages', () => {
    db.prepare(`
      INSERT INTO sessions (id, model, billing_provider, started_at, ended_at, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('sess_1', 'deepseek-v4-flash', null, 1779408317.5, 1779408400.0, 100, 20, 0, 0, 0)

    db.prepare(`INSERT INTO messages (session_id, role, tool_calls, timestamp) VALUES (?, ?, ?, ?)`)
      .run('sess_1', 'user', null, 1779408320.0)
    db.prepare(`INSERT INTO messages (session_id, role, tool_calls, timestamp) VALUES (?, ?, ?, ?)`)
      .run('sess_1', 'assistant', null, 1779408330.0)

    const result = runParseHermes(db, BASE_OPTIONS)

    expect(result.toolCalls).toHaveLength(0)
  })

  it('records error for malformed tool_calls JSON but still emits the record', () => {
    db.prepare(`
      INSERT INTO sessions (id, model, billing_provider, started_at, ended_at, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('sess_1', 'deepseek-v4-flash', null, 1779408317.5, 1779408400.0, 100, 20, 0, 0, 0)

    db.prepare(`INSERT INTO messages (session_id, role, tool_calls, timestamp) VALUES (?, ?, ?, ?)`)
      .run('sess_1', 'assistant', 'not-valid-json', 1779408330.0)

    const result = runParseHermes(db, BASE_OPTIONS)

    expect(result.records).toHaveLength(1)
    expect(result.toolCalls).toHaveLength(0)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('respects cursor for incremental import', () => {
    db.prepare(`
      INSERT INTO sessions (id, model, billing_provider, started_at, ended_at, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('sess_1', 'deepseek-v4-flash', null, 1779408317.5, 1779408400.0, 100, 20, 0, 0, 0)

    db.prepare(`
      INSERT INTO sessions (id, model, billing_provider, started_at, ended_at, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('sess_2', 'deepseek-v4-flash', null, 1779408500.0, 1779408600.0, 200, 40, 0, 0, 0)

    const result1 = runParseHermes(db, BASE_OPTIONS)
    expect(result1.records).toHaveLength(2)
    expect(result1.nextCursor).toEqual({ lastEndedAt: 1779408600.0, lastId: 'sess_2' })

    const result2 = runParseHermes(db, { ...BASE_OPTIONS, cursor: result1.nextCursor })
    expect(result2.records).toHaveLength(0)
    expect(result2.nextCursor).toBeNull()
  })

  it('returns nextCursor pointing to last session visited', () => {
    db.prepare(`
      INSERT INTO sessions (id, model, billing_provider, started_at, ended_at, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('sess_1', 'deepseek-v4-flash', null, 1779408317.5, 1779408400.0, 100, 20, 0, 0, 0)

    const result = runParseHermes(db, BASE_OPTIONS)

    expect(result.nextCursor).toEqual({ lastEndedAt: 1779408400.0, lastId: 'sess_1' })
  })
})

describe('runParse with hermes', () => {
  const testDir = join(tmpdir(), 'aiusage-parse-hermes-test')
  let cacheDb: Database.Database
  let hermesDbPath: string

  beforeEach(() => {
    mkdirSync(join(testDir, '.aiusage'), { recursive: true })
    writeFileSync(join(testDir, '.aiusage', 'watermark.json'), '{}')

    cacheDb = new Database(':memory:')
    initializeDatabase(cacheDb)

    hermesDbPath = join(testDir, '.hermes', 'state.db')
    mkdirSync(join(testDir, '.hermes'), { recursive: true })

    const hermesDb = new Database(hermesDbPath)
    createHermesDb(hermesDb)
    hermesDb.prepare(`
      INSERT INTO sessions (id, model, billing_provider, started_at, ended_at, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('sess_1', 'deepseek-v4-flash', 'custom', 1779408317.5, 1779408400.0, 5000, 200, 100, 50, 10)
    hermesDb.prepare(`
      INSERT INTO messages (session_id, role, tool_calls, timestamp)
      VALUES (?, ?, ?, ?)
    `).run('sess_1', 'assistant', JSON.stringify([
      { id: 'tc1', type: 'function', function: { name: 'terminal', arguments: '{}' } },
    ]), 1779408350.0)
    hermesDb.close()
  })

  afterEach(() => {
    cacheDb.close()
    rmSync(testDir, { recursive: true, force: true })
  })

  it('runParse imports hermes records when tool filter is hermes', async () => {
    const result = await runParse(cacheDb, 'hermes', { hermesDbPath })
    expect(result.parsedCount).toBe(1)
    expect(result.toolCallCount).toBe(1)
    expect(result.errors).toHaveLength(0)
  })

  it('runParse skips hermes when filter is different tool', async () => {
    const result = await runParse(cacheDb, 'claude-code', { hermesDbPath })
    expect(result.parsedCount).toBe(0)
    expect(result.toolCallCount).toBe(0)
    expect(result.errors).toHaveLength(0)
  })

  it('runParse handles missing hermes db gracefully', async () => {
    const result = await runParse(cacheDb, 'hermes', { hermesDbPath: join(testDir, 'nonexistent.db') })
    expect(result.parsedCount).toBe(0)
    expect(result.toolCallCount).toBe(0)
    expect(result.errors).toHaveLength(0)
  })

  it('runParse persists cursor so second call imports nothing new', async () => {
    const result1 = await runParse(cacheDb, 'hermes', { hermesDbPath })
    expect(result1.parsedCount).toBe(1)
    expect(result1.toolCallCount).toBe(1)

    const result2 = await runParse(cacheDb, 'hermes', { hermesDbPath })
    expect(result2.parsedCount).toBe(0)
    expect(result2.toolCallCount).toBe(0)
    expect(result2.errors).toHaveLength(0)
  })
})
