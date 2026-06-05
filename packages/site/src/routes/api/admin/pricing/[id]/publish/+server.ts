import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAdmin } from '$lib/server/auth/session.js'
import { publishPriceTable } from '$lib/server/admin/operations.js'

export const POST: RequestHandler = async (event) => {
  const admin = await requireAdmin(event)
  const { id } = event.params
  const body = await event.request.json().catch(() => ({})) as { note?: string }

  try {
    await publishPriceTable(admin.id, id, body.note)
    return json({ success: true })
  } catch (err) {
    return json({ error: (err as Error).message }, { status: 400 })
  }
}
