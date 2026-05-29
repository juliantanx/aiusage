import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { sql } from '$lib/server/db/pool.js'
import { requireUser } from '$lib/server/auth/session.js'

export const GET: RequestHandler = async (event) => {
  const user = await requireUser(event)

  const snapshots = await sql`
    SELECT s.period_type, s.period_start, s.period_end, s.total_tokens, s.status,
      s.reason_code, s.reason_message, s.review_status, s.created_at,
      d.name as device_name
    FROM upload_snapshots s
    JOIN user_devices d ON d.id = s.device_id
    WHERE s.user_id = ${user.id}
    ORDER BY s.created_at DESC
    LIMIT 100
  `

  return json({ snapshots })
}
