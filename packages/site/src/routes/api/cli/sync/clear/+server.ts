import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { sql } from '$lib/server/db/pool.js'
import { verifyUploadRequest } from '$lib/server/uploads/verify.js'
import { checkCloudSyncAccess } from '$lib/server/cloud/star-check.js'

export const POST: RequestHandler = async ({ request }) => {
  const bodyText = '{}'

  // Verify HMAC signature
  const verification = await verifyUploadRequest(request, bodyText)
  if (!verification.valid) {
    const status = verification.error_code === 'rate_limited' ? 429 : 401
    return json({ error: verification.error, error_code: verification.error_code }, { status })
  }

  const userId = verification.userId!

  // Star gate check
  const starCheck = await checkCloudSyncAccess(userId)
  if (!starCheck.allowed) {
    return json({
      error: { code: starCheck.error_code, message: starCheck.message, repo: starCheck.repo, url: starCheck.url }
    }, { status: 403 })
  }

  // Get current generation
  const reset = await sql`SELECT sync_generation FROM cloud_sync_resets WHERE user_id = ${userId}`
  const currentGeneration = reset.length > 0 ? (reset[0] as { sync_generation: number }).sync_generation : 1
  const newGeneration = currentGeneration + 1

  // Get max change_seq before clear
  const maxSeq = await sql`SELECT MAX(change_seq) as max_seq FROM cloud_usage_records WHERE user_id = ${userId}`
  const clearBeforeChangeSeq = (maxSeq[0] as { max_seq: number | null })?.max_seq || 0

  // Increment generation and mark all records as deleted
  await sql.begin(async (tx) => {
    await tx`
      UPDATE cloud_usage_records
      SET deleted_at = NOW(), server_updated_at = NOW()
      WHERE user_id = ${userId} AND deleted_at IS NULL
    `

    await tx`
      INSERT INTO cloud_sync_resets (user_id, sync_generation, clear_before_change_seq, reset_at)
      VALUES (${userId}, ${newGeneration}, ${clearBeforeChangeSeq}, NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET
        sync_generation = ${newGeneration},
        clear_before_change_seq = ${clearBeforeChangeSeq},
        reset_at = NOW()
    `

    await tx`
      UPDATE cloud_device_instances
      SET sync_generation = ${newGeneration}, updated_at = NOW()
      WHERE user_id = ${userId}
    `
  })

  return json({
    status: 'cleared',
    sync_generation: newGeneration,
    clear_before_change_seq: clearBeforeChangeSeq
  })
}
