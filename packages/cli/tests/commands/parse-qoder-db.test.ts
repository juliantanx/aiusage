import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { runParseQoder } from '../../src/commands/parse-qoder.js'
import { initializeDatabase } from '../../src/db/index.js'

vi.mock('node:os', async () => {
  const actual = await vi.importActual('node:os')
  return {
    ...actual,
    homedir: () => join(tmpdir(), 'aiusage-parse-qoder-db-test'),
  }
})

const { runParse } = await import('../../src/commands/parse.js')

function createQoderDb(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_message (
      id VARCHAR(64) PRIMARY KEY,
      session_id VARCHAR(64),
      request_id VARCHAR(64),
      role VARCHAR(64),
      content TEXT,
      token_info TEXT,
      model_info TEXT,
      extra TEXT DEFAULT '',
      gmt_create INTEGER
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_record (
      request_id VARCHAR(64) PRIMARY KEY,
      session_id VARCHAR(64),
      chat_task VARCHAR(64),
      extra TEXT DEFAULT '{}'
    )
  `)
}

const BASE_OPTIONS = {
  dbPath: '/fake/local.db',
  device: 'macbook',
  deviceInstanceId: 'device-abc',
  now: 1779500000000,
  cursor: null,
}

describe('runParseQoder', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    createQoderDb(db)
  })

  afterEach(() => {
    db.close()
  })

  it('imports assistant messages with token info', () => {
    db.prepare(`INSERT INTO chat_record VALUES (?, ?, ?, ?)`).run(
      'req-1', 'sess-1', 'chat', JSON.stringify({ modelConfig: { key: 'auto' } })
    )
    db.prepare(`INSERT INTO chat_message VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'msg-1', 'sess-1', 'req-1', 'assistant', '',
      JSON.stringify({ prompt_tokens: 1000, completion_tokens: 50, cached_tokens: 0, max_input_tokens: 180000 }),
      JSON.stringify({ model_key: 'custom_model' }), '', 1779607150341
    )

    const result = runParseQoder(db, BASE_OPTIONS)

    expect(result.records).toHaveLength(1)
    expect(result.errors).toHaveLength(0)
    const r = result.records[0]
    expect(r.tool).toBe('qoder')
    expect(r.model).toBe('qoder-auto')
    expect(r.provider).toBe('qoder')
    expect(r.inputTokens).toBe(1000)
    expect(r.outputTokens).toBe(50)
    expect(r.cacheReadTokens).toBe(0)
    expect(r.sessionId).toBe('sess-1')
    expect(r.ts).toBe(1779607150341)
  })

  it('skips user messages', () => {
    db.prepare(`INSERT INTO chat_message VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'msg-u', 'sess-1', 'req-1', 'user', 'hello', '', '', '', 1779607150000
    )
    const result = runParseQoder(db, BASE_OPTIONS)
    expect(result.records).toHaveLength(0)
  })

  it('skips zero-token assistant messages', () => {
    db.prepare(`INSERT INTO chat_message VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'msg-z', 'sess-1', 'req-1', 'assistant', '',
      JSON.stringify({ prompt_tokens: 0, completion_tokens: 0, cached_tokens: 0 }),
      '', '', 1779607150000
    )
    const result = runParseQoder(db, BASE_OPTIONS)
    expect(result.records).toHaveLength(0)
  })

  it('defaults model to qoder-auto when modelConfig.key is empty', () => {
    db.prepare(`INSERT INTO chat_record VALUES (?, ?, ?, ?)`).run(
      'req-2', 'sess-2', 'chat', JSON.stringify({ modelConfig: { key: '' } })
    )
    db.prepare(`INSERT INTO chat_message VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'msg-2', 'sess-2', 'req-2', 'assistant', '',
      JSON.stringify({ prompt_tokens: 500, completion_tokens: 20, cached_tokens: 0 }),
      '', '', 1779607160000
    )
    const result = runParseQoder(db, BASE_OPTIONS)
    expect(result.records[0].model).toBe('qoder-auto')
  })

  it('normalizes named tier models', () => {
    db.prepare(`INSERT INTO chat_record VALUES (?, ?, ?, ?)`).run(
      'req-3', 'sess-3', 'chat', JSON.stringify({ modelConfig: { key: 'ultimate' } })
    )
    db.prepare(`INSERT INTO chat_message VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'msg-3', 'sess-3', 'req-3', 'assistant', '',
      JSON.stringify({ prompt_tokens: 800, completion_tokens: 30, cached_tokens: 0 }),
      '', '', 1779607170000
    )
    const result = runParseQoder(db, BASE_OPTIONS)
    expect(result.records[0].model).toBe('qoder-ultimate')
    expect(result.records[0].costSource).toBe('pricing')
    expect(result.records[0].cost).toBeGreaterThan(0)
  })

  it('tracks cached tokens', () => {
    db.prepare(`INSERT INTO chat_record VALUES (?, ?, ?, ?)`).run(
      'req-4', 'sess-4', 'chat', JSON.stringify({ modelConfig: { key: 'efficient' } })
    )
    db.prepare(`INSERT INTO chat_message VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'msg-4', 'sess-4', 'req-4', 'assistant', '',
      JSON.stringify({ prompt_tokens: 24000, completion_tokens: 80, cached_tokens: 23500 }),
      '', '', 1779607180000
    )
    const result = runParseQoder(db, BASE_OPTIONS)
    expect(result.records[0].cacheReadTokens).toBe(23500)
    // prompt_tokens includes cached_tokens (OpenAI convention), so inputTokens = 24000 - 23500
    expect(result.records[0].inputTokens).toBe(500)
  })

  it('advances cursor and skips already-seen records', () => {
    db.prepare(`INSERT INTO chat_record VALUES (?, ?, ?, ?)`).run(
      'req-5', 'sess-5', 'chat', JSON.stringify({ modelConfig: { key: 'auto' } })
    )
    db.prepare(`INSERT INTO chat_message VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'msg-5', 'sess-5', 'req-5', 'assistant', '',
      JSON.stringify({ prompt_tokens: 100, completion_tokens: 10, cached_tokens: 0 }),
      '', '', 1779607190000
    )

    const first = runParseQoder(db, BASE_OPTIONS)
    expect(first.records).toHaveLength(1)
    expect(first.nextCursor).toEqual({ lastGmtCreate: 1779607190000, lastId: 'msg-5' })

    const second = runParseQoder(db, { ...BASE_OPTIONS, cursor: first.nextCursor })
    expect(second.records).toHaveLength(0)
  })
})

describe('runParse with qoder SQLite DB', () => {
  const testDir = join(tmpdir(), 'aiusage-parse-qoder-db-test')
  let cacheDb: Database.Database
  let qoderDb: Database.Database
  let qoderDbPath: string

  beforeEach(() => {
    mkdirSync(join(testDir, '.aiusage'), { recursive: true })
    writeFileSync(join(testDir, '.aiusage', 'watermark.json'), '{}')
    writeFileSync(join(testDir, '.aiusage', 'config.json'), '{}')

    cacheDb = new Database(':memory:')
    initializeDatabase(cacheDb)

    qoderDbPath = join(testDir, 'local.db')
    qoderDb = new Database(qoderDbPath)
    createQoderDb(qoderDb)
    qoderDb.prepare(`INSERT INTO chat_record VALUES (?, ?, ?, ?)`).run(
      'req-a', 'sess-a', 'chat', JSON.stringify({ modelConfig: { key: 'auto' } })
    )
    qoderDb.prepare(`INSERT INTO chat_message VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'msg-a', 'sess-a', 'req-a', 'assistant', '',
      JSON.stringify({ prompt_tokens: 23923, completion_tokens: 132, cached_tokens: 0 }),
      '', '', 1779607150341
    )
    qoderDb.close()
  })

  afterEach(() => {
    cacheDb.close()
    rmSync(testDir, { recursive: true, force: true })
  })

  it('imports qoder records from SQLite DB via runParse', async () => {
    const result = await runParse(cacheDb, 'qoder', { qoderDbPath })

    expect(result.parsedCount).toBe(1)
    expect(result.errors).toHaveLength(0)

    const row = cacheDb.prepare('SELECT tool, model, input_tokens, output_tokens, session_id FROM records').get() as any
    expect(row.tool).toBe('qoder')
    expect(row.model).toBe('qoder-auto')
    expect(row.input_tokens).toBe(23923)
    expect(row.output_tokens).toBe(132)
    expect(row.session_id).toBe('sess-a')
  })

  it('respects cursor on subsequent runParse calls', async () => {
    const first = await runParse(cacheDb, 'qoder', { qoderDbPath })
    expect(first.parsedCount).toBe(1)

    const second = await runParse(cacheDb, 'qoder', { qoderDbPath })
    expect(second.parsedCount).toBe(0)
  })
})
