import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAdmin } from '$lib/server/auth/session.js'
import { archivePriceTable } from '$lib/server/admin/operations.js'

export const POST: RequestHandler = async (event) => {
  const admin = await requireAdmin(event)
  const { id } = event.params

  try {
    await archivePriceTable(admin.id, id)
    return json({ success: true })
  } catch (err) {
    return json({ error: (err as Error).message }, { status: 400 })
  }
}
