import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { sql } from '$lib/server/db/pool.js'
import { requireUser } from '$lib/server/auth/session.js'
import { nanoid } from 'nanoid'

export const POST: RequestHandler = async (event) => {
  const user = await requireUser(event)

  // Get current generation
  const reset = await sql`SELECT sync_generation FROM cloud_sync_resets WHERE user_id = ${user.id}`
  const currentGeneration = reset.length > 0 ? (reset[0] as { sync_generation: number }).sync_generation : 1
  const newGeneration = currentGeneration + 1

  // Get max change_seq before clear
  const maxSeq = await sql`SELECT MAX(change_seq) as max_seq FROM cloud_usage_records WHERE user_id = ${user.id}`
  const clearBeforeChangeSeq = (maxSeq[0] as { max_seq: number | null })?.max_seq || 0

  // Increment generation and mark all records as deleted
  await sql.begin(async (tx) => {
    // Mark all records as deleted
    await tx`
      UPDATE cloud_usage_records
      SET deleted_at = NOW(), server_updated_at = NOW()
      WHERE user_id = ${user.id} AND deleted_at IS NULL
    `

    // Update or create reset record
    await tx`
      INSERT INTO cloud_sync_resets (user_id, sync_generation, clear_before_change_seq, reset_at)
      VALUES (${user.id}, ${newGeneration}, ${clearBeforeChangeSeq}, NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET
        sync_generation = ${newGeneration},
        clear_before_change_seq = ${clearBeforeChangeSeq},
        reset_at = NOW()
    `

    // Update all device instances to new generation
    await tx`
      UPDATE cloud_device_instances
      SET sync_generation = ${newGeneration}, updated_at = NOW()
      WHERE user_id = ${user.id}
    `
  })

  return json({
    status: 'cleared',
    sync_generation: newGeneration,
    clear_before_change_seq: clearBeforeChangeSeq
  })
}
