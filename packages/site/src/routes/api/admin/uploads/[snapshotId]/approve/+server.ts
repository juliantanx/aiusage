import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAdmin } from '$lib/server/auth/session.js'
import { approveSnapshot } from '$lib/server/admin/operations.js'

export const POST: RequestHandler = async (event) => {
  const admin = await requireAdmin(event)
  const body = await event.request.json()
  await approveSnapshot(admin.id, event.params.snapshotId, body.note)
  return json({ success: true })
}
