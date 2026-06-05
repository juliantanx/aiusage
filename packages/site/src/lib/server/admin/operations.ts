import { sql } from '../db/pool.js'
import { nanoid } from 'nanoid'
import { DEFAULT_PRICE_TABLE, type PriceEntry } from '@aiusage/core'
import { invalidateLeaderboardCache } from '../leaderboard/query.js'

export async function banUser(adminUserId: string, targetUserId: string, reason: string): Promise<void> {
  await sql`UPDATE users SET status = 'banned', banned_at = NOW(), ban_reason = ${reason}, updated_at = NOW() WHERE id = ${targetUserId}`
  await logAdminAction(adminUserId, 'ban_user', 'users', targetUserId, reason)
  invalidateLeaderboardCache()
}

export async function unbanUser(adminUserId: string, targetUserId: string): Promise<void> {
  await sql`UPDATE users SET status = 'active', banned_at = NULL, ban_reason = NULL, updated_at = NOW() WHERE id = ${targetUserId}`
  await logAdminAction(adminUserId, 'unban_user', 'users', targetUserId, 'User unbanned')
}

export async function approveSnapshot(adminUserId: string, snapshotId: string, note?: string): Promise<void> {
  const snapshots = await sql`SELECT * FROM upload_snapshots WHERE id = ${snapshotId}`
  const snap = snapshots[0] as { id: string } | undefined
  if (!snap) throw new Error('Snapshot not found')

  await sql`UPDATE upload_snapshots SET review_status = 'approved', reviewed_by = ${adminUserId}, reviewed_at = NOW(), review_note = ${note || null} WHERE id = ${snapshotId}`
  await logAdminAction(adminUserId, 'approve_snapshot', 'upload_snapshots', snapshotId, note || 'Snapshot approved')
  invalidateLeaderboardCache()
}

export async function rejectSnapshot(adminUserId: string, snapshotId: string, note?: string): Promise<void> {
  await sql`UPDATE upload_snapshots SET review_status = 'rejected', reviewed_by = ${adminUserId}, reviewed_at = NOW(), review_note = ${note || null} WHERE id = ${snapshotId}`
  // Cascade: hide all derived leaderboard_metrics for this snapshot
  const snapshots = await sql`SELECT upload_request_id, user_id, period_type, period_start FROM upload_snapshots WHERE id = ${snapshotId}`
  const snap = snapshots[0] as { upload_request_id: string; user_id: string; period_type: string; period_start: string } | undefined
  if (snap) {
    await sql`
      UPDATE leaderboard_metrics
      SET visibility = 'hidden', updated_at = NOW()
      WHERE upload_request_id = ${snap.upload_request_id}
        AND user_id = ${snap.user_id}
        AND period_type = ${snap.period_type}::period_type
        AND period_start = ${snap.period_start}
    `
  }
  await logAdminAction(adminUserId, 'reject_snapshot', 'upload_snapshots', snapshotId, note || 'Snapshot rejected')
  invalidateLeaderboardCache()
}

export async function hideSnapshot(adminUserId: string, snapshotId: string, note?: string): Promise<void> {
  await sql`UPDATE upload_snapshots SET review_status = 'hidden', reviewed_by = ${adminUserId}, reviewed_at = NOW(), review_note = ${note || null} WHERE id = ${snapshotId}`
  const snapshots = await sql`SELECT upload_request_id, user_id, period_type, period_start FROM upload_snapshots WHERE id = ${snapshotId}`
  const snap = snapshots[0] as { upload_request_id: string; user_id: string; period_type: string; period_start: string } | undefined
  if (snap) {
    await sql`
      UPDATE leaderboard_metrics
      SET visibility = 'hidden', updated_at = NOW()
      WHERE upload_request_id = ${snap.upload_request_id}
        AND user_id = ${snap.user_id}
        AND period_type = ${snap.period_type}::period_type
        AND period_start = ${snap.period_start}
    `
  }
  await logAdminAction(adminUserId, 'hide_snapshot', 'upload_snapshots', snapshotId, note || 'Snapshot hidden')
  invalidateLeaderboardCache()
}

export async function hideLeaderboardEntry(adminUserId: string, entryId: string): Promise<void> {
  await sql`UPDATE leaderboard_metrics SET visibility = 'hidden', updated_at = NOW() WHERE id = ${entryId}`
  await logAdminAction(adminUserId, 'hide_metric', 'leaderboard_metrics', entryId, 'Metric hidden')
  invalidateLeaderboardCache()
}

export async function restoreLeaderboardEntry(adminUserId: string, entryId: string): Promise<void> {
  // Check user status and leaderboard_visibility before restoring
  const metrics = await sql`
    SELECT lm.user_id, u.status, u.leaderboard_visibility
    FROM leaderboard_metrics lm
    JOIN users u ON u.id = lm.user_id
    WHERE lm.id = ${entryId}
  `
  const metric = metrics[0] as { user_id: string; status: string; leaderboard_visibility: string } | undefined
  if (!metric) throw new Error('Metric not found')
  if (metric.status !== 'active') throw new Error('Cannot restore: user is not active')
  if (metric.leaderboard_visibility !== 'public') throw new Error('Cannot restore: user leaderboard visibility is not public')

  await sql`UPDATE leaderboard_metrics SET visibility = 'public', updated_at = NOW() WHERE id = ${entryId}`
  await logAdminAction(adminUserId, 'restore_metric', 'leaderboard_metrics', entryId, 'Metric restored')
  invalidateLeaderboardCache()
}

export async function setUserRole(adminUserId: string, targetUserId: string, role: string): Promise<void> {
  await sql`UPDATE users SET role = ${role}::user_role WHERE id = ${targetUserId}`
  await logAdminAction(adminUserId, 'set_role', 'users', targetUserId, `Role set to ${role}`)
}

export async function getFlaggedSnapshots(limit = 50, offset = 0) {
  return sql`
    SELECT s.*, u.display_name, u.username, d.name as device_name,
      NULL::bigint as prev_total_tokens
    FROM upload_snapshots s
    JOIN users u ON u.id = s.user_id
    JOIN user_devices d ON d.id = s.device_id
    WHERE s.status = 'flagged'
    ORDER BY s.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `
}

export async function getAdminAuditLogs(limit = 50, offset = 0) {
  return sql`
    SELECT al.*, u.display_name as admin_display_name
    FROM admin_audit_logs al
    JOIN users u ON u.id = al.admin_user_id
    ORDER BY al.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `
}

async function logAdminAction(adminUserId: string, action: string, targetType: string, targetId: string, reason: string): Promise<void> {
  await sql`
    INSERT INTO admin_audit_logs (id, admin_user_id, action, target_type, target_id, reason)
    VALUES (${nanoid()}, ${adminUserId}, ${action}, ${targetType}, ${targetId}, ${reason})
  `
}

// --- Pricing Management ---

export async function seedPriceTable(adminUserId: string, version: string, sourceCommit?: string): Promise<{ tableId: string; entryCount: number }> {
  const tableId = nanoid()
  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO official_price_tables (id, version, status, source, source_commit, notes, created_by)
      VALUES (${tableId}, ${version}, 'draft', 'core_pricing', ${sourceCommit || null}, ${'Seeded from packages/core/src/pricing.ts'}, ${adminUserId})
    `

    for (const [modelKey, entry] of Object.entries(DEFAULT_PRICE_TABLE)) {
      await tx`
        INSERT INTO official_price_entries (id, table_id, model_key, input, output, cache_read, cache_write, currency)
        VALUES (${nanoid()}, ${tableId}, ${modelKey}, ${entry.input}, ${entry.output}, ${entry.cacheRead ?? null}, ${entry.cacheWrite ?? null}, ${entry.currency ?? 'USD'})
      `
    }
  })

  await logAdminAction(adminUserId, 'seed_price_table', 'official_price_tables', tableId, `Seeded v${version} from core pricing`)
  return { tableId, entryCount: Object.keys(DEFAULT_PRICE_TABLE).length }
}

export async function publishPriceTable(adminUserId: string, tableId: string, note?: string): Promise<void> {
  const tables = await sql`SELECT id, status, version FROM official_price_tables WHERE id = ${tableId}`
  const table = tables[0] as { id: string; status: string; version: string } | undefined
  if (!table) throw new Error('Price table not found')
  if (table.status !== 'draft') throw new Error('Only draft tables can be published')

  await sql.begin(async (tx) => {
    // Archive the current published table
    await tx`UPDATE official_price_tables SET status = 'archived', archived_at = NOW() WHERE status = 'published'`
    // Publish this one
    await tx`UPDATE official_price_tables SET status = 'published', published_by = ${adminUserId}, published_at = NOW() WHERE id = ${tableId}`
  })

  await logAdminAction(adminUserId, 'publish_price_table', 'official_price_tables', tableId, note || `Published v${table.version}`)
}

export async function archivePriceTable(adminUserId: string, tableId: string): Promise<void> {
  const tables = await sql`SELECT id, status FROM official_price_tables WHERE id = ${tableId}`
  const table = tables[0] as { id: string; status: string } | undefined
  if (!table) throw new Error('Price table not found')
  if (table.status === 'archived') throw new Error('Already archived')

  await sql`UPDATE official_price_tables SET status = 'archived', archived_at = NOW() WHERE id = ${tableId}`
  await logAdminAction(adminUserId, 'archive_price_table', 'official_price_tables', tableId, 'Table archived')
}

export async function getPriceTables(limit = 50, offset = 0) {
  return sql`
    SELECT pt.*,
      (SELECT COUNT(*) FROM official_price_entries WHERE table_id = pt.id) as entry_count
    FROM official_price_tables pt
    ORDER BY pt.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `
}

export async function getPriceTableEntries(tableId: string) {
  return sql`
    SELECT * FROM official_price_entries
    WHERE table_id = ${tableId}
    ORDER BY model_key ASC
  `
}
