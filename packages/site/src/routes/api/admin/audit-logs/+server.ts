import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAdmin } from '$lib/server/auth/session.js'
import { getAdminAuditLogs } from '$lib/server/admin/operations.js'

export const GET: RequestHandler = async (event) => {
  await requireAdmin(event)
  const limit = Math.min(parseInt(event.url.searchParams.get('limit') || '50'), 200)
  const offset = Math.max(parseInt(event.url.searchParams.get('offset') || '0'), 0)

  const logs = await getAdminAuditLogs(limit, offset)
  return json({ logs })
}
