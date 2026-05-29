import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { sql } from '$lib/server/db/pool.js'
import { requireUser } from '$lib/server/auth/session.js'

export const DELETE: RequestHandler = async (event) => {
  const user = await requireUser(event)
  const deviceId = event.params.id

  const devices = await sql`
    SELECT id, status FROM user_devices WHERE id = ${deviceId} AND user_id = ${user.id}
  `
  const device = devices[0] as { id: string; status: string } | undefined

  if (!device) {
    return json({ error: 'Device not found' }, { status: 404 })
  }

  if (device.status === 'revoked') {
    return json({ error: 'Device already revoked' }, { status: 400 })
  }

  await sql`UPDATE user_devices SET status = 'revoked', revoked_at = NOW() WHERE id = ${deviceId}`
  return json({ success: true })
}
