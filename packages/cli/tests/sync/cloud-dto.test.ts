import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { generateRecordId } from '@aiusage/core'
import type { StatsRecord, SyncRecord } from '@aiusage/core'
import Database from 'better-sqlite3'
import { initializeDatabase } from '../../src/db/index.js'
import { insertRecord } from '../../src/db/records.js'
import { CloudSyncOrchestrator } from '../../src/sync/cloud-orchestrator.js'

vi.mock('../../src/leaderboard/credentials.js', () => ({
  loadCredentials: () => ({ device_id: 'dev-1', device_secret: 'secret' }),
}))
vi.mock('../../src/site-url.js', () => ({ getSiteUrl: () => 'https://sync.test' }))

import { fromCloudRecord, parseSyncGeneration, toCloudRecord } from '../../src/sync/cloud-dto.js'
import { cloudPull, cloudPush, CloudSyncError } from '../../src/sync/cloud.js'

// The core `SyncRecord` calls the device alias `device`; the cloud API calls
// it `deviceName` on both push and pull, and hands integers back as strings
// (Postgres bigints). The DTO layer is the only place that knows.

const record: SyncRecord = {
  id: 'w1',
  ts: 1_757_160_000_000,
  tool: 'claude-code',
  model: 'claude-sonnet-4-6',
  provider: 'anthropic',
  inputTokens: 120,
  outputTokens: 30,
  cacheReadTokens: 5,
  cacheWriteTokens: 0,
  thinkingTokens: 0,
  cost: 0.00123,
  costSource: 'pricing',
  sessionKey: 'k1',
  device: 'MSI',
  deviceInstanceId: 'device-x',
  platform: 'win32',
  updatedAt: 1_757_160_000_001,
  sourceFile: 'C:\\s.jsonl',
  cwd: 'C:\\proj',
}

/** A record exactly as `/api/cli/sync/pull` serialises it. */
const serverRecord = {
  id: 'w1',
  ts: '1757160000000',
  tool: 'claude-code',
  model: 'claude-sonnet-4-6',
  provider: 'anthropic',
  inputTokens: '120',
  outputTokens: '30',
  cacheReadTokens: '5',
  cacheWriteTokens: '0',
  thinkingTokens: '0',
  cost: '0.00123',
  costSource: 'pricing',
  sessionKey: 'k1',
  sourceFile: 'C:\\s.jsonl',
  cwd: 'C:\\proj',
  deviceInstanceId: 'device-x',
  deviceName: 'MSI',
  platform: 'win32',
  updatedAt: '1757160000001',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('cloud DTO', () => {
  it('serialises the device alias as deviceName and nothing else changes', () => {
    const wire = toCloudRecord(record)
    expect(wire).not.toHaveProperty('device')
    expect(wire.deviceName).toBe('MSI')
    const { device, ...rest } = record
    expect(wire).toEqual({ ...rest, deviceName: device })
  })

  it('parses the server shape back into a SyncRecord, numbers included', () => {
    expect(fromCloudRecord(serverRecord)).toEqual(record)
  })

  it('accepts the legacy device alias and nullable optional metadata', () => {
    const { deviceName, ...rest } = serverRecord
    expect(fromCloudRecord({ ...rest, device: 'OLD' })?.device).toBe('OLD')
    const parsed = fromCloudRecord({ ...serverRecord, platform: null, sourceFile: null, cwd: null })
    expect(parsed).toMatchObject({ id: record.id, inputTokens: record.inputTokens })
    expect(parsed).not.toHaveProperty('platform')
    expect(parsed).not.toHaveProperty('sourceFile')
    expect(parsed).not.toHaveProperty('cwd')
  })

  // `null` is how the server serialises a nullable column; for every other
  // column it is as malformed as a missing key or a wrong type.
  const nullableColumns = ['deviceName', 'cost', 'costSource']

  it.each(Object.keys(serverRecord).filter(key => !['platform', 'sourceFile', 'cwd'].includes(key)))(
    'rejects missing, null or wrongly typed required field %s', key => {
      for (const value of nullableColumns.includes(key) ? [undefined, {}] : [undefined, null, {}]) {
        expect(fromCloudRecord({ ...serverRecord, [key]: value })).toBeNull()
      }
    },
  )

  it('parses a record pushed by a client up to 1.5.17, whose device_name the server stored as NULL', () => {
    // Those clients sent `device`, which the server does not read, so every
    // record they pushed comes back with `deviceName: null`.
    expect(fromCloudRecord({ ...serverRecord, deviceName: null })).toEqual({ ...record, device: '' })
  })

  it('takes the local defaults for the other nullable server columns', () => {
    expect(fromCloudRecord({ ...serverRecord, cost: null, costSource: null })).toEqual({ ...record, cost: 0, costSource: 'unknown' })
  })

  it('reads the generation as a number or as the decimal string a bigint column yields', () => {
    expect(parseSyncGeneration(1)).toBe(1)
    expect(parseSyncGeneration('2')).toBe(2)
    for (const value of [undefined, null, 0, '0', -1, '-1', 1.5, '1.5', '', ' 2', '2e3', 'abc', '9007199254740993', {}, true]) {
      expect(parseSyncGeneration(value)).toBeUndefined()
    }
  })

  it('rejects invalid numbers and cost sources without replacing them with defaults', () => {
    for (const inputTokens of ['', 'NaN', Infinity, false]) {
      expect(fromCloudRecord({ ...serverRecord, inputTokens })).toBeNull()
    }
    expect(fromCloudRecord({ ...serverRecord, costSource: 'other' })).toBeNull()
    expect(fromCloudRecord({ ...serverRecord, inputTokens: 0, cost: 0, provider: '', sessionKey: '', deviceName: '' }))
      .toMatchObject({ inputTokens: 0, cost: 0, provider: '', sessionKey: '', device: '' })
  })

  it('rejects records without the fields a SyncRecord must have', () => {
    expect(fromCloudRecord(null)).toBeNull()
    expect(fromCloudRecord({ ...serverRecord, id: undefined })).toBeNull()
    expect(fromCloudRecord({ ...serverRecord, deviceInstanceId: '' })).toBeNull()
    expect(fromCloudRecord({ ...serverRecord, ts: 'yesterday' })).toBeNull()
    expect(fromCloudRecord({ ...serverRecord, updatedAt: undefined })).toBeNull()
  })
})

describe('cloud API boundary', () => {
  const fetchMock = vi.fn()
  const envelope = { records: [serverRecord], tombstones: [], sync_generation: 2, has_more: false, next_cursor: null }

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('push sends deviceName, not device', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'accepted', inserted: 1, updated: 0, skipped: 0, sync_generation: 3, server_cursor: '9' }))
    const result = await cloudPush([record], [{ record_id: 'old', updatedAt: 1 }], 'device-x', 3)
    expect(result).toEqual({ inserted: 1, updated: 0, skipped: 0, serverCursor: '9', syncGeneration: 3 })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://sync.test/api/cli/sync/push')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.device_instance_id).toBe('device-x')
    expect(body.sync_generation).toBe(3)
    expect(body.records).toHaveLength(1)
    expect(body.records[0].deviceName).toBe('MSI')
    expect(body.records[0]).not.toHaveProperty('device')
    expect(body.records[0].deviceInstanceId).toBe('device-x')
    expect(body.tombstones).toEqual([{ record_id: 'old', updatedAt: 1 }])
  })

  it('pull normalises deviceName and bigint strings into SyncRecords', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      records: [serverRecord],
      tombstones: [{ id: 't1', device_instance_id: 'device-y', deleted_at: '2026-09-16T00:00:00Z', updated_at: '5' }],
      sync_generation: 2,
      next_cursor: null,
      has_more: false,
    }))
    const result = await cloudPull()
    expect(result.records).toEqual([record])
    expect(result.tombstones).toEqual([{ id: 't1', device_instance_id: 'device-y', deleted_at: '2026-09-16T00:00:00Z', updated_at: '5' }])
    expect(result).toMatchObject({ syncGeneration: 2, hasMore: false, nextCursor: undefined })
  })

  it('pull fails rather than silently dropping a record it cannot represent', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ records: [serverRecord, { id: 'broken' }], tombstones: [], sync_generation: 2, has_more: false }))
    const promise = cloudPull()
    await expect(promise).rejects.toBeInstanceOf(CloudSyncError)
    await promise.catch((e: CloudSyncError) => expect(e.code).toBe('invalid_response'))
  })

  it.each([
    null, [], {},
    { ...envelope, records: undefined }, { ...envelope, records: {} },
    { ...envelope, tombstones: undefined }, { ...envelope, tombstones: {} },
    { ...envelope, tombstones: [null] }, { ...envelope, tombstones: [{ id: 'w1' }] },
    { ...envelope, has_more: undefined }, { ...envelope, has_more: 'false' },
    { ...envelope, sync_generation: undefined }, { ...envelope, sync_generation: 0 },
    { ...envelope, sync_generation: 1.5 }, { ...envelope, sync_generation: '0' },
    { ...envelope, sync_generation: '1.5' }, { ...envelope, sync_generation: 'two' },
    { ...envelope, next_cursor: 5 }, { ...envelope, next_cursor: 'invalid' },
    { ...envelope, has_more: true }, { ...envelope, has_more: true, next_cursor: '' },
    { ...envelope, has_more: true, next_cursor: '0' },
  ])('rejects a malformed pull envelope %#', async body => {
    fetchMock.mockResolvedValueOnce(jsonResponse(body))
    await expect(cloudPull()).rejects.toMatchObject({ code: 'invalid_response' })
  })

  it('pulls and pushes under a generation the server serialises as a string', async () => {
    // `cloud_sync_resets.sync_generation` is a bigint: once the user has
    // cleared their cloud data the server answers "2", not 2, while
    // `/sync/push` only accepts a number.
    const db = new Database(':memory:')
    initializeDatabase(db)
    try {
      const local: StatsRecord = {
        id: generateRecordId('me', 'msg_1', 0), ts: 1000, ingestedAt: 1000, updatedAt: 1000, lineOffset: 64,
        tool: 'claude-code', model: 'm', provider: 'anthropic', inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0,
        thinkingTokens: 0, cost: 0, costSource: 'pricing', sessionId: 's', sourceFile: 'C:\s.jsonl', device: 'D', deviceInstanceId: 'me',
      }
      insertRecord(db, local)
      fetchMock.mockResolvedValueOnce(jsonResponse({ ...envelope, records: [{ ...serverRecord, deviceName: null }], sync_generation: '2' }))
        .mockResolvedValueOnce(jsonResponse({ status: 'accepted', inserted: 1, updated: 0, skipped: 0, sync_generation: '2', server_cursor: '9' }))
      const result = await new CloudSyncOrchestrator(db, { deviceInstanceId: 'me' }).sync()
      expect(result).toMatchObject({ status: 'ok', syncGeneration: 2, pulledCount: 1, uploadedCount: 1 })
      expect(fetchMock).toHaveBeenCalledTimes(2)
      const pushed = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string)
      expect(pushed.sync_generation).toBe(2)
      expect(db.prepare(`SELECT device FROM synced_records WHERE id = 'w1'`).get()).toEqual({ device: '' })
    } finally {
      db.close()
    }
  })

  it.each(['envelope', 'record', 'tombstone', 'repeated cursor', 'backward cursor'])(
    'preserves rows, values and claims when a later page has a malformed %s', async failure => {
      const db = new Database(':memory:')
      initializeDatabase(db)
      const orchestrator = new CloudSyncOrchestrator(db, { deviceInstanceId: 'me', knownTargets: ['cloud'] })
      try {
        fetchMock.mockResolvedValueOnce(jsonResponse(envelope))
        expect((await orchestrator.sync()).status).toBe('ok')
        const tables = ['synced_records', 'records', 'sync_record_claims', 'sync_namespace_verdicts']
        const before = tables.map(table => db.prepare(`SELECT * FROM ${table}`).all())
        const newer = { ...serverRecord, updatedAt: Number(serverRecord.updatedAt) + 1, inputTokens: '999' }
        const bad = failure === 'envelope' ? { ...envelope, records: undefined }
          : failure === 'record' ? { ...envelope, records: [{ ...newer, inputTokens: undefined }] }
          : failure === 'tombstone' ? { ...envelope, tombstones: [{ id: 'w1' }] }
          : { ...envelope, has_more: true, next_cursor: failure === 'repeated cursor' ? '9007199254740993' : '9007199254740992' }
        fetchMock.mockResolvedValueOnce(jsonResponse({ ...envelope, records: [newer], has_more: true, next_cursor: '9007199254740993' }))
          .mockResolvedValueOnce(jsonResponse(bad))
        expect((await orchestrator.sync()).status).toBe('failed')
        expect(tables.map(table => db.prepare(`SELECT * FROM ${table}`).all())).toEqual(before)
        expect(fetchMock).toHaveBeenCalledTimes(3)
      } finally {
        db.close()
      }
    },
  )

  it('allows a generation restart with a lower cursor', async () => {
    const db = new Database(':memory:')
    initializeDatabase(db)
    try {
      fetchMock.mockResolvedValueOnce(jsonResponse({ ...envelope, has_more: true, next_cursor: '100' }))
        .mockResolvedValueOnce(jsonResponse({ ...envelope, sync_generation: 3, has_more: true, next_cursor: '1' }))
        .mockResolvedValueOnce(jsonResponse({ ...envelope, sync_generation: 3, has_more: true, next_cursor: '1' }))
        .mockResolvedValueOnce(jsonResponse({ ...envelope, sync_generation: 3 }))
      expect(await new CloudSyncOrchestrator(db, { deviceInstanceId: 'me' }).sync()).toMatchObject({ status: 'ok', syncGeneration: 3 })
      expect(fetchMock.mock.calls.map(([url]) => new URL(url).searchParams.get('cursor'))).toEqual([null, '100', null, '1'])
    } finally {
      db.close()
    }
  })
})
