import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAdmin } from '$lib/server/auth/session.js'
import { setUserRole } from '$lib/server/admin/operations.js'
import { sql } from '$lib/server/db/pool.js'

export const POST: RequestHandler = async (event) => {
  const admin = await requireAdmin(event)
  const targetId = event.params.id
  const body = await event.request.json()

  if (!['user', 'admin'].includes(body.role)) {
    return json({ error: 'Invalid role' }, { status: 400 })
  }

  if (targetId === admin.id) {
    return json({ error: 'Cannot change your own role' }, { status: 403 })
  }

  if (body.role !== 'admin') {
    const admins = await sql`SELECT COUNT(*)::int AS count FROM users WHERE role = 'admin' AND id != ${targetId}`
    if (admins[0].count < 1) {
      return json({ error: 'Cannot remove the last admin' }, { status: 403 })
    }
  }

  await setUserRole(admin.id, targetId, body.role)
  return json({ success: true })
}
