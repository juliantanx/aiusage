import { sql } from './pool.js'
import cron from 'node-cron'

export function startCleanupCron(): void {
  // Run daily at 03:00 UTC
  cron.schedule('0 3 * * *', async () => {
    console.log('[cleanup] Starting daily cleanup...')
    try {
      const now = new Date()

      // Clean expired sessions
      const sessions = await sql`DELETE FROM sessions WHERE expires_at < ${now}`
      console.log(`[cleanup] Removed ${sessions.count} expired sessions`)

      // Clean old nonces (24h)
      const nonceCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      const nonces = await sql`DELETE FROM upload_nonces WHERE created_at < ${nonceCutoff}`
      console.log(`[cleanup] Removed ${nonces.count} old nonces`)

      // Clean old upload_requests (180 days)
      const uploadCutoff = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000)
      const uploads = await sql`DELETE FROM upload_requests WHERE created_at < ${uploadCutoff}`
      console.log(`[cleanup] Removed ${uploads.count} old upload requests`)

      // Clean expired device auth requests (1h)
      const authCutoff = new Date(now.getTime() - 60 * 60 * 1000)
      const authReqs = await sql`DELETE FROM device_auth_requests WHERE expires_at < ${authCutoff}`
      console.log(`[cleanup] Removed ${authReqs.count} expired device auth requests`)

      console.log('[cleanup] Daily cleanup complete.')
    } catch (err) {
      console.error('[cleanup] Error during cleanup:', err)
    }
  })

  console.log('[cleanup] Cron job registered (daily at 03:00 UTC)')
}
