// Snapshot moderation against a real PostgreSQL database (PGlite): uploads go
// through processUpload and the admin actions through admin/operations.ts, so
// the visibility rules are exercised with PostgreSQL's own semantics (NULL
// handling, enum comparisons, the upsert, foreign key actions).
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/lib/server/db/pool.js', async () => ({ sql: (await import('../helpers/pglite-sql.js')).sql }))

import { migrateTestDatabase, query, truncate } from '../helpers/pglite-sql.js'
import { processUpload, type UploadBreakdown, type UploadRequest } from '../../src/lib/server/uploads/verify.js'
import { invalidateConfigCache } from '../../src/lib/server/config.js'
import {
  approveSnapshot,
  hideLeaderboardEntry,
  hideSnapshot,
  rejectSnapshot,
  restoreLeaderboardEntry,
} from '../../src/lib/server/admin/operations.js'
import { pruneUploadHistory } from '../../src/lib/server/db/cleanup.js'

const USER = 'user_1'
const DEVICE = 'device_1'
const ADMIN = 'admin_1'
const PERIOD_START = '2026-06-01T00:00:00.000Z'

// Every upload reports the same model, which has no price. The unknown-model
// rule decides whether an upload is flagged; it is switched on for a flagged
// upload and off for an accepted one (the other rules are always off), so the
// uploads of a test write the same rows.
const FLAGGED = 'flagged'
const ACCEPTED = 'accepted'
const MODEL = 'unpriced-model'

let uploadCount = 0

function breakdown(scope_type: UploadBreakdown['scope_type'], tool: string | null, model: string | null, tokens = 100): UploadBreakdown {
  return { scope_type, tool, model, total_tokens: tokens, input_tokens: tokens, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, thinking_tokens: 0 }
}

/** Uploads the period with one tool_model row per tool. */
async function upload(outcome: typeof FLAGGED | typeof ACCEPTED, tools: string[] = ['claude-code']): Promise<{ snapshotId: string; status: string }> {
  uploadCount++
  await query(
    `INSERT INTO site_config (key, value) VALUES ('risk.rule_unknown_model', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [outcome === FLAGGED ? '1' : '0'])
  invalidateConfigCache()
  const request: UploadRequest = {
    schema_version: 1,
    client_version: '1.5.22',
    client_platform: 'linux',
    snapshots: [{
      period_type: 'daily',
      period_start: PERIOD_START,
      period_end: '2026-06-01T23:59:59.999Z',
      total_tokens: 100 * tools.length, input_tokens: 100 * tools.length, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, thinking_tokens: 0,
      token_snapshot_hash: `sha256:${uploadCount}`,
      breakdowns: [
        breakdown('all', null, null, 100 * tools.length),
        ...tools.map(tool => breakdown('tool_model', tool, MODEL)),
      ],
    }],
  }
  const result = await processUpload(USER, DEVICE, `key_${uploadCount}`, request, '127.0.0.1')
  expect(result.status).toBe(outcome)
  const rows = await query<{ id: string }>(
    `SELECT s.id FROM upload_snapshots s JOIN upload_requests r ON r.id = s.upload_request_id
     WHERE r.idempotency_key = $1`, [`key_${uploadCount}`])
  return { snapshotId: rows[0].id, status: result.status }
}

/** visibility of each row of the period, keyed by scope:tool. */
async function visibilities(): Promise<Record<string, string>> {
  const rows = await query<{ scope_type: string; tool: string | null; visibility: string }>(
    `SELECT scope_type, tool, visibility FROM leaderboard_metrics WHERE user_id = $1 ORDER BY scope_type, tool`, [USER])
  return Object.fromEntries(rows.map(r => [`${r.scope_type}:${r.tool ?? ''}`, r.visibility]))
}

async function metricId(tool: string): Promise<string> {
  const rows = await query<{ id: string }>(`SELECT id FROM leaderboard_metrics WHERE user_id = $1 AND scope_type = 'tool_model' AND tool = $2`, [USER, tool])
  return rows[0].id
}

async function age(snapshotId: string, days: number): Promise<void> {
  await query(
    `UPDATE upload_requests SET created_at = NOW() - make_interval(days => $2::int)
     WHERE id = (SELECT upload_request_id FROM upload_snapshots WHERE id = $1)`, [snapshotId, days])
}

beforeAll(async () => {
  await migrateTestDatabase()
})

beforeEach(async () => {
  await truncate('leaderboard_metrics', 'upload_snapshots', 'upload_requests', 'admin_audit_logs', 'user_devices', 'users', 'site_config')
  await query(`INSERT INTO users (id, username, email, display_name, role) VALUES ($1, 'u1', 'u1@example.com', 'User 1', 'user'), ($2, 'admin', 'admin@example.com', 'Admin', 'admin')`, [USER, ADMIN])
  await query(`INSERT INTO user_devices (id, user_id, name, secret_encrypted, secret_hash) VALUES ($1, $2, 'laptop', 'x', 'x')`, [DEVICE, USER])
  await query(`INSERT INTO site_config (key, value) VALUES ('risk.rule_repeat', '0'), ('risk.rule_token_spike', '0'), ('risk.rule_inconsistency', '0')`)
  invalidateConfigCache()
})

describe('snapshot moderation (PostgreSQL)', () => {
  it('flags a flagged upload and publishes an accepted one (fixture sanity check)', async () => {
    const a = await upload(FLAGGED)
    expect(a.status).toBe('flagged')
    expect(await visibilities()).toEqual({ 'all:': 'flagged', 'tool_model:claude-code': 'flagged' })

    const b = await upload(ACCEPTED)
    expect(b.status).toBe('accepted')
    expect(await visibilities()).toEqual({ 'all:': 'public', 'tool_model:claude-code': 'public' })
  })

  it('does not publish rows of an accepted snapshot that an admin hid when an older flagged snapshot is approved', async () => {
    const a = await upload(FLAGGED)
    const b = await upload(ACCEPTED)

    await hideSnapshot(ADMIN, b.snapshotId)
    expect(Object.values(await visibilities())).toEqual(['hidden', 'hidden'])

    const result = await approveSnapshot(ADMIN, a.snapshotId)

    expect(Object.values(await visibilities())).toEqual(['hidden', 'hidden'])
    expect(result).toEqual({ metricsUpdated: 0, metricsHeld: 2 })
  })

  it.each([
    ['hideSnapshot', hideSnapshot],
    ['rejectSnapshot', rejectSnapshot],
  ] as const)('keeps a period hidden by %s of another snapshot when a later flagged snapshot is approved', async (_name, action) => {
    const a = await upload(ACCEPTED)
    await action(ADMIN, a.snapshotId)
    const c = await upload(FLAGGED)
    expect(Object.values(await visibilities())).toEqual(['hidden', 'hidden'])

    const result = await approveSnapshot(ADMIN, c.snapshotId)

    expect(Object.values(await visibilities())).toEqual(['hidden', 'hidden'])
    expect(result.metricsHeld).toBe(2)
  })

  it('restores a hidden snapshot when that same snapshot is approved', async () => {
    const a = await upload(FLAGGED)
    const b = await upload(ACCEPTED)
    await hideSnapshot(ADMIN, b.snapshotId)
    await approveSnapshot(ADMIN, a.snapshotId)

    const result = await approveSnapshot(ADMIN, b.snapshotId)

    expect(Object.values(await visibilities())).toEqual(['public', 'public'])
    expect(result).toEqual({ metricsUpdated: 2, metricsHeld: 0 })
  })

  it('restores a rejected flagged snapshot when it is approved after all', async () => {
    const a = await upload(FLAGGED)
    await rejectSnapshot(ADMIN, a.snapshotId)
    expect(Object.values(await visibilities())).toEqual(['hidden', 'hidden'])

    await approveSnapshot(ADMIN, a.snapshotId)

    expect(Object.values(await visibilities())).toEqual(['public', 'public'])
  })

  it('needs every hide of the period lifted before an approval publishes it', async () => {
    const a = await upload(ACCEPTED)
    const b = await upload(ACCEPTED)
    await hideSnapshot(ADMIN, a.snapshotId)
    await rejectSnapshot(ADMIN, b.snapshotId)

    expect((await approveSnapshot(ADMIN, a.snapshotId)).metricsHeld).toBe(2)
    expect(Object.values(await visibilities())).toEqual(['hidden', 'hidden'])

    expect((await approveSnapshot(ADMIN, b.snapshotId)).metricsHeld).toBe(0)
    expect(Object.values(await visibilities())).toEqual(['public', 'public'])
  })

  it('still publishes an approved flagged snapshot when an accepted upload of the period was never moderated', async () => {
    const a = await upload(FLAGGED, ['claude-code', 'codex'])
    await upload(ACCEPTED, ['claude-code'])

    await approveSnapshot(ADMIN, a.snapshotId)

    expect(await visibilities()).toEqual({ 'all:': 'public', 'tool_model:claude-code': 'public', 'tool_model:codex': 'public' })
  })

  it('holds the rows of another flagged upload that is not approved', async () => {
    const a = await upload(FLAGGED, ['claude-code', 'codex'])
    await upload(FLAGGED, ['claude-code'])

    const result = await approveSnapshot(ADMIN, a.snapshotId)

    // claude-code and the all row were rewritten by the second flagged upload.
    expect(await visibilities()).toEqual({ 'all:': 'flagged', 'tool_model:claude-code': 'flagged', 'tool_model:codex': 'public' })
    expect(result).toEqual({ metricsUpdated: 1, metricsHeld: 2 })
  })

  describe('rows hidden one by one', () => {
    it('stay hidden when a snapshot of their period is approved', async () => {
      const a = await upload(FLAGGED, ['claude-code', 'codex'])
      await hideLeaderboardEntry(ADMIN, await metricId('codex'))

      const result = await approveSnapshot(ADMIN, a.snapshotId)

      expect(await visibilities()).toEqual({ 'all:': 'public', 'tool_model:claude-code': 'public', 'tool_model:codex': 'hidden' })
      expect(result.metricsHeld).toBe(1)
    })

    it('stay hidden through a snapshot hide and its approval', async () => {
      const a = await upload(FLAGGED, ['claude-code', 'codex'])
      await hideLeaderboardEntry(ADMIN, await metricId('codex'))
      await hideSnapshot(ADMIN, a.snapshotId)

      await approveSnapshot(ADMIN, a.snapshotId)

      expect(await visibilities()).toEqual({ 'all:': 'public', 'tool_model:claude-code': 'public', 'tool_model:codex': 'hidden' })
    })

    it('stay hidden through later uploads, and are published again by a restore of the row', async () => {
      const a = await upload(FLAGGED, ['claude-code', 'codex'])
      const codex = await metricId('codex')
      await hideLeaderboardEntry(ADMIN, codex)
      const b = await upload(FLAGGED, ['claude-code', 'codex'])
      await approveSnapshot(ADMIN, a.snapshotId)
      await approveSnapshot(ADMIN, b.snapshotId)
      expect((await visibilities())['tool_model:codex']).toBe('hidden')

      await restoreLeaderboardEntry(ADMIN, codex)
      expect((await visibilities())['tool_model:codex']).toBe('public')

      // A later hide of the period and its approval treat the row like any other.
      const c = await upload(ACCEPTED, ['claude-code', 'codex'])
      await hideSnapshot(ADMIN, c.snapshotId)
      await approveSnapshot(ADMIN, c.snapshotId)
      expect((await visibilities())['tool_model:codex']).toBe('public')
    })
  })

  describe('a new row in a hidden period', () => {
    it('starts hidden while a hide of the period stands, even when an admin restored some of its rows', async () => {
      const a = await upload(ACCEPTED, ['claude-code'])
      await hideSnapshot(ADMIN, a.snapshotId)
      await restoreLeaderboardEntry(ADMIN, await metricId('claude-code'))

      await upload(ACCEPTED, ['claude-code', 'codex'])

      expect((await visibilities())['tool_model:codex']).toBe('hidden')
    })

    it('starts with the upload visibility once the hide is lifted', async () => {
      const a = await upload(ACCEPTED, ['claude-code'])
      await hideSnapshot(ADMIN, a.snapshotId)
      await approveSnapshot(ADMIN, a.snapshotId)

      await upload(ACCEPTED, ['claude-code', 'codex'])

      expect(Object.values(await visibilities())).toEqual(['public', 'public', 'public'])
    })
  })

  describe('upload history pruning', () => {
    it('keeps a hide decision when the upload history of the hidden snapshot is old enough to prune', async () => {
      const b = await upload(ACCEPTED)
      await hideSnapshot(ADMIN, b.snapshotId)
      const c = await upload(ACCEPTED)
      const d = await upload(FLAGGED)
      await age(b.snapshotId, 400)
      await age(c.snapshotId, 400)

      await pruneUploadHistory(180)

      expect(await query(`SELECT id FROM upload_snapshots WHERE id = $1`, [b.snapshotId])).toHaveLength(1)
      expect(await query(`SELECT id FROM upload_snapshots WHERE id = $1`, [c.snapshotId])).toHaveLength(0)
      const result = await approveSnapshot(ADMIN, d.snapshotId)
      expect(Object.values(await visibilities())).toEqual(['hidden', 'hidden'])
      expect(result.metricsHeld).toBe(2)
    })

    it('keeps the rows of a pruned upload as they are, and reports them as held', async () => {
      const a = await upload(FLAGGED, ['claude-code', 'codex'])
      await age(a.snapshotId, 400)
      await pruneUploadHistory(180)
      expect(await query(`SELECT id FROM leaderboard_metrics WHERE upload_request_id IS NULL`)).toHaveLength(3)

      const b = await upload(FLAGGED, ['claude-code'])
      const result = await approveSnapshot(ADMIN, b.snapshotId)

      expect(await visibilities()).toEqual({ 'all:': 'public', 'tool_model:claude-code': 'public', 'tool_model:codex': 'flagged' })
      expect(result).toEqual({ metricsUpdated: 2, metricsHeld: 1 })
    })

    it('prunes an approved snapshot like any other', async () => {
      const a = await upload(FLAGGED)
      await rejectSnapshot(ADMIN, a.snapshotId)
      await approveSnapshot(ADMIN, a.snapshotId)
      await age(a.snapshotId, 400)

      await pruneUploadHistory(180)

      expect(await query(`SELECT id FROM upload_snapshots`)).toHaveLength(0)
      expect(Object.values(await visibilities())).toEqual(['public', 'public'])
    })
  })
})
