import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { runParseZed } from '../../src/commands/parse-zed.js'

describe('parse-zed', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
  })

  afterEach(() => {
    db.close()
  })

  it('imports thread rows when updated_at is absent', () => {
    db.exec(`
      CREATE TABLE threads (
        id TEXT PRIMARY KEY,
        created_at TEXT,
        data_type TEXT,
        data TEXT
      )
    `)
    db.prepare(`
      INSERT INTO threads (id, created_at, data_type, data)
      VALUES (?, ?, ?, ?)
    `).run('thread-1', '2026-05-01T10:00:00.000Z', 'json', JSON.stringify({
      model: { provider: 'anthropic', model: 'claude-sonnet-4' },
      request_token_usage: [
        {
          input_tokens: 120,
          output_tokens: 30,
          cache_read_input_tokens: 10,
          cache_creation_input_tokens: 5,
        },
      ],
    }))

    const result = runParseZed(db, {
      dbPath: '/tmp/threads.db',
      device: 'macbook',
      deviceInstanceId: 'device-123',
      now: 1778822000000,
      cursor: null,
    })

    expect(result.errors).toHaveLength(0)
    expect(result.records).toHaveLength(1)
    expect(result.nextCursor).toEqual({ lastCreatedAt: '', lastId: 'thread-1' })
    expect(result.records[0]).toMatchObject({
      tool: 'zed',
      model: 'claude-sonnet-4',
      provider: 'anthropic',
      inputTokens: 120,
      outputTokens: 30,
      cacheReadTokens: 10,
      cacheWriteTokens: 5,
      sessionId: 'thread-1',
    })
  })
})
