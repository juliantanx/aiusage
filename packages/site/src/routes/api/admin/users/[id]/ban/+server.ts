import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAdmin } from '$lib/server/auth/session.js'
import { banUser } from '$lib/server/admin/operations.js'

export const POST: RequestHandler = async (event) => {
  const admin = await requireAdmin(event)
  const body = await event.request.json()
  await banUser(admin.id, event.params.id, body.reason || 'No reason provided')
  return json({ success: true })
}
