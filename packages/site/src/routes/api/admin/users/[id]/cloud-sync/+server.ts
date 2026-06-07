import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAdmin } from '$lib/server/auth/session.js'
import { setCloudSync } from '$lib/server/admin/operations.js'

export const POST: RequestHandler = async (event) => {
  const admin = await requireAdmin(event)
  const targetUserId = event.params.id

  const body = await event.request.json() as { enabled?: boolean }
  if (typeof body.enabled !== 'boolean') {
    return json({ error: 'Missing or invalid "enabled" field' }, { status: 400 })
  }

  await setCloudSync(admin.id, targetUserId, body.enabled)
  return json({ ok: true })
}
