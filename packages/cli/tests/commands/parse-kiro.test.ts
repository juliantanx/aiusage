import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { runParseKiro } from '../../src/commands/parse-kiro.js'

describe('parse-kiro', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE tokens_generated (
        id INTEGER PRIMARY KEY,
        model TEXT,
        provider TEXT,
        tokens_prompt INTEGER,
        tokens_generated INTEGER,
        timestamp TEXT
      )
    `)
  })

  afterEach(() => {
    db.close()
  })

  it('imports Kiro IDE token rows', () => {
    db.prepare(`
      INSERT INTO tokens_generated (id, model, provider, tokens_prompt, tokens_generated, timestamp)
      VALUES (1, 'CLAUDE_SONNET_4_20250514_V1_0', 'kiro', 400, 80, '2026-04-19 08:00:00')
    `).run()

    const result = runParseKiro(db, {
      dbPath: '/tmp/devdata.sqlite',
      device: 'macbook',
      deviceInstanceId: 'device-123',
      now: 1778822000000,
      cursor: null,
    })

    expect(result.errors).toHaveLength(0)
    expect(result.records).toHaveLength(1)
    expect(result.records[0]).toMatchObject({
      tool: 'kiro',
      model: 'claude-sonnet-4',
      provider: 'kiro',
      inputTokens: 400,
      outputTokens: 80,
    })
    expect(result.nextCursor).toEqual({ lastCreatedAt: '2026-04-19 08:00:00', lastId: '1' })
  })
})
