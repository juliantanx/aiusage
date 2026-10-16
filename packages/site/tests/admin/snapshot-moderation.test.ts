import { beforeEach, describe, expect, it, vi } from 'vitest'
import { queries, resetFakeSql, respondWith, type RecordedQuery } from '../mocks/sql.js'

vi.mock('../../src/lib/server/db/pool.js', async () => ({ sql: (await import('../mocks/sql.js')).fakeSql }))

import { approveSnapshot, hideSnapshot, rejectSnapshot } from '../../src/lib/server/admin/operations.js'

const isLock = (q: RecordedQuery) => q.text.startsWith('SELECT pg_advisory_xact_lock(')
const isReview = (q: RecordedQuery) => q.text.startsWith('UPDATE upload_snapshots')
const isMetricUpdate = (q: RecordedQuery) => q.text.startsWith('UPDATE leaderboard_metrics')
const isHeldCount = (q: RecordedQuery) => q.text.startsWith('SELECT COUNT(*)::INTEGER AS count FROM leaderboard_metrics')
const isAudit = (q: RecordedQuery) => q.text.startsWith('INSERT INTO admin_audit_logs')

const SAME_USER_AND_PERIOD = 'lm.user_id = s.user_id AND lm.period_type = s.period_type AND lm.period_start = s.period_start'

function database(options: { snapshotExists?: boolean; metricRows?: number; heldRows?: number } = {}) {
  const { snapshotExists = true, metricRows = 4, heldRows = 0 } = options
  respondWith((q) => {
    if (isLock(q)) return snapshotExists ? [{ pg_advisory_xact_lock: '' }] : []
    if (isMetricUpdate(q)) return Array.from({ length: metricRows }, (_, i) => ({ id: `metric_${i}` }))
    if (isHeldCount(q)) return [{ count: heldRows }]
    return undefined
  })
}

function auditMetadata(): unknown {
  const audit = queries.find(isAudit)
  expect(audit).toBeDefined()
  return JSON.parse(audit!.values[audit!.values.length - 1] as string)
}

beforeEach(() => {
  resetFakeSql()
})

describe.each([
  ['rejectSnapshot', rejectSnapshot, 'rejected'],
  ['hideSnapshot', hideSnapshot, 'hidden'],
  ['approveSnapshot', approveSnapshot, 'approved'],
] as const)('%s', (_name, action, reviewStatus) => {
  it('takes the leaderboard lock of the snapshot owner before it reads or writes anything else', async () => {
    database()

    await action('admin_1', 'snap_1')

    expect(queries[0].text).toBe(
      "SELECT pg_advisory_xact_lock(hashtextextended('leaderboard_metrics:' || user_id, 0)) FROM upload_snapshots WHERE id = ?"
    )
    expect(queries[0].values).toEqual(['snap_1'])
    expect(queries.findIndex(isReview)).toBe(1)
    expect(queries[1].values[0]).toBe(reviewStatus)
    expect(queries.findIndex(isMetricUpdate)).toBe(2)
  })

  it('matches the metric rows on the user and period of the snapshot', async () => {
    database()

    await action('admin_1', 'snap_1')

    const update = queries.find(isMetricUpdate)!
    expect(update.text).toContain(`FROM upload_snapshots s WHERE s.id = ? AND ${SAME_USER_AND_PERIOD}`)
    expect(update.values).toEqual(['snap_1'])
  })

  it('reports when no metric row matched, to the caller and in the audit log', async () => {
    database({ metricRows: 0 })

    const result = await action('admin_1', 'snap_1')

    expect(result.metricsUpdated).toBe(0)
    expect(auditMetadata()).toEqual({ metrics_updated: 0 })
  })

  it('fails for a snapshot that does not exist, without touching anything', async () => {
    database({ snapshotExists: false })

    await expect(action('admin_1', 'missing')).rejects.toThrow('Snapshot not found')
    expect(queries.filter(q => !isLock(q))).toEqual([])
  })
})

describe.each([
  ['rejectSnapshot', rejectSnapshot],
  ['hideSnapshot', hideSnapshot],
] as const)('%s', (_name, action) => {
  it('hides every metric row of the period, whichever upload wrote it', async () => {
    database({ metricRows: 4 })

    await expect(action('admin_1', 'snap_1')).resolves.toEqual({ metricsUpdated: 4 })

    const update = queries.find(isMetricUpdate)!
    expect(update.text).toContain("SET visibility = 'hidden'")
    // Later uploads of the period re-point the rows at their own request, so a
    // match on the request id of the snapshot would hit nothing.
    expect(update.text).not.toContain('upload_request_id')
    expect(auditMetadata()).toEqual({ metrics_updated: 4 })
  })
})

describe('approveSnapshot', () => {
  it('publishes only rows written by this upload or by an accepted or approved upload of the period', async () => {
    database({ metricRows: 4 })

    await expect(approveSnapshot('admin_1', 'snap_1')).resolves.toEqual({ metricsUpdated: 4, metricsHeld: 0 })

    const update = queries.find(isMetricUpdate)!
    expect(update.text).toContain("SET visibility = 'public'")
    expect(update.text).toContain(
      'AND ( lm.upload_request_id = s.upload_request_id OR EXISTS ( SELECT 1 FROM upload_snapshots src WHERE src.upload_request_id = lm.upload_request_id'
    )
    // An accepted upload that an admin hid or rejected since does not count.
    expect(update.text).toContain(
      "AND src.user_id = s.user_id AND src.period_type = s.period_type AND src.period_start = s.period_start AND ( src.review_status = 'approved' OR (src.status <> 'flagged' AND src.review_status IS NULL) ) ) )"
    )
    expect(auditMetadata()).toEqual({ metrics_updated: 4 })
    // tests/admin/snapshot-moderation.pg.test.ts runs these rules on PostgreSQL.
  })

  it('leaves rows hidden on their own, and the whole period while another snapshot of it stands hidden or rejected', async () => {
    database({ metricRows: 0 })

    await approveSnapshot('admin_1', 'snap_1')

    const update = queries.find(isMetricUpdate)!
    expect(update.text).toContain(
      "AND NOT lm.entry_hidden AND NOT EXISTS ( SELECT 1 FROM upload_snapshots hold WHERE hold.user_id = s.user_id AND hold.period_type = s.period_type AND hold.period_start = s.period_start AND hold.review_status IN ('hidden', 'rejected') )"
    )
  })

  it('reports the rows of the period it left unpublished', async () => {
    database({ metricRows: 4, heldRows: 2 })

    await expect(approveSnapshot('admin_1', 'snap_1')).resolves.toEqual({ metricsUpdated: 4, metricsHeld: 2 })

    const held = queries.find(isHeldCount)!
    expect(held.text).toContain(`JOIN upload_snapshots s ON s.id = ? WHERE ${SAME_USER_AND_PERIOD} AND lm.visibility <> 'public'`)
    expect(queries.indexOf(held)).toBeGreaterThan(queries.findIndex(isMetricUpdate))
    expect(auditMetadata()).toEqual({ metrics_updated: 4, metrics_held: 2 })
  })

  it('reports when every row of the period belongs to another upload that is not approved', async () => {
    database({ metricRows: 0, heldRows: 4 })

    await expect(approveSnapshot('admin_1', 'snap_1')).resolves.toEqual({ metricsUpdated: 0, metricsHeld: 4 })
    expect(auditMetadata()).toEqual({ metrics_updated: 0, metrics_held: 4 })
  })
})
