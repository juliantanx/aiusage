// POST /api/cli/sync/push on PostgreSQL (PGlite). The request signature and
// the cloud access check are stubbed; everything the route writes runs as SQL.
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('$lib/server/db/pool.js', async () => ({ sql: (await import('../helpers/pglite-sql.js')).sql }))
vi.mock('$lib/server/uploads/verify.js', () => ({
  verifyUploadRequest: async () => ({ valid: true, userId: 'user_1', deviceId: 'device_1', idempotencyKey: `idem_${Math.random()}` }),
}))
vi.mock('$lib/server/cloud/star-check.js', () => ({ checkCloudSyncAccess: async () => ({ allowed: true }) }))

import { migrateTestDatabase, query, truncate } from '../helpers/pglite-sql.js'
import { POST } from '../../src/routes/api/cli/sync/push/+server.js'

function record(id: string, overrides: Record<string, unknown> = {}) {
  return { id, ts: 1_000, tool: 'claude-code', model: 'claude-sonnet-4', inputTokens: 10, outputTokens: 5, cost: 0.01, updatedAt: 100, ...overrides }
}

async function push(records: unknown[], options: { tombstones?: unknown[]; generation?: number } = {}) {
  const request = new Request('http://localhost/api/cli/sync/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      schema_version: 1,
      device_instance_id: 'instance_a',
      sync_generation: options.generation ?? 1,
      records,
      tombstones: options.tombstones ?? [],
    }),
  })
  const response = await POST({ request } as Parameters<typeof POST>[0])
  return { status: response.status, body: await response.json() }
}

async function stored(): Promise<Record<string, number>> {
  const rows = await query<{ record_id: string; updated_at: string }>(`SELECT record_id, updated_at FROM cloud_usage_records ORDER BY record_id`)
  return Object.fromEntries(rows.map(r => [r.record_id, Number(r.updated_at)]))
}

beforeAll(async () => {
  await migrateTestDatabase()
})

beforeEach(async () => {
  await truncate('cloud_usage_records', 'cloud_sync_batches', 'cloud_device_instances', 'cloud_sync_resets', 'cloud_sync_state', 'user_devices', 'users')
  await query(`INSERT INTO users (id, username, email, display_name) VALUES ('user_1', 'u1', 'u1@example.com', 'U1')`)
  await query(`INSERT INTO user_devices (id, user_id, name, secret_encrypted, secret_hash) VALUES ('device_1', 'user_1', 'laptop', 'x', 'x')`)
})

describe('POST /api/cli/sync/push (PostgreSQL)', () => {
  it('stores a fully valid batch and rejects nothing', async () => {
    const { status, body } = await push([record('r1'), record('r2')])

    expect(status).toBe(200)
    expect(body).toMatchObject({ status: 'accepted', inserted: 2, updated: 0, skipped: 0, rejected: [] })
    expect(await stored()).toEqual({ r1: 100, r2: 100 })
  })

  it('stores the valid records of a partly invalid batch and names the ones it did not store', async () => {
    const { status, body } = await push([
      record('ok-1'),
      record('no-model', { model: '' }),
      record('', {}),
      record('no-tool', { tool: undefined }),
      record('ok-2'),
    ])

    expect(status).toBe(200)
    expect(body).toMatchObject({ status: 'accepted', inserted: 2, skipped: 3 })
    expect(body.rejected).toEqual([
      { id: 'no-model', reason: 'missing_field' },
      { id: '', reason: 'missing_field' },
      { id: 'no-tool', reason: 'missing_field' },
    ])
    expect(await stored()).toEqual({ 'ok-1': 100, 'ok-2': 100 })
  })

  it.each([
    ['a NUL character in a text field', { cwd: 'C:\\work\u0000' }],
    ['a fractional token count', { inputTokens: 1.5 }],
    ['a negative timestamp', { ts: -1 }],
    ['a token count past the safe integer range', { outputTokens: 2 ** 60 }],
    ['a numeric string for a number', { ts: '1000' }],
    ['a cost too large for NUMERIC(20, 8)', { cost: 1e13 }],
    ['a non-finite cost', { cost: 'NaN' }],
    ['a number for a text field', { sessionKey: 42 }],
  ])('rejects a record with %s instead of failing the batch with it', async (_label, overrides) => {
    const { status, body } = await push([record('good'), record('bad', overrides)])

    expect(status).toBe(200)
    expect(body.rejected).toEqual([{ id: 'bad', reason: 'invalid_value' }])
    expect(await stored()).toEqual({ good: 100 })
  })

  it('accepts a batch in which every record is rejected, storing nothing', async () => {
    const { status, body } = await push([record('a', { model: '' }), record('b', { ts: 0.5 })])

    expect(status).toBe(200)
    expect(body).toMatchObject({ status: 'accepted', inserted: 0, updated: 0, skipped: 2 })
    expect(body.rejected.map((r: { id: string }) => r.id)).toEqual(['a', 'b'])
    expect(await stored()).toEqual({})
  })

  it('reconciles an outdated or repeated record: skipped, not rejected', async () => {
    await push([record('r1', { updatedAt: 200 })])

    const { body } = await push([record('r1', { updatedAt: 100 }), record('r1', { updatedAt: 200 })])

    expect(body).toMatchObject({ inserted: 0, updated: 0, skipped: 2, rejected: [] })
    expect(await stored()).toEqual({ r1: 200 })
  })

  it('applies a newer version', async () => {
    await push([record('r1', { updatedAt: 100 })])
    const { body } = await push([record('r1', { updatedAt: 300, outputTokens: 7 })])

    expect(body).toMatchObject({ inserted: 0, updated: 1, skipped: 0, rejected: [] })
    expect(await stored()).toEqual({ r1: 300 })
  })

  async function deleted(): Promise<string[]> {
    const rows = await query<{ record_id: string }>(`SELECT record_id FROM cloud_usage_records WHERE deleted_at IS NOT NULL ORDER BY record_id`)
    return rows.map(r => r.record_id)
  }

  it('applies a fully valid tombstone batch and rejects none of it', async () => {
    await push([record('r1'), record('r2')])

    const { status, body } = await push([], { tombstones: [{ record_id: 'r1', updatedAt: 500 }, { record_id: 'r2', updatedAt: 500 }] })

    expect(status).toBe(200)
    expect(body).toMatchObject({ status: 'accepted', skipped: 0, rejected_tombstones: [] })
    expect(await deleted()).toEqual(['r1', 'r2'])
  })

  it('applies the valid tombstones of a partly invalid batch and names the ones it did not apply', async () => {
    await push([record('r1')])

    const { status, body } = await push([record('r2')], { tombstones: [
      { record_id: 'r1\u0000' }, { record_id: 42 }, { record_id: '' }, { record_id: 'r2', updatedAt: -1 }, null,
      { record_id: 'r1', updatedAt: 500 },
    ] })

    expect(status).toBe(200)
    expect(body).toMatchObject({ inserted: 1, skipped: 5, rejected: [] })
    expect(body.rejected_tombstones).toEqual([
      { record_id: 'r1\u0000', reason: 'invalid_value' },
      { record_id: null, reason: 'invalid_value' },
      { record_id: '', reason: 'missing_field' },
      { record_id: 'r2', reason: 'invalid_value' },
      { record_id: null, reason: 'invalid_value' },
    ])
    expect(await deleted()).toEqual(['r1'])
  })

  it('accepts a batch of only invalid tombstones, applies none and names them all', async () => {
    await push([record('r1')])

    const { status, body } = await push([], { tombstones: [{ record_id: 'r1', updatedAt: 1.5 }, { record_id: 'r1\u0000' }] })

    expect(status).toBe(200)
    expect(body).toMatchObject({ status: 'accepted', skipped: 2 })
    expect(body.rejected_tombstones).toEqual([
      { record_id: 'r1', reason: 'invalid_value' },
      { record_id: 'r1\u0000', reason: 'invalid_value' },
    ])
    expect(await deleted()).toEqual([])
  })

  it('refuses a push under a generation older than the server\'s, storing nothing', async () => {
    await query(`INSERT INTO cloud_sync_resets (user_id, sync_generation) VALUES ('user_1', 2)`)

    const { status, body } = await push([record('r1')], { generation: 1 })

    expect(status).toBe(409)
    expect(body).toMatchObject({ error_code: 'sync_generation_stale', server_generation: 2 })
    expect(await stored()).toEqual({})
  })
})
