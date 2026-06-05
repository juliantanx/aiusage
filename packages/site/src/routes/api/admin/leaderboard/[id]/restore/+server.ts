import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAdmin } from '$lib/server/auth/session.js'
import { restoreLeaderboardEntry } from '$lib/server/admin/operations.js'

export const POST: RequestHandler = async (event) => {
  const admin = await requireAdmin(event)
  await restoreLeaderboardEntry(admin.id, event.params.id)
  return json({ success: true })
}
