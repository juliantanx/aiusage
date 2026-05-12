import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { initializeDatabase } from '../../src/db/index.js'
import { insertRecord } from '../../src/db/records.js'
import { cleanOldData } from '../../src/commands/clean.js'
import type { StatsRecord } from '@aiusage/core'

describe('Clean Command', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initializeDatabase(db)
  })

  afterEach(() => {
    db.close()
  })

  it('deletes records older than specified days', () => {
    const now = Date.now()
    const day = 86400000
    insertRecord(db, {
      id: 'r1', ts: now - 30 * day, ingestedAt: now, updatedAt: now,
      lineOffset: 100, tool: 'claude-code', model: 'test', provider: 'test',
      inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0,
      thinkingTokens: 0, cost: 0, costSource: 'pricing', sessionId: 's1',
      sourceFile: '/f1', device: 'd1', deviceInstanceId: 'di1',
    })
    insertRecord(db, {
      id: 'r2', ts: now - 10 * day, ingestedAt: now, updatedAt: now,
      lineOffset: 200, tool: 'claude-code', model: 'test', provider: 'test',
      inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0,
      thinkingTokens: 0, cost: 0, costSource: 'pricing', sessionId: 's2',
      sourceFile: '/f2', device: 'd1', deviceInstanceId: 'di1',
    })

    const result = cleanOldData(db, 20)
    expect(result.deletedCount).toBe(1)
    expect(db.prepare('SELECT COUNT(*) as count FROM records').get()).toEqual({ count: 1 })
  })

  it('deletes orphan tool calls', () => {
    const now = Date.now()
    const day = 86400000
    db.prepare("INSERT INTO tool_calls (id, record_id, tool, name, ts, call_index) VALUES ('tc1', NULL, 'codex', 'Read', ?, 0)").run(now - 30 * day)

    const result = cleanOldData(db, 20)
    expect(result.deletedOrphanToolCalls).toBe(1)
  })
})
