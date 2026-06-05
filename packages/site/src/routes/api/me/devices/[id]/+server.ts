import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { sql } from '$lib/server/db/pool.js'
import { requireUser } from '$lib/server/auth/session.js'

export const PATCH: RequestHandler = async (event) => {
  const user = await requireUser(event)
  const deviceId = event.params.id
  const body = await event.request.json()

  const devices = await sql`
    SELECT id, status FROM user_devices WHERE id = ${deviceId} AND user_id = ${user.id}
  `
  if (!devices[0]) {
    return json({ error: 'Device not found' }, { status: 404 })
  }

  if (body.name && typeof body.name === 'string' && body.name.trim()) {
    await sql`UPDATE user_devices SET name = ${body.name.trim()} WHERE id = ${deviceId}`
  }

  return json({ success: true })
}

export const DELETE: RequestHandler = async (event) => {
  const user = await requireUser(event)
  const deviceId = event.params.id
  const url = event.url
  const deleteData = url.searchParams.get('delete_data') === 'true'

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

  await sql.begin(async (tx) => {
    // Revoke device
    await tx`UPDATE user_devices SET status = 'revoked', revoked_at = NOW() WHERE id = ${deviceId}`

    // Delete cloud sync data for this device if requested
    if (deleteData) {
      await tx`
        UPDATE cloud_usage_records
        SET deleted_at = NOW(), server_updated_at = NOW()
        WHERE user_id = ${user.id} AND device_id = ${deviceId} AND deleted_at IS NULL
      `
    }
  })

  return json({ success: true, data_deleted: deleteData })
}
