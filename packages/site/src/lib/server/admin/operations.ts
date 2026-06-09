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
  invalidateLeaderboardCache()
}

export async function approveSnapshot(adminUserId: string, snapshotId: string, note?: string): Promise<void> {
  const snapshots = await sql`
    SELECT id, upload_request_id, user_id, period_type, period_start
    FROM upload_snapshots WHERE id = ${snapshotId}
  `
  const snap = snapshots[0] as { id: string; upload_request_id: string; user_id: string; period_type: string; period_start: string } | undefined
  if (!snap) throw new Error('Snapshot not found')

  await sql`UPDATE upload_snapshots SET review_status = 'approved', reviewed_by = ${adminUserId}, reviewed_at = NOW(), review_note = ${note || null} WHERE id = ${snapshotId}`

  // Restore leaderboard visibility for approved snapshot
  await sql`
    UPDATE leaderboard_metrics
    SET visibility = 'public', updated_at = NOW()
    WHERE upload_request_id = ${snap.upload_request_id}
      AND user_id = ${snap.user_id}
      AND period_type = ${snap.period_type}::period_type
      AND period_start = ${snap.period_start}
  `

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

export async function setCloudSync(adminUserId: string, targetUserId: string, enabled: boolean): Promise<void> {
  await sql`UPDATE users SET cloud_sync_enabled = ${enabled}, updated_at = NOW() WHERE id = ${targetUserId}`
  await logAdminAction(adminUserId, 'set_cloud_sync', 'users', targetUserId, `Cloud sync ${enabled ? 'enabled' : 'disabled'}`)
}

export async function setUserRole(adminUserId: string, targetUserId: string, role: string): Promise<void> {
  await sql`UPDATE users SET role = ${role}::user_role WHERE id = ${targetUserId}`
  await logAdminAction(adminUserId, 'set_role', 'users', targetUserId, `Role set to ${role}`)
  invalidateLeaderboardCache()
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

export async function clearAdminAuditLogs(adminUserId: string): Promise<number> {
  const result = await sql`DELETE FROM admin_audit_logs RETURNING id`
  await logAdminAction(adminUserId, 'clear_audit_logs', 'admin_audit_logs', '-', `Cleared ${result.length} logs`)
  return result.length
}

async function logAdminAction(adminUserId: string, action: string, targetType: string, targetId: string, reason: string): Promise<void> {
  await sql`
    INSERT INTO admin_audit_logs (id, admin_user_id, action, target_type, target_id, reason)
    VALUES (${nanoid()}, ${adminUserId}, ${action}, ${targetType}, ${targetId}, ${reason})
  `
}

// --- Pricing Management ---

/** Get or create the single active price table, return its id */
async function ensurePriceTable(adminUserId: string): Promise<string> {
  const existing = await sql`SELECT id FROM official_price_tables WHERE status = 'published' LIMIT 1`
  if (existing.length > 0) return (existing[0] as { id: string }).id

  const tableId = nanoid()
  await sql`
    INSERT INTO official_price_tables (id, version, status, source, created_by, published_by, published_at)
    VALUES (${tableId}, 'default', 'published', 'core_pricing', ${adminUserId}, ${adminUserId}, NOW())
  `
  return tableId
}

/** Sync all entries from core DEFAULT_PRICE_TABLE into the active table. Upserts by model_key. */
export async function syncPricingFromCore(adminUserId: string): Promise<{ added: number; updated: number }> {
  const tableId = await ensurePriceTable(adminUserId)
  let added = 0, updated = 0

  await sql.begin(async (tx) => {
    for (const [modelKey, entry] of Object.entries(DEFAULT_PRICE_TABLE)) {
      const existing = await tx`SELECT id FROM official_price_entries WHERE table_id = ${tableId} AND model_key = ${modelKey}`
      if (existing.length > 0) {
        await tx`
          UPDATE official_price_entries
          SET input = ${entry.input}, output = ${entry.output}, cache_read = ${entry.cacheRead ?? null}, cache_write = ${entry.cacheWrite ?? null}, currency = ${entry.currency ?? 'USD'}
          WHERE table_id = ${tableId} AND model_key = ${modelKey}
        `
        updated++
      } else {
        await tx`
          INSERT INTO official_price_entries (id, table_id, model_key, input, output, cache_read, cache_write, currency)
          VALUES (${nanoid()}, ${tableId}, ${modelKey}, ${entry.input}, ${entry.output}, ${entry.cacheRead ?? null}, ${entry.cacheWrite ?? null}, ${entry.currency ?? 'USD'})
        `
        added++
      }
    }
  })

  await logAdminAction(adminUserId, 'sync_pricing', 'official_price_tables', tableId, `Synced from core: ${added} added, ${updated} updated`)
  return { added, updated }
}

export async function getPriceEntries(adminUserId: string) {
  const tableId = await ensurePriceTable(adminUserId)
  const entries = await sql`
    SELECT e.*, COALESCE(u.usage_count, 0)::INTEGER AS usage_count
    FROM official_price_entries e
    LEFT JOIN (
      SELECT model, COUNT(*)::INTEGER AS usage_count
      FROM cloud_usage_records
      GROUP BY model
    ) u ON u.model = e.model_key
    WHERE e.table_id = ${tableId}
    ORDER BY COALESCE(u.usage_count, 0) DESC, e.model_key ASC
  `
  return { tableId, entries }
}

export async function updatePriceEntries(
  adminUserId: string,
  updates: Array<{ id: string; input: number; output: number; cache_read: number | null; cache_write: number | null }>
): Promise<void> {
  const tableId = await ensurePriceTable(adminUserId)
  await sql.begin(async (tx) => {
    for (const u of updates) {
      await tx`
        UPDATE official_price_entries
        SET input = ${u.input}, output = ${u.output}, cache_read = ${u.cache_read}, cache_write = ${u.cache_write}
        WHERE id = ${u.id} AND table_id = ${tableId}
      `
    }
  })
  await logAdminAction(adminUserId, 'update_price_entries', 'official_price_tables', tableId, `Updated ${updates.length} entries`)
}

export async function addPriceEntry(
  adminUserId: string,
  entry: { model_key: string; input: number; output: number; cache_read: number | null; cache_write: number | null; currency: string }
): Promise<string> {
  const tableId = await ensurePriceTable(adminUserId)
  const id = nanoid()
  await sql`
    INSERT INTO official_price_entries (id, table_id, model_key, input, output, cache_read, cache_write, currency)
    VALUES (${id}, ${tableId}, ${entry.model_key}, ${entry.input}, ${entry.output}, ${entry.cache_read}, ${entry.cache_write}, ${entry.currency})
  `
  await logAdminAction(adminUserId, 'add_price_entry', 'official_price_tables', tableId, `Added model ${entry.model_key}`)
  return id
}

export async function deletePriceEntry(adminUserId: string, entryId: string, modelKey: string): Promise<void> {
  const tableId = await ensurePriceTable(adminUserId)
  await sql`DELETE FROM official_price_entries WHERE id = ${entryId} AND table_id = ${tableId}`
  await logAdminAction(adminUserId, 'delete_price_entry', 'official_price_tables', tableId, `Deleted model ${modelKey}`)
}
