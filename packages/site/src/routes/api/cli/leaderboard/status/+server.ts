import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { sql } from '$lib/server/db/pool.js'
import { verifyUploadRequest } from '$lib/server/uploads/verify.js'

export const GET: RequestHandler = async ({ request }) => {
  const verification = await verifyUploadRequest(request, '')
  if (!verification.valid) {
    return json({ error: verification.error, error_code: verification.error_code }, { status: 401 })
  }

  try {
    const snapshots = await sql`
      SELECT s.period_type, s.period_start, s.period_end, s.total_tokens, s.status,
        s.reason_code, s.reason_message, s.review_status, s.created_at,
        d.name as device_name
      FROM upload_snapshots s
      JOIN user_devices d ON d.id = s.device_id
      WHERE s.user_id = ${verification.userId}
      ORDER BY s.created_at DESC
      LIMIT 100
    `

    return json({ snapshots })
  } catch (err) {
    console.error('GET /api/cli/leaderboard/status failed:', err)
    return json({ snapshots: [] })
  }
}
