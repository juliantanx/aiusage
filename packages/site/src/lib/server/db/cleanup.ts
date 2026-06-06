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

      // Clean old upload_requests
      const uploadCutoff = new Date(now.getTime() - uploadDays * 24 * 60 * 60 * 1000)
      const uploads = await sql`DELETE FROM upload_requests WHERE created_at < ${uploadCutoff}`
      console.log(`[cleanup] Removed ${uploads.count} old upload requests`)

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
