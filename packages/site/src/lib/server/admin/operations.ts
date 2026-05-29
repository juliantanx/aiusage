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
  const snap = snapshots[0] as { user_id: string; period_type: string; period_start: string; period_end: string; total_tokens: string; id: string } | undefined
  if (!snap) throw new Error('Snapshot not found')

  await sql`UPDATE upload_snapshots SET review_status = 'approved', reviewed_by = ${adminUserId}, reviewed_at = NOW(), review_note = ${note || null} WHERE id = ${snapshotId}`

  // Upsert leaderboard entry
  const entryId = nanoid()
  await sql`
    INSERT INTO leaderboard_entries (id, user_id, period_type, period_start, period_end, total_tokens, visibility, source_snapshot_id)
    VALUES (${entryId}, ${snap.user_id}, ${snap.period_type}, ${snap.period_start}, ${snap.period_end}, ${snap.total_tokens}, 'public', ${snap.id})
    ON CONFLICT (user_id, period_type, period_start)
    DO UPDATE SET total_tokens = ${snap.total_tokens}, period_end = ${snap.period_end}, visibility = 'public', source_snapshot_id = ${snap.id}, updated_at = NOW()
  `

  await sql`UPDATE upload_snapshots SET leaderboard_entry_id = ${entryId} WHERE id = ${snapshotId}`
  await logAdminAction(adminUserId, 'approve_snapshot', 'upload_snapshots', snapshotId, note || 'Snapshot approved')
}

export async function rejectSnapshot(adminUserId: string, snapshotId: string, note?: string): Promise<void> {
  await sql`UPDATE upload_snapshots SET review_status = 'rejected', reviewed_by = ${adminUserId}, reviewed_at = NOW(), review_note = ${note || null} WHERE id = ${snapshotId}`
  await logAdminAction(adminUserId, 'reject_snapshot', 'upload_snapshots', snapshotId, note || 'Snapshot rejected')
}

export async function hideSnapshot(adminUserId: string, snapshotId: string, note?: string): Promise<void> {
  await sql`UPDATE upload_snapshots SET review_status = 'hidden', reviewed_by = ${adminUserId}, reviewed_at = NOW(), review_note = ${note || null} WHERE id = ${snapshotId}`
  const entry = await sql`SELECT leaderboard_entry_id FROM upload_snapshots WHERE id = ${snapshotId}`
  if (entry[0] && (entry[0] as { leaderboard_entry_id: string | null }).leaderboard_entry_id) {
    await sql`UPDATE leaderboard_entries SET visibility = 'hidden' WHERE id = ${(entry[0] as { leaderboard_entry_id: string }).leaderboard_entry_id}`
  }
  await logAdminAction(adminUserId, 'hide_snapshot', 'upload_snapshots', snapshotId, note || 'Snapshot hidden')
}

export async function hideLeaderboardEntry(adminUserId: string, entryId: string): Promise<void> {
  await sql`UPDATE leaderboard_entries SET visibility = 'hidden' WHERE id = ${entryId}`
  await logAdminAction(adminUserId, 'hide_entry', 'leaderboard_entries', entryId, 'Entry hidden')
}

export async function restoreLeaderboardEntry(adminUserId: string, entryId: string): Promise<void> {
  await sql`UPDATE leaderboard_entries SET visibility = 'public' WHERE id = ${entryId}`
  await logAdminAction(adminUserId, 'restore_entry', 'leaderboard_entries', entryId, 'Entry restored')
}

export async function setUserRole(adminUserId: string, targetUserId: string, role: string): Promise<void> {
  await sql`UPDATE users SET role = ${role}::user_role WHERE id = ${targetUserId}`
  await logAdminAction(adminUserId, 'set_role', 'users', targetUserId, `Role set to ${role}`)
}

export async function getFlaggedSnapshots(limit = 50, offset = 0) {
  return sql`
    SELECT s.*, u.display_name, u.username, d.name as device_name,
      le.total_tokens as prev_total_tokens
    FROM upload_snapshots s
    JOIN users u ON u.id = s.user_id
    JOIN user_devices d ON d.id = s.device_id
    LEFT JOIN leaderboard_entries le ON le.user_id = s.user_id AND le.period_type = s.period_type AND le.period_start = s.period_start AND le.id != s.leaderboard_entry_id
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
