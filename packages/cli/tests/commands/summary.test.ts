import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, rmSync } from 'node:fs'
import { initializeDatabase } from '../../src/db/index.js'
import { insertRecord } from '../../src/db/records.js'
import { insertSyncedRecord } from '../../src/db/synced-records.js'
import { insertToolCall } from '../../src/db/tool-calls.js'
import { generateSummary } from '../../src/commands/summary.js'
import type { StatsRecord, SyncRecord, ToolCallRecord } from '@aiusage/core'

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

  it('returns merged data from records and synced_records', () => {
    insertRecord(db, createTestRecord({ id: 'local1', inputTokens: 100, outputTokens: 50, cacheWriteTokens: 0, cost: 0.001 }))
    insertSyncedRecord(db, {
      id: 'synced1',
      ts: Date.now(),
      tool: 'codex',
      model: 'gpt-4',
      provider: 'openai',
      inputTokens: 200,
      outputTokens: 100,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      thinkingTokens: 0,
      cost: 0.002,
      costSource: 'pricing',
      sessionKey: 'sk1',
      device: 'remote-device',
      deviceInstanceId: 'remote-uuid',
      updatedAt: Date.now(),
    })

    const summary = generateSummary(db, { currentDeviceInstanceId: 'device-123' })
    // local: 100+50=150, synced: 200+100=300, total=450
    expect(summary.totalTokens).toBe(450)
    expect(summary.deviceCount).toBe(2)
  })

  it('filters by device when --device specified', () => {
    insertRecord(db, createTestRecord({ id: 'local1', inputTokens: 100, outputTokens: 50, cacheWriteTokens: 0, device: 'macbook', deviceInstanceId: 'uuid1' }))
    insertSyncedRecord(db, {
      id: 'synced1',
      ts: Date.now(),
      tool: 'codex',
      model: 'gpt-4',
      provider: 'openai',
      inputTokens: 200,
      outputTokens: 100,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      thinkingTokens: 0,
      cost: 0.002,
      costSource: 'pricing',
      sessionKey: 'sk1',
      device: 'desktop',
      deviceInstanceId: 'uuid2',
      updatedAt: Date.now(),
    })

    const summary = generateSummary(db, { device: 'uuid2', currentDeviceInstanceId: 'uuid1' })
    // only synced device: 200+100=300
    expect(summary.totalTokens).toBe(300)
    expect(summary.deviceLabel).toBe('desktop')
  })

  it('returns only local data when no synced records exist', () => {
    insertRecord(db, createTestRecord({ id: 'local1', inputTokens: 100, outputTokens: 50, cacheWriteTokens: 0, cost: 0.001 }))

    const summary = generateSummary(db, { currentDeviceInstanceId: 'device-123' })
    expect(summary.totalTokens).toBe(150)
    expect(summary.deviceCount).toBe(1)
  })

  it('filters summary by tool', () => {
    insertRecord(db, createTestRecord({ id: 'r1', tool: 'claude-code', inputTokens: 100, outputTokens: 50, cacheWriteTokens: 0, cost: 0.001 }))
    insertRecord(db, createTestRecord({ id: 'r2', tool: 'opencode', inputTokens: 300, outputTokens: 100, cacheWriteTokens: 0, cost: 0.002 }))

    const summary = generateSummary(db, { tool: 'opencode' })

    expect(summary.totalTokens).toBe(400)
    expect(Object.keys(summary.byTool)).toEqual(['opencode'])
  })

  it('returns local-only data when no currentDeviceInstanceId', () => {
    insertRecord(db, createTestRecord({ id: 'local1', inputTokens: 100, outputTokens: 50, cacheWriteTokens: 0, cost: 0.001 }))
    insertSyncedRecord(db, {
      id: 'synced1',
      ts: Date.now(),
      tool: 'codex',
      model: 'gpt-4',
      provider: 'openai',
      inputTokens: 200,
      outputTokens: 100,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      thinkingTokens: 0,
      cost: 0.002,
      costSource: 'pricing',
      sessionKey: 'sk1',
      device: 'remote-device',
      deviceInstanceId: 'remote-uuid',
      updatedAt: Date.now(),
    })

    // No currentDeviceInstanceId → legacy behavior, local only
    const summary = generateSummary(db)
    expect(summary.totalTokens).toBe(150)
    expect(summary.deviceCount).toBe(1)
  })
})
