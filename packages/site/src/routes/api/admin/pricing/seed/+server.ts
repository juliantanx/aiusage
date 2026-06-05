import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAdmin } from '$lib/server/auth/session.js'
import { seedPriceTable } from '$lib/server/admin/operations.js'

export const POST: RequestHandler = async (event) => {
  const admin = await requireAdmin(event)
  const body = await event.request.json() as { version: string; source_commit?: string }

  if (!body.version || typeof body.version !== 'string') {
    return json({ error: 'version is required' }, { status: 400 })
  }

  try {
    const result = await seedPriceTable(admin.id, body.version, body.source_commit)
    return json(result)
  } catch (err) {
    return json({ error: (err as Error).message }, { status: 400 })
  }
}
