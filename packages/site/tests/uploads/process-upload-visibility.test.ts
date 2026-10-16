import { beforeEach, describe, expect, it, vi } from 'vitest'
import { queries, resetFakeSql, respondWith, type RecordedQuery } from '../mocks/sql.js'

vi.mock('../../src/lib/server/db/pool.js', async () => ({ sql: (await import('../mocks/sql.js')).fakeSql }))

import { processUpload, type UploadBreakdown, type UploadRequest } from '../../src/lib/server/uploads/verify.js'
import { invalidateConfigCache } from '../../src/lib/server/config.js'

const isPeriodLookup = (q: RecordedQuery) => q.text.startsWith('SELECT ( COALESCE(BOOL_AND(visibility = \'hidden\'), FALSE) OR EXISTS (')
const isMetricUpsert = (q: RecordedQuery) => q.text.startsWith('INSERT INTO leaderboard_metrics')

function breakdown(scope_type: UploadBreakdown['scope_type'], tool: string | null, model: string | null): UploadBreakdown {
  return { scope_type, tool, model, total_tokens: 100, input_tokens: 100, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, thinking_tokens: 0 }
}

function uploadRequest(): UploadRequest {
  return {
    schema_version: 1,
    client_version: '1.5.20',
    client_platform: 'linux',
    snapshots: [{
      period_type: 'daily',
      period_start: '2026-06-01T00:00:00.000Z',
      period_end: '2026-06-01T23:59:59.999Z',
      total_tokens: 100, input_tokens: 100, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, thinking_tokens: 0,
      token_snapshot_hash: 'sha256:test',
      breakdowns: [
        breakdown('all', null, null),
        breakdown('tool_model', 'claude-code', 'a-model-with-no-price'),
      ],
    }],
  }
}

// The model has no price, so the unknown-model rule flags the snapshot unless
// the rule is switched off through site_config.
function database(options: { periodHidden: boolean | null; flagged: boolean }) {
  respondWith((q) => {
    if (isPeriodLookup(q)) return [{ hidden: options.periodHidden }]
    if (q.text.startsWith('SELECT value FROM site_config') && q.values[0] === 'risk.rule_unknown_model') {
      return [{ value: options.flagged ? 1 : 0 }]
    }
    if (q.text.startsWith('SELECT COUNT(*) as cnt')) return [{ cnt: 0 }]
    if (q.text.startsWith('SELECT COALESCE(AVG(total_tokens), 0) as avg_tokens')) return [{ avg_tokens: 0 }]
    return undefined
  })
}

// Parameters of the upsert: VALUES (id, request, user, device, period_type, period_start, period_end,
// scope, tool, model, input, output, cache_read, cache_write, thinking, total, cost, visibility, has_unknown_cost)
// then DO UPDATE SET request, device, period_end, input, output, cache_read, cache_write, thinking, total,
// cost, visibility (for a row that is not hidden), has_unknown_cost.

/** The `visibility` each upserted row would be inserted with. */
function insertedVisibilities(): unknown[] {
  return queries.filter(isMetricUpsert).map(q => q.values[17])
}

/** The `visibility` each upserted row would be updated to, unless it is hidden. */
function updatedVisibilities(): unknown[] {
  return queries.filter(isMetricUpsert).map(q => q.values[29])
}

beforeEach(() => {
  resetFakeSql()
  invalidateConfigCache()
})

describe('processUpload leaderboard visibility', () => {
  it('keeps a hidden row hidden when the same period is uploaded again', async () => {
    database({ periodHidden: false, flagged: false })

    await processUpload('user_1', 'device_1', 'key_1', uploadRequest(), '127.0.0.1')

    const upserts = queries.filter(isMetricUpsert)
    expect(upserts).toHaveLength(2)
    for (const upsert of upserts) {
      expect(upsert.text).toContain(
        "visibility = CASE WHEN leaderboard_metrics.visibility = 'hidden' THEN leaderboard_metrics.visibility ELSE ? END"
      )
    }
  })

  it('takes the leaderboard lock of the user, the one the admin snapshot actions take, before any other statement of the transaction', async () => {
    database({ periodHidden: false, flagged: false })

    await processUpload('user_1', 'device_1', 'key_1', uploadRequest(), '127.0.0.1')

    const lock = queries.findIndex(q => q.text.startsWith('SELECT pg_advisory_xact_lock('))
    expect(queries[lock].text).toBe("SELECT pg_advisory_xact_lock(hashtextextended('leaderboard_metrics:' || ?::text, 0))")
    expect(queries[lock].values).toEqual(['user_1'])
    expect(queries.findIndex(q => q.text.startsWith('INSERT INTO upload_requests'))).toBe(lock + 1)
    expect(lock).toBeLessThan(queries.findIndex(isPeriodLookup))
  })

  it('looks up the moderation state of the user and period inside the upload transaction', async () => {
    database({ periodHidden: false, flagged: false })

    await processUpload('user_1', 'device_1', 'key_1', uploadRequest(), '127.0.0.1')

    const lookup = queries.find(isPeriodLookup)!
    expect(lookup.text).toContain(') AS hidden FROM leaderboard_metrics WHERE user_id = ? AND period_type = ? AND period_start = ?')
    // A snapshot of the period that an admin hid or rejected keeps new rows hidden.
    expect(lookup.text).toContain(
      "SELECT 1 FROM upload_snapshots hold WHERE hold.user_id = ? AND hold.period_type = ? AND hold.period_start = ? AND hold.review_status IN ('hidden', 'rejected')"
    )
    expect(lookup.values).toEqual(['user_1', 'daily', '2026-06-01T00:00:00.000Z', 'user_1', 'daily', '2026-06-01T00:00:00.000Z'])
    expect(queries.indexOf(lookup)).toBeLessThan(queries.findIndex(isMetricUpsert))
  })

  it('writes accepted uploads as public and flagged uploads as flagged', async () => {
    database({ periodHidden: false, flagged: false })
    const accepted = await processUpload('user_1', 'device_1', 'key_1', uploadRequest(), '127.0.0.1')
    expect(accepted.status).toBe('accepted')
    expect(insertedVisibilities()).toEqual(['public', 'public'])
    expect(updatedVisibilities()).toEqual(['public', 'public'])

    resetFakeSql()
    invalidateConfigCache()
    database({ periodHidden: false, flagged: true })
    const flagged = await processUpload('user_1', 'device_1', 'key_2', uploadRequest(), '127.0.0.1')
    expect(flagged.status).toBe('flagged')
    expect(insertedVisibilities()).toEqual(['flagged', 'flagged'])
    expect(updatedVisibilities()).toEqual(['flagged', 'flagged'])
  })

  it('treats a period with no rows yet as not moderated', async () => {
    database({ periodHidden: null, flagged: false })

    await processUpload('user_1', 'device_1', 'key_1', uploadRequest(), '127.0.0.1')

    expect(insertedVisibilities()).toEqual(['public', 'public'])
  })

  it.each([false, true])('adds rows as hidden when the period is hidden (flagged upload: %s)', async (flagged) => {
    database({ periodHidden: true, flagged })

    const result = await processUpload('user_1', 'device_1', 'key_1', uploadRequest(), '127.0.0.1')

    // The upload itself is still judged on its own data.
    expect(result.status).toBe(flagged ? 'flagged' : 'accepted')
    expect(insertedVisibilities()).toEqual(['hidden', 'hidden'])
    // A row that is not hidden any more by the time it is written (an admin
    // restored it) gets the upload's own visibility, not the stale 'hidden'.
    expect(updatedVisibilities()).toEqual(flagged ? ['flagged', 'flagged'] : ['public', 'public'])
  })
})
