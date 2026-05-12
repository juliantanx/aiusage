import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { initializeDatabase } from '../../src/db/index.js'
import { insertRecord } from '../../src/db/records.js'
import { exportData } from '../../src/commands/export.js'
import type { StatsRecord } from '@aiusage/core'

describe('Export Command', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initializeDatabase(db)
  })

  afterEach(() => {
    db.close()
  })

  it('exports as CSV', () => {
    insertRecord(db, {
      id: 'r1', ts: 1776738085346, ingestedAt: 1776738085700, updatedAt: 1776738085700,
      lineOffset: 100, tool: 'claude-code', model: 'claude-sonnet-4-6', provider: 'anthropic',
      inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, cacheWriteTokens: 200,
      thinkingTokens: 0, cost: 0.001, costSource: 'pricing', sessionId: 'abc123',
      sourceFile: '/path/to/file.jsonl', device: 'test-device', deviceInstanceId: 'device-123',
    })
    const csv = exportData(db, 'csv')
    expect(csv).toContain('timestamp,tool,model')
    expect(csv).toContain('claude-code')
  })

  it('exports as JSON', () => {
    insertRecord(db, {
      id: 'r1', ts: 1776738085346, ingestedAt: 1776738085700, updatedAt: 1776738085700,
      lineOffset: 100, tool: 'claude-code', model: 'claude-sonnet-4-6', provider: 'anthropic',
      inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, cacheWriteTokens: 200,
      thinkingTokens: 0, cost: 0.001, costSource: 'pricing', sessionId: 'abc123',
      sourceFile: '/path/to/file.jsonl', device: 'test-device', deviceInstanceId: 'device-123',
    })
    const json = JSON.parse(exportData(db, 'json'))
    expect(Array.isArray(json)).toBe(true)
    expect(json[0].tool).toBe('claude-code')
  })

  it('exports as NDJSON', () => {
    insertRecord(db, {
      id: 'r1', ts: 1776738085346, ingestedAt: 1776738085700, updatedAt: 1776738085700,
      lineOffset: 100, tool: 'claude-code', model: 'claude-sonnet-4-6', provider: 'anthropic',
      inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, cacheWriteTokens: 200,
      thinkingTokens: 0, cost: 0.001, costSource: 'pricing', sessionId: 'abc123',
      sourceFile: '/path/to/file.jsonl', device: 'test-device', deviceInstanceId: 'device-123',
    })
    const ndjson = exportData(db, 'ndjson')
    const lines = ndjson.trim().split('\n')
    expect(lines).toHaveLength(1)
    const record = JSON.parse(lines[0])
    expect(record.tool).toBe('claude-code')
  })
})
