// Migration v17 (leaderboard_metrics.entry_hidden) on PostgreSQL (PGlite),
// applied to a database that was migrated to v16 and has moderated rows.
import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/lib/server/db/pool.js', async () => ({ sql: (await import('../helpers/pglite-sql.js')).sql }))

import { migrateTestDatabase, query } from '../helpers/pglite-sql.js'

async function row(id: string, visibility: string): Promise<void> {
  await query(
    `INSERT INTO leaderboard_metrics (id, user_id, device_id, period_type, period_start, period_end, scope_type, tool, model,
       input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, total_tokens, total_cost_usd, visibility)
     VALUES ($1, 'u1', 'd1', 'daily', '2026-06-01', '2026-06-01T23:59:59Z', 'tool_model', $1, 'm', 1, 0, 0, 0, 0, 1, 0, $2::leaderboard_visibility)`,
    [id, visibility])
}

async function audit(id: string, action: string, at: string, targetType = 'leaderboard_metrics'): Promise<void> {
  await query(
    `INSERT INTO admin_audit_logs (id, admin_user_id, action, target_type, target_id, reason, created_at)
     VALUES ($1, 'admin', $2, $5, $3, '', $4::timestamptz)`,
    [`${id}_${action}_${at}_${targetType}`, action, id, at, targetType])
}

describe('migration v17: leaderboard_metrics.entry_hidden', () => {
  beforeAll(async () => {
    await migrateTestDatabase()
    // Back to the v16 shape: the column does not exist and v17 is not recorded.
    await query(`ALTER TABLE leaderboard_metrics DROP COLUMN entry_hidden`)
    await query(`DELETE FROM schema_migrations WHERE version = 17`)

    await query(`INSERT INTO users (id, username, email, display_name) VALUES ('u1', 'u1', 'u1@example.com', 'U1'), ('admin', 'admin', 'a@example.com', 'A')`)
    await query(`INSERT INTO user_devices (id, user_id, name, secret_encrypted, secret_hash) VALUES ('d1', 'u1', 'laptop', 'x', 'x')`)

    await row('hidden_on_its_own', 'hidden')
    await audit('hidden_on_its_own', 'hide_metric', '2026-06-02')

    await row('restored_then_hidden_again', 'hidden')
    await audit('restored_then_hidden_again', 'hide_metric', '2026-06-02')
    await audit('restored_then_hidden_again', 'restore_metric', '2026-06-03')
    await audit('restored_then_hidden_again', 'hide_metric', '2026-06-04')

    // Hidden on its own, restored, then hidden with its period by a snapshot action.
    await row('restored_then_period_hidden', 'hidden')
    await audit('restored_then_period_hidden', 'hide_metric', '2026-06-02')
    await audit('restored_then_period_hidden', 'restore_metric', '2026-06-03')

    await row('period_hidden', 'hidden')

    // Other actions on the row, or on something else with the same id, do not count.
    await row('hidden_then_other_action', 'hidden')
    await audit('hidden_then_other_action', 'hide_metric', '2026-06-02')
    await audit('hidden_then_other_action', 'recompute', '2026-06-05')
    await row('restored_then_snapshot_hide', 'hidden')
    await audit('restored_then_snapshot_hide', 'hide_metric', '2026-06-02')
    await audit('restored_then_snapshot_hide', 'restore_metric', '2026-06-03')
    await audit('restored_then_snapshot_hide', 'hide_metric', '2026-06-04', 'upload_snapshots')

    // A hide and a restore logged at the same instant: the greater id counts as the later.
    await row('same_instant', 'hidden')
    await audit('same_instant', 'hide_metric', '2026-06-02')
    await audit('same_instant', 'restore_metric', '2026-06-02')

    // The admin hid it on its own once, but it is public now (restored before the log was written, or by an upload of an older release).
    await row('public_with_hide_logged', 'public')
    await audit('public_with_hide_logged', 'hide_metric', '2026-06-02')

    await migrateTestDatabase()
  })

  it('adds the column, false by default', async () => {
    const columns = await query<{ is_nullable: string; column_default: string }>(
      `SELECT is_nullable, column_default FROM information_schema.columns WHERE table_name = 'leaderboard_metrics' AND column_name = 'entry_hidden'`)
    expect(columns).toEqual([{ is_nullable: 'NO', column_default: 'false' }])
  })

  it('marks the hidden rows whose last row-level action in the audit log is a hide', async () => {
    const rows = await query<{ id: string; entry_hidden: boolean }>(`SELECT id, entry_hidden FROM leaderboard_metrics ORDER BY id`)
    expect(Object.fromEntries(rows.map(r => [r.id, r.entry_hidden]))).toEqual({
      hidden_on_its_own: true,
      restored_then_hidden_again: true,
      restored_then_period_hidden: false,
      period_hidden: false,
      hidden_then_other_action: true,
      restored_then_snapshot_hide: false,
      same_instant: false,
      public_with_hide_logged: false,
    })
  })

  it('is recorded as applied', async () => {
    expect(await query(`SELECT version FROM schema_migrations WHERE version = 17`)).toHaveLength(1)
  })
})
