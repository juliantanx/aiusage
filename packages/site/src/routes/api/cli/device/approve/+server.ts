import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { sql } from '$lib/server/db/pool.js'
import { requireUser } from '$lib/server/auth/session.js'

export const POST: RequestHandler = async (event) => {
  const user = await requireUser(event)
  const body = await event.request.json()
  const { device_request_id } = body

  if (!device_request_id) {
    return json({ error: 'Missing device_request_id' }, { status: 400 })
  }

  const requests = await sql`
    SELECT id, status, expires_at FROM device_auth_requests
    WHERE id = ${device_request_id} AND status = 'pending' AND expires_at > NOW()
  `
  const req = requests[0] as { id: string; status: string } | undefined

  if (!req) {
    return json({ error: 'Invalid or expired request' }, { status: 404 })
  }

  await sql`
    UPDATE device_auth_requests
    SET user_id = ${user.id}, status = 'approved', approved_at = NOW()
    WHERE id = ${device_request_id}
  `

  return json({ success: true })
}
