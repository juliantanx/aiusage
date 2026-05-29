import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { sql } from '$lib/server/db/pool.js'
import { requireUser } from '$lib/server/auth/session.js'

export const GET: RequestHandler = async (event) => {
  const user = await requireUser(event)

  const devices = await sql`
    SELECT id, name, status, created_at, last_used_at, revoked_at
    FROM user_devices
    WHERE user_id = ${user.id}
    ORDER BY created_at DESC
  `

  return json({ devices })
}
