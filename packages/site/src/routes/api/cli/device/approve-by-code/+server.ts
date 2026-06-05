import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { sql } from '$lib/server/db/pool.js'
import { requireUser } from '$lib/server/auth/session.js'

export const POST: RequestHandler = async (event) => {
  const user = await requireUser(event)
  const body = await event.request.json()
  const { user_code } = body

  if (!user_code) {
    return json({ error: 'Missing user_code' }, { status: 400 })
  }

  const requests = await sql`
    SELECT id, status, expires_at FROM device_auth_requests
    WHERE user_code = ${user_code} AND status = 'pending' AND expires_at > NOW()
  `
  const req = requests[0] as { id: string; status: string } | undefined

  if (!req) {
    return json({ error: 'Invalid or expired code' }, { status: 404 })
  }

  await sql`
    UPDATE device_auth_requests
    SET user_id = ${user.id}, status = 'approved', approved_at = NOW()
    WHERE id = ${req.id}
  `

  return json({ success: true })
}
