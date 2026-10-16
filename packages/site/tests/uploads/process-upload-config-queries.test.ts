import { beforeEach, describe, expect, it, vi } from 'vitest'
import { queries, resetFakeSql, respondWith, type RecordedQuery } from '../mocks/sql.js'

vi.mock('../../src/lib/server/db/pool.js', async () => ({ sql: (await import('../mocks/sql.js')).fakeSql }))

import { processUpload, type UploadRequest, type UploadSnapshot } from '../../src/lib/server/uploads/verify.js'
import { invalidateConfigCache } from '../../src/lib/server/config.js'

const isConfigRead = (q: RecordedQuery) => q.text.startsWith('SELECT value FROM site_config')

function snapshot(day: number): UploadSnapshot {
  const date = `2026-06-0${day}`
  return {
    period_type: 'daily',
    period_start: `${date}T00:00:00.000Z`,
    period_end: `${date}T23:59:59.999Z`,
    total_tokens: 100, input_tokens: 100, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, thinking_tokens: 0,
    token_snapshot_hash: `sha256:${day}`,
    breakdowns: [
      { scope_type: 'all', tool: null, model: null, total_tokens: 100, input_tokens: 100, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, thinking_tokens: 0 },
    ],
  }
}

function fiveSnapshotUpload(): UploadRequest {
  return { schema_version: 1, client_version: '1.5.21', client_platform: 'linux', snapshots: [1, 2, 3, 4, 5].map(snapshot) }
}

// site_config is empty, as it is until an admin saves the settings form.
function emptyConfigDatabase(overrides: Record<string, number> = {}) {
  respondWith((q) => {
    if (isConfigRead(q)) {
      const key = q.values[0] as string
      return key in overrides ? [{ value: overrides[key] }] : []
    }
    if (q.text.startsWith('SELECT ( COALESCE(BOOL_AND(visibility')) return [{ hidden: false }]
    if (q.text.startsWith('SELECT COUNT(*) as cnt')) return [{ cnt: 0 }]
    if (q.text.startsWith('SELECT COALESCE(AVG(total_tokens), 0) as avg_tokens')) return [{ avg_tokens: 0 }]
    return undefined
  })
}

beforeEach(() => {
  resetFakeSql()
  invalidateConfigCache()
})

describe('processUpload config lookups', () => {
  it('reads each setting once for a five-snapshot upload when site_config has no rows', async () => {
    emptyConfigDatabase()

    const result = await processUpload('user_1', 'device_1', 'key_1', fiveSnapshotUpload(), '127.0.0.1')

    expect(result.status).toBe('accepted')
    expect(result.snapshots).toHaveLength(5)
    const keys = queries.filter(isConfigRead).map(q => q.values[0])
    // Two rate-limit settings and eleven risk settings.
    expect(keys).toHaveLength(13)
    expect(new Set(keys).size).toBe(13)
  })

  it('makes no config query for the next upload within the cache TTL', async () => {
    emptyConfigDatabase()
    await processUpload('user_1', 'device_1', 'key_1', fiveSnapshotUpload(), '127.0.0.1')
    queries.length = 0

    const result = await processUpload('user_1', 'device_1', 'key_2', fiveSnapshotUpload(), '127.0.0.1')

    expect(result.status).toBe('accepted')
    expect(queries.filter(isConfigRead)).toHaveLength(0)
  })

  it('reads the risk settings before the upload transaction takes the leaderboard lock', async () => {
    emptyConfigDatabase()

    await processUpload('user_1', 'device_1', 'key_1', fiveSnapshotUpload(), '127.0.0.1')

    const lock = queries.findIndex(q => q.text.startsWith('SELECT pg_advisory_xact_lock('))
    expect(lock).toBeGreaterThan(-1)
    expect(queries.slice(lock).filter(isConfigRead)).toHaveLength(0)
  })

  it('still applies the stored risk settings to every snapshot', async () => {
    // Repeat rule: flag from the first upload of a period on.
    emptyConfigDatabase({ 'risk.repeat_count': 0 })

    const result = await processUpload('user_1', 'device_1', 'key_1', fiveSnapshotUpload(), '127.0.0.1')

    expect(result.status).toBe('flagged')
    expect(result.snapshots.map(s => s.reason_code)).toEqual(Array(5).fill('repeat_upload'))
  })

  it('skips a rule that is switched off in site_config', async () => {
    emptyConfigDatabase({ 'risk.repeat_count': 0, 'risk.rule_repeat': 0 })

    const result = await processUpload('user_1', 'device_1', 'key_1', fiveSnapshotUpload(), '127.0.0.1')

    expect(result.status).toBe('accepted')
    expect(queries.filter(q => q.text.includes('FROM upload_snapshots WHERE device_id'))).toHaveLength(0)
  })
})
