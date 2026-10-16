import { sql } from './pool.js'
import cron from 'node-cron'
import { getConfigValue, CFG } from '$lib/server/config.js'

export function startCleanupCron(): void {
  // Run daily at 03:00 UTC
  cron.schedule('0 3 * * *', async () => {
    console.log('[cleanup] Starting daily cleanup...')
    try {
      const now = new Date()
      const nonceHours = await getConfigValue(CFG.RETENTION_NONCE_HOURS)
      const uploadDays = await getConfigValue(CFG.RETENTION_UPLOAD_REQUEST_DAYS)
      const deviceAuthHours = await getConfigValue(CFG.RETENTION_DEVICE_AUTH_HOURS)

      // Clean expired sessions
      const sessions = await sql`DELETE FROM sessions WHERE expires_at < ${now}`
      console.log(`[cleanup] Removed ${sessions.count} expired sessions`)

      // Clean old nonces
      const nonceCutoff = new Date(now.getTime() - nonceHours * 60 * 60 * 1000)
      const nonces = await sql`DELETE FROM upload_nonces WHERE created_at < ${nonceCutoff}`
      console.log(`[cleanup] Removed ${nonces.count} old nonces`)

      const uploads = await pruneUploadHistory(uploadDays, now)
      console.log(`[cleanup] Removed ${uploads} old upload requests`)

      // Clean expired device auth requests
      const authCutoff = new Date(now.getTime() - deviceAuthHours * 60 * 60 * 1000)
      const authReqs = await sql`DELETE FROM device_auth_requests WHERE expires_at < ${authCutoff}`
      console.log(`[cleanup] Removed ${authReqs.count} expired device auth requests`)

      // Clean expired password reset tokens
      const resetTokens = await sql`DELETE FROM password_reset_tokens WHERE expires_at < ${now}`
      console.log(`[cleanup] Removed ${resetTokens.count} expired password reset tokens`)

      console.log('[cleanup] Daily cleanup complete.')
    } catch (err) {
      console.error('[cleanup] Error during cleanup:', err)
    }
  })

  console.log('[cleanup] Cron job registered (daily at 03:00 UTC)')
}

// Deletes upload_requests older than the retention. Their upload_snapshots go
// with them; leaderboard_metrics rows stay (the foreign key is ON DELETE SET NULL).
// An upload with a snapshot an admin hid or rejected is kept: that review is
// what keeps its period off the leaderboard (admin/operations.ts), and deleting
// it would let a later approval of another snapshot publish the period again.
//
// Each user's history is pruned in a transaction of its own that holds the
// user's leaderboard lock, which the admin snapshot actions also take: a hide
// or reject either committed before the DELETE reads the snapshots (and is
// kept), or runs after the prune and finds the snapshot gone.
export async function pruneUploadHistory(retentionDays: number, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000)
  const users = await sql`SELECT DISTINCT user_id FROM upload_requests WHERE created_at < ${cutoff}`
  let removed = 0
  for (const row of users) {
    const userId = (row as { user_id: string }).user_id
    removed += await transaction(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(hashtextextended('leaderboard_metrics:' || ${userId}::text, 0))`
      const result = await tx`
        DELETE FROM upload_requests r
        WHERE r.user_id = ${userId}
          AND r.created_at < ${cutoff}
          AND NOT EXISTS (
            SELECT 1 FROM upload_snapshots s
            WHERE s.upload_request_id = r.id
              AND s.review_status IN ('hidden', 'rejected')
          )
      `
      return result.count
    })
  }
  return removed
}

type Sql = typeof sql
// pool.ts types `sql` as the query function alone; `begin` is forwarded to the
// postgres.js client at run time.
function transaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T> {
  return (sql as unknown as { begin(fn: (tx: Sql) => Promise<T>): Promise<T> }).begin(fn)
}
