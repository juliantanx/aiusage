import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, rmSync } from 'node:fs'
import { initializeDatabase } from '../../src/db/index.js'
import { insertRecord } from '../../src/db/records.js'
import { insertToolCall } from '../../src/db/tool-calls.js'
import { generateSummary } from '../../src/commands/summary.js'
import type { StatsRecord, ToolCallRecord } from '@aiusage/core'

function createTestRecord(overrides: Partial<StatsRecord> = {}): StatsRecord {
  return {
    id: 'test-record-1',
    ts: Date.now(),
    ingestedAt: Date.now(),
    updatedAt: Date.now(),
    lineOffset: 100,
    tool: 'claude-code',
    model: 'claude-sonnet-4-6',
    provider: 'anthropic',
    inputTokens: 1000,
    outputTokens: 500,
    cacheReadTokens: 0,
    cacheWriteTokens: 200,
    thinkingTokens: 0,
    cost: 0.001,
    costSource: 'pricing',
    sessionId: 'abc123',
    sourceFile: '/path/to/file.jsonl',
    device: 'test-device',
    deviceInstanceId: 'device-123',
    ...overrides,
  }
}

describe('Summary Command', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initializeDatabase(db)
  })

  afterEach(() => {
    db.close()
  })

  it('generates summary with data', () => {
    insertRecord(db, createTestRecord({ id: 'r1', tool: 'claude-code', inputTokens: 1000, outputTokens: 500, cacheWriteTokens: 200, cost: 0.001 }))
    insertRecord(db, createTestRecord({ id: 'r2', tool: 'codex', inputTokens: 2000, outputTokens: 1000, cacheWriteTokens: 200, cost: 0.002 }))

    const summary = generateSummary(db)
    expect(summary.totalTokens).toBe(4900) // 1000+500+200+2000+1000+200
    expect(summary.totalCost).toBeCloseTo(0.003, 6)
    expect(summary.recordCount).toBe(2)
  })

  it('groups by tool', () => {
    insertRecord(db, createTestRecord({ id: 'r1', tool: 'claude-code', inputTokens: 1000, outputTokens: 500, cacheWriteTokens: 200, cost: 0.001 }))
    insertRecord(db, createTestRecord({ id: 'r2', tool: 'codex', inputTokens: 2000, outputTokens: 1000, cacheWriteTokens: 200, cost: 0.002 }))

    const summary = generateSummary(db)
    expect(summary.byTool['claude-code']).toBeDefined()
    expect(summary.byTool['codex']).toBeDefined()
    expect(summary.byTool['claude-code'].tokens).toBe(1700)
    expect(summary.byTool['codex'].tokens).toBe(3200)
  })

  it('returns empty summary when no data', () => {
    const summary = generateSummary(db)
    expect(summary.totalTokens).toBe(0)
    expect(summary.totalCost).toBe(0)
    expect(summary.recordCount).toBe(0)
  })

  it('includes top tool calls', () => {
    insertRecord(db, createTestRecord({ id: 'r1' }))
    insertToolCall(db, { id: 'tc1', recordId: 'r1', name: 'Read', ts: Date.now(), callIndex: 0 })
    insertToolCall(db, { id: 'tc2', recordId: 'r1', name: 'Read', ts: Date.now(), callIndex: 1 })
    insertToolCall(db, { id: 'tc3', recordId: 'r1', name: 'Bash', ts: Date.now(), callIndex: 0 })

    const summary = generateSummary(db)
    expect(summary.topToolCalls).toHaveLength(2)
    expect(summary.topToolCalls[0].name).toBe('Read')
    expect(summary.topToolCalls[0].count).toBe(2)
  })
})
