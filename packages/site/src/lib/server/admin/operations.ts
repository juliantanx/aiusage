import { sql } from '../db/pool.js'
import { nanoid } from 'nanoid'

export async function banUser(adminUserId: string, targetUserId: string, reason: string): Promise<void> {
  await sql`UPDATE users SET status = 'banned', banned_at = NOW(), ban_reason = ${reason}, updated_at = NOW() WHERE id = ${targetUserId}`
  await logAdminAction(adminUserId, 'ban_user', 'users', targetUserId, reason)
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
}

export async function rejectSnapshot(adminUserId: string, snapshotId: string, note?: string): Promise<void> {
  await sql`UPDATE upload_snapshots SET review_status = 'rejected', reviewed_by = ${adminUserId}, reviewed_at = NOW(), review_note = ${note || null} WHERE id = ${snapshotId}`
  await logAdminAction(adminUserId, 'reject_snapshot', 'upload_snapshots', snapshotId, note || 'Snapshot rejected')
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
}

export async function hideLeaderboardEntry(adminUserId: string, entryId: string): Promise<void> {
  await sql`UPDATE leaderboard_metrics SET visibility = 'hidden', updated_at = NOW() WHERE id = ${entryId}`
  await logAdminAction(adminUserId, 'hide_metric', 'leaderboard_metrics', entryId, 'Metric hidden')
}

export async function restoreLeaderboardEntry(adminUserId: string, entryId: string): Promise<void> {
  await sql`UPDATE leaderboard_metrics SET visibility = 'public', updated_at = NOW() WHERE id = ${entryId}`
  await logAdminAction(adminUserId, 'restore_metric', 'leaderboard_metrics', entryId, 'Metric restored')
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
