import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAdmin } from '$lib/server/auth/session.js'
import { setUserRole } from '$lib/server/admin/operations.js'

export const POST: RequestHandler = async (event) => {
  const admin = await requireAdmin(event)
  const body = await event.request.json()
  if (!['user', 'admin'].includes(body.role)) {
    return json({ error: 'Invalid role' }, { status: 400 })
  }
  await setUserRole(admin.id, event.params.id, body.role)
  return json({ success: true })
}
