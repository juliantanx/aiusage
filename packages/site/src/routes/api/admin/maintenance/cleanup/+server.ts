import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { sql } from '$lib/server/db/pool.js'
import { requireAdmin } from '$lib/server/auth/session.js'
import { nanoid } from 'nanoid'

/**
 * POST /api/admin/maintenance/cleanup
 *
 * Cloud sync data maintenance (§12.4):
 * - Clean expired upload nonces
 * - Compact old tombstones
 * - Clean old generation cloud_usage_records
 * - Clean stale sync batches
 */
export const POST: RequestHandler = async (event) => {
  const admin = await requireAdmin(event)
  const body = await event.request.json().catch(() => ({}))

  const results: Record<string, number> = {}

  // 1. Clean expired upload nonces (older than 10 minutes)
  const nonceCleanup = await sql`
    DELETE FROM upload_nonces WHERE created_at < NOW() - INTERVAL '10 minutes'
  `
  results.nonces_cleaned = nonceCleanup.count ?? 0

  // 2. Clean stale sync batches (older than 30 days)
  const batchCleanup = await sql`
    DELETE FROM cloud_sync_batches WHERE created_at < NOW() - INTERVAL '30 days'
  `
  results.batches_cleaned = batchCleanup.count ?? 0

  // 3. Physically delete cloud_usage_records that have been tombstoned for > 90 days
  const tombstoneCleanup = await sql`
    DELETE FROM cloud_usage_records
    WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '90 days'
  `
  results.tombstoned_records_cleaned = tombstoneCleanup.count ?? 0

  // 4. Clean old generation records (records from generations older than current)
  // Get all users with resets
  const resets = await sql`SELECT user_id, sync_generation FROM cloud_sync_resets`
  let oldGenCleaned = 0
  for (const reset of resets) {
    const r = reset as { user_id: string; sync_generation: number }
    const result = await sql`
      DELETE FROM cloud_usage_records
      WHERE user_id = ${r.user_id} AND sync_generation < ${r.sync_generation}
    `
    oldGenCleaned += result.count ?? 0
  }
  results.old_generation_cleaned = oldGenCleaned

  // 5. Clean expired device auth requests
  const authCleanup = await sql`
    DELETE FROM device_auth_requests WHERE expires_at < NOW() AND status = 'pending'
  `
  results.expired_auth_requests_cleaned = authCleanup.count ?? 0

  // 6. Clean expired reserved usernames
  const usernameCleanup = await sql`
    DELETE FROM reserved_usernames WHERE reserved_until < NOW()
  `
  results.expired_reserved_usernames_cleaned = usernameCleanup.count ?? 0

  // Audit log
  const auditId = nanoid()
  await sql`
    INSERT INTO admin_audit_logs (id, admin_user_id, action, target_type, target_id, reason, metadata)
    VALUES (${auditId}, ${admin.id}, 'maintenance_cleanup', 'system', 'cleanup', ${body.reason || null}, ${JSON.stringify(results)}::jsonb)
  `

  return json({ status: 'completed', results })
}
