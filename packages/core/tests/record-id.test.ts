import { describe, it, expect } from 'vitest'
import { generateRecordId, generateSyncRecordId, generateToolCallId, generateOrphanToolCallId, generateSessionKey } from '../src/record-id.js'

describe('generateRecordId', () => {
  it('produces different ids for inputs that would collide without field separators', () => {
    // Without separators: 'abc'+'def10'+0 → 'abcdef100'
    //                     'abcdef10'+''+0 → 'abcdef100'  ← same hash input, collision!
    const id1 = generateRecordId('abc', 'def10', 0)
    const id2 = generateRecordId('abcdef10', '', 0)
    expect(id1).not.toBe(id2)
  })

  it('generates consistent id for same input', () => {
    const id1 = generateRecordId('device-123', '/path/to/file.jsonl', 12345)
    const id2 = generateRecordId('device-123', '/path/to/file.jsonl', 12345)
    expect(id1).toBe(id2)
  })

  it('generates different id for different device instances', () => {
    const id1 = generateRecordId('device-123', '/path/to/file.jsonl', 12345)
    const id2 = generateRecordId('device-456', '/path/to/file.jsonl', 12345)
    expect(id1).not.toBe(id2)
  })

  it('generates different id for different file paths', () => {
    const id1 = generateRecordId('device-123', '/path/to/file1.jsonl', 12345)
    const id2 = generateRecordId('device-123', '/path/to/file2.jsonl', 12345)
    expect(id1).not.toBe(id2)
  })

  it('generates different id for different offsets', () => {
    const id1 = generateRecordId('device-123', '/path/to/file.jsonl', 12345)
    const id2 = generateRecordId('device-123', '/path/to/file.jsonl', 67890)
    expect(id1).not.toBe(id2)
  })

  it('returns 16 hex characters', () => {
    const id = generateRecordId('device-123', '/path/to/file.jsonl', 12345)
    expect(id).toHaveLength(16)
    expect(id).toMatch(/^[0-9a-f]{16}$/)
  })
})

describe('generateSyncRecordId', () => {
  it('is now identical to generateRecordId', () => {
    const recordId = generateRecordId('device-123', '/path/to/file.jsonl', 12345)
    const syncId = generateSyncRecordId('device-123', '/path/to/file.jsonl', 12345)
    expect(recordId).toBe(syncId)
  })

  it('generates different id for different device instances', () => {
    const id1 = generateSyncRecordId('device-123', '/path/to/file.jsonl', 12345)
    const id2 = generateSyncRecordId('device-456', '/path/to/file.jsonl', 12345)
    expect(id1).not.toBe(id2)
  })

  it('returns 16 hex characters', () => {
    const id = generateSyncRecordId('device-123', '/path/to/file.jsonl', 12345)
    expect(id).toHaveLength(16)
    expect(id).toMatch(/^[0-9a-f]{16}$/)
  })
})

describe('generateToolCallId', () => {
  it('generates consistent id for same input', () => {
    const id1 = generateToolCallId('record-123', 'Read', 1234567890, 0)
    const id2 = generateToolCallId('record-123', 'Read', 1234567890, 0)
    expect(id1).toBe(id2)
  })

  it('generates different id for different records', () => {
    const id1 = generateToolCallId('record-123', 'Read', 1234567890, 0)
    const id2 = generateToolCallId('record-456', 'Read', 1234567890, 0)
    expect(id1).not.toBe(id2)
  })

  it('generates different id for different tool names', () => {
    const id1 = generateToolCallId('record-123', 'Read', 1234567890, 0)
    const id2 = generateToolCallId('record-123', 'Bash', 1234567890, 0)
    expect(id1).not.toBe(id2)
  })

  it('returns 16 hex characters', () => {
    const id = generateToolCallId('record-123', 'Read', 1234567890, 0)
    expect(id).toHaveLength(16)
    expect(id).toMatch(/^[0-9a-f]{16}$/)
  })
})

describe('generateOrphanToolCallId', () => {
  it('generates consistent id for same input', () => {
    const id1 = generateOrphanToolCallId('codex', 'Read', 1234567890, 0)
    const id2 = generateOrphanToolCallId('codex', 'Read', 1234567890, 0)
    expect(id1).toBe(id2)
  })

  it('returns 16 hex characters', () => {
    const id = generateOrphanToolCallId('codex', 'Read', 1234567890, 0)
    expect(id).toHaveLength(16)
    expect(id).toMatch(/^[0-9a-f]{16}$/)
  })
})

describe('generateSessionKey', () => {
  it('generates consistent key for same input', () => {
    const key1 = generateSessionKey('device-123', 'session-abc')
    const key2 = generateSessionKey('device-123', 'session-abc')
    expect(key1).toBe(key2)
  })

  it('generates different key for different devices', () => {
    const key1 = generateSessionKey('device-123', 'session-abc')
    const key2 = generateSessionKey('device-456', 'session-abc')
    expect(key1).not.toBe(key2)
  })

  it('returns 24 hex characters', () => {
    const key = generateSessionKey('device-123', 'session-abc')
    expect(key).toHaveLength(24)
    expect(key).toMatch(/^[0-9a-f]{24}$/)
  })
})
