import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { initializeDatabase } from '../../src/db/index.js'
import { insertRecord } from '../../src/db/records.js'
import { insertToolCall, getToolCallsByRecordId, getToolCallStats, deleteOrphanToolCalls } from '../../src/db/tool-calls.js'
import type { ToolCallRecord, StatsRecord } from '@aiusage/core'

function createTestToolCall(overrides: Partial<ToolCallRecord> & Record<string, unknown> = {}): ToolCallRecord & Record<string, unknown> {
  return {
    id: 'tc-1',
    recordId: 'record-1',
    name: 'Read',
    ts: 1776738085346,
    callIndex: 0,
    ...overrides,
  }
}

/** Minimal parent record to satisfy FK constraint */
function createParentRecord(id: string = 'record-1'): StatsRecord {
  return {
    id,
    ts: 1776738085346,
    ingestedAt: 1776738085700,
    updatedAt: 1776738085700,
    lineOffset: 100,
    tool: 'claude-code',
    model: 'claude-sonnet-4-6',
    provider: 'anthropic',
    inputTokens: 100,
    outputTokens: 50,
    cacheReadTokens: 0,
    cacheWriteTokens: 200,
    thinkingTokens: 0,
    cost: 0.001,
    costSource: 'pricing',
    sessionId: 'abc123',
    sourceFile: '/path/to/file.jsonl',
    device: 'test-device',
    deviceInstanceId: 'device-123',
  }
}

describe('Tool Calls Operations', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initializeDatabase(db)
    // Insert parent record so FK references to 'record-1' are valid
    insertRecord(db, createParentRecord())
  })

  afterEach(() => {
    db.close()
  })

  it('inserts a tool call', () => {
    const tc = createTestToolCall()
    insertToolCall(db, tc)
    const results = getToolCallsByRecordId(db, 'record-1')
    expect(results).toHaveLength(1)
    expect(results[0].name).toBe('Read')
  })

  it('inserts orphan tool call (recordId = null)', () => {
    const tc = createTestToolCall({ id: 'tc-orphan', recordId: null, tool: 'codex' })
    insertToolCall(db, tc)
    const results = getToolCallsByRecordId(db, null)
    expect(results).toHaveLength(1)
    expect(results[0].recordId).toBeNull()
  })

  it('gets tool call stats grouped by name', () => {
    insertToolCall(db, createTestToolCall({ id: 'tc1', name: 'Read' }))
    insertToolCall(db, createTestToolCall({ id: 'tc2', name: 'Read' }))
    insertToolCall(db, createTestToolCall({ id: 'tc3', name: 'Bash' }))

    const stats = getToolCallStats(db)
    expect(stats).toHaveLength(2)
    expect(stats.find(s => s.name === 'Read')?.count).toBe(2)
    expect(stats.find(s => s.name === 'Bash')?.count).toBe(1)
  })

  it('deletes orphan tool calls older than timestamp', () => {
    insertToolCall(db, createTestToolCall({ id: 'tc1', recordId: null, tool: 'codex', ts: 1000 }))
    insertToolCall(db, createTestToolCall({ id: 'tc2', recordId: null, tool: 'codex', ts: 2000 }))
    insertToolCall(db, createTestToolCall({ id: 'tc3', recordId: 'record-1', ts: 1000 }))

    const deleted = deleteOrphanToolCalls(db, 1500)
    expect(deleted).toBe(1)
  })
})
