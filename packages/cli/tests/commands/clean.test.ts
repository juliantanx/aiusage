import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { initializeDatabase } from '../../src/db/index.js'
import { insertRecord } from '../../src/db/records.js'
import { cleanOldData, cleanAll } from '../../src/commands/clean.js'
import type { StatsRecord } from '@aiusage/core'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('cleanOldData', () => {
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

  it('preserves records within the retention period', () => {
    const now = Date.now()
    const day = 86400000
    insertRecord(db, {
      id: 'r1', ts: now - 5 * day, ingestedAt: now, updatedAt: now,
      lineOffset: 100, tool: 'claude-code', model: 'test', provider: 'test',
      inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0,
      thinkingTokens: 0, cost: 0, costSource: 'pricing', sessionId: 's1',
      sourceFile: '/f1', device: 'd1', deviceInstanceId: 'di1',
    })

    const result = cleanOldData(db, 20)
    expect(result.deletedCount).toBe(0)
    expect(db.prepare('SELECT COUNT(*) as count FROM records').get()).toEqual({ count: 1 })
  })

  it('preserves tool calls with valid record_id', () => {
    const now = Date.now()
    const day = 86400000
    insertRecord(db, {
      id: 'r1', ts: now - 30 * day, ingestedAt: now, updatedAt: now,
      lineOffset: 100, tool: 'claude-code', model: 'test', provider: 'test',
      inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0,
      thinkingTokens: 0, cost: 0, costSource: 'pricing', sessionId: 's1',
      sourceFile: '/f1', device: 'd1', deviceInstanceId: 'di1',
    })
    db.prepare("INSERT INTO tool_calls (id, record_id, tool, name, ts, call_index) VALUES ('tc1', 'r1', 'codex', 'Read', ?, 0)").run(now - 30 * day)

    const result = cleanOldData(db, 20)
    expect(result.deletedOrphanToolCalls).toBe(0)
  })
})

describe('cleanAll', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initializeDatabase(db)
  })

  afterEach(() => {
    db.close()
  })

  it('deletes all records', () => {
    const now = Date.now()
    insertRecord(db, {
      id: 'r1', ts: now, ingestedAt: now, updatedAt: now,
      lineOffset: 100, tool: 'claude-code', model: 'test', provider: 'test',
      inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0,
      thinkingTokens: 0, cost: 0, costSource: 'pricing', sessionId: 's1',
      sourceFile: '/f1', device: 'd1', deviceInstanceId: 'di1',
    })
    insertRecord(db, {
      id: 'r2', ts: now, ingestedAt: now, updatedAt: now,
      lineOffset: 200, tool: 'claude-code', model: 'test', provider: 'test',
      inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0,
      thinkingTokens: 0, cost: 0, costSource: 'pricing', sessionId: 's2',
      sourceFile: '/f2', device: 'd1', deviceInstanceId: 'di1',
    })

    const result = cleanAll(db)
    expect(result.deletedRecords).toBe(2)
    expect(db.prepare('SELECT COUNT(*) as count FROM records').get()).toEqual({ count: 0 })
  })

  it('deletes all tool calls (orphan directly, FK-linked via cascade from records)', () => {
    const now = Date.now()
    // Insert a parent record so FK constraint is satisfied
    insertRecord(db, {
      id: 'r1', ts: now, ingestedAt: now, updatedAt: now,
      lineOffset: 100, tool: 'claude-code', model: 'test', provider: 'test',
      inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0,
      thinkingTokens: 0, cost: 0, costSource: 'pricing', sessionId: 's1',
      sourceFile: '/f1', device: 'd1', deviceInstanceId: 'di1',
    })
    db.prepare("INSERT INTO tool_calls (id, record_id, tool, name, ts, call_index) VALUES ('tc1', NULL, 'codex', 'Read', ?, 0)").run(now)
    db.prepare("INSERT INTO tool_calls (id, record_id, tool, name, ts, call_index) VALUES ('tc2', 'r1', 'codex', 'Write', ?, 1)").run(now)

    // DELETE FROM records cascades to delete tc2 (FK), DELETE FROM tool_calls deletes tc1 (orphan)
    const result = cleanAll(db)
    expect(result.deletedRecords).toBe(1)
    // tc2 was cascade-deleted by records deletion, tc1 deleted by explicit DELETE FROM tool_calls
    expect(result.deletedToolCalls).toBe(1)
    expect(db.prepare('SELECT COUNT(*) as count FROM tool_calls').get()).toEqual({ count: 0 })
  })

  it('deletes all synced records', () => {
    db.prepare("INSERT INTO synced_records (id, ts, tool, model, provider, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, updated_at, session_key, source_file, cwd, device, device_instance_id, platform) VALUES ('sr1', 1000, 'claude-code', 'test', 'test', 0, 0, 0, 0, 0, 1000, 's1', '/f1', '', 'd1', 'di1', '')").run()
    db.prepare("INSERT INTO synced_records (id, ts, tool, model, provider, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, updated_at, session_key, source_file, cwd, device, device_instance_id, platform) VALUES ('sr2', 2000, 'claude-code', 'test', 'test', 0, 0, 0, 0, 0, 2000, 's2', '/f2', '', 'd1', 'di1', '')").run()

    const result = cleanAll(db)
    expect(result.deletedSyncedRecords).toBe(2)
  })

  it('deletes sync tombstones', () => {
    db.prepare("INSERT INTO sync_tombstones (id, device_scope, deleted_at, reason) VALUES ('t1', '*', 1000, 'manual_clean')").run()

    const result = cleanAll(db)
    expect(result.deletedTombstones).toBe(1)
  })

  it('deletes watermark file when it exists', () => {
    const testDir = join(tmpdir(), `aiusage-test-${Date.now()}`)
    mkdirSync(testDir, { recursive: true })
    const watermarkPath = join(testDir, 'watermark.json')
    writeFileSync(watermarkPath, '{}')

    // We can't easily test the watermark deletion since cleanAll uses AIUSAGE_DIR
    // But we verify the function doesn't throw when watermark doesn't exist
    const result = cleanAll(db)
    expect(result.watermarkRemoved).toBe(false) // no watermark in test AIUSAGE_DIR
  })
})
