import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAdmin } from '$lib/server/auth/session.js'
import { getPriceTables } from '$lib/server/admin/operations.js'

export const GET: RequestHandler = async (event) => {
  await requireAdmin(event)
  const limit = parseInt(event.url.searchParams.get('limit') || '50')
  const offset = parseInt(event.url.searchParams.get('offset') || '0')

  const tables = await getPriceTables(limit, offset)
  return json({ tables })
}
