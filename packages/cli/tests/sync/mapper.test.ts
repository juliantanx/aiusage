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

  it('uses record.id for Hermes DB-backed records to avoid sync ID collisions', () => {
    const hermes1: StatsRecord = {
      ...testRecord,
      id: 'hermes-record-1',
      tool: 'hermes',
      sourceFile: '/Users/test/.hermes/state.db',
      lineOffset: 0,
      sessionId: 'sess-1',
    }
    const hermes2: StatsRecord = {
      ...testRecord,
      id: 'hermes-record-2',
      tool: 'hermes',
      sourceFile: '/Users/test/.hermes/state.db',
      lineOffset: 0,
      sessionId: 'sess-2',
    }

    const sync1 = mapStatsRecordToSyncRecord(hermes1)
    const sync2 = mapStatsRecordToSyncRecord(hermes2)

    expect(sync1.id).toBe('hermes-record-1')
    expect(sync2.id).toBe('hermes-record-2')
    expect(sync1.id).not.toBe(sync2.id)
  })

  it('uses record.id for OpenCode DB-backed records to avoid sync ID collisions', () => {
    const opencode1: StatsRecord = {
      ...testRecord,
      id: 'opencode-record-1',
      tool: 'opencode',
      sourceFile: '/Users/test/.local/share/opencode/opencode.db',
      lineOffset: 0,
      sessionId: 'sess-1',
    }
    const opencode2: StatsRecord = {
      ...testRecord,
      id: 'opencode-record-2',
      tool: 'opencode',
      sourceFile: '/Users/test/.local/share/opencode/opencode.db',
      lineOffset: 0,
      sessionId: 'sess-2',
    }

    const sync1 = mapStatsRecordToSyncRecord(opencode1)
    const sync2 = mapStatsRecordToSyncRecord(opencode2)

    expect(sync1.id).toBe('opencode-record-1')
    expect(sync2.id).toBe('opencode-record-2')
    expect(sync1.id).not.toBe(sync2.id)
  })

  it.each(['qoder', 'cursor', 'kilocode', 'kelivo', 'goose', 'zed', 'kiro', 'roocode'] as const)(
    'uses record.id for %s imports whose lineOffset is not a byte position',
    (tool) => {
      const first: StatsRecord = {
        ...testRecord,
        id: `${tool}-record-1`,
        tool,
        sourceFile: `/Users/test/${tool}/source.db`,
        lineOffset: 0,
        sessionId: 'sess-1',
      }
      const second: StatsRecord = {
        ...testRecord,
        id: `${tool}-record-2`,
        tool,
        sourceFile: `/Users/test/${tool}/source.db`,
        lineOffset: 0,
        sessionId: 'sess-2',
      }

      const sync1 = mapStatsRecordToSyncRecord(first)
      const sync2 = mapStatsRecordToSyncRecord(second)

      expect(sync1.id).toBe(first.id)
      expect(sync2.id).toBe(second.id)
      expect(sync1.id).not.toBe(sync2.id)
    },
  )
})
