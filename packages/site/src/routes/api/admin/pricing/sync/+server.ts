import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAdmin } from '$lib/server/auth/session.js'
import { syncPricingFromCore } from '$lib/server/admin/operations.js'

export const POST: RequestHandler = async (event) => {
  const admin = await requireAdmin(event)

  try {
    const result = await syncPricingFromCore(admin.id)
    return json(result)
  } catch (err) {
    return json({ error: (err as Error).message }, { status: 400 })
  }
}
