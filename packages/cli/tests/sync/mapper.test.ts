import { describe, it, expect } from 'vitest'
import { mapStatsRecordToSyncRecord } from '../../src/sync/mapper.js'
import type { StatsRecord } from '@aiusage/core'

describe('SyncRecord Mapper', () => {
  const testRecord: StatsRecord = {
    id: 'r1',
    ts: 1776738085346,
    ingestedAt: 1776738085700,
    updatedAt: 1776738085700,
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
  }

  it('maps StatsRecord to SyncRecord', () => {
    const syncRecord = mapStatsRecordToSyncRecord(testRecord)
    expect(syncRecord.id).not.toBe(testRecord.id)
    expect(syncRecord.ts).toBe(testRecord.ts)
    expect(syncRecord.tool).toBe(testRecord.tool)
    expect(syncRecord.model).toBe(testRecord.model)
    expect(syncRecord.provider).toBe(testRecord.provider)
    expect(syncRecord.inputTokens).toBe(testRecord.inputTokens)
    expect(syncRecord.outputTokens).toBe(testRecord.outputTokens)
    expect(syncRecord.cost).toBe(testRecord.cost)
    expect(syncRecord.costSource).toBe(testRecord.costSource)
    expect(syncRecord.sessionKey).toBeDefined()
    expect(syncRecord.sessionKey).toHaveLength(24)
    expect(syncRecord.device).toBe(testRecord.device)
    expect(syncRecord.deviceInstanceId).toBe(testRecord.deviceInstanceId)
  })

  it('generates consistent sessionKey for same device+sessionId', () => {
    const sync1 = mapStatsRecordToSyncRecord(testRecord)
    const sync2 = mapStatsRecordToSyncRecord(testRecord)
    expect(sync1.sessionKey).toBe(sync2.sessionKey)
  })

  it('generates different sessionKey for different devices', () => {
    const record2 = { ...testRecord, device: 'other-device' }
    const sync1 = mapStatsRecordToSyncRecord(testRecord)
    const sync2 = mapStatsRecordToSyncRecord(record2)
    expect(sync1.sessionKey).not.toBe(sync2.sessionKey)
  })

  it('generates consistent SyncRecord.id for same input', () => {
    const sync1 = mapStatsRecordToSyncRecord(testRecord)
    const sync2 = mapStatsRecordToSyncRecord(testRecord)
    expect(sync1.id).toBe(sync2.id)
  })

  it('generates different SyncRecord.id for different deviceInstanceId', () => {
    const record2 = { ...testRecord, deviceInstanceId: 'device-456' }
    const sync1 = mapStatsRecordToSyncRecord(testRecord)
    const sync2 = mapStatsRecordToSyncRecord(record2)
    expect(sync1.id).not.toBe(sync2.id)
  })
})
