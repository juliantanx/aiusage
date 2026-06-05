import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { sql } from '$lib/server/db/pool.js'
import { requireUser } from '$lib/server/auth/session.js'

export const GET: RequestHandler = async (event) => {
  const user = await requireUser(event)

  try {
    const devices = await sql`
      SELECT id, name, status, created_at, last_used_at, revoked_at
      FROM (
        SELECT id, name, status, created_at, last_used_at, revoked_at,
          ROW_NUMBER() OVER (PARTITION BY name ORDER BY created_at DESC) AS rn
        FROM user_devices
        WHERE user_id = ${user.id}
      ) ranked
      WHERE rn = 1
      ORDER BY created_at DESC
    `

    return json({ devices })
  } catch (err) {
    console.error('GET /api/me/devices failed:', err)
    return json({ devices: [] })
  }
}
