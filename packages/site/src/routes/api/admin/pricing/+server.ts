import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAdmin } from '$lib/server/auth/session.js'
import { getPriceEntries, updatePriceEntries, addPriceEntry, deletePriceEntry, syncPricingFromCore } from '$lib/server/admin/operations.js'

export const GET: RequestHandler = async (event) => {
  const admin = await requireAdmin(event)
  const { entries } = await getPriceEntries(admin.id)
  return json({ entries })
}

export const PUT: RequestHandler = async (event) => {
  const admin = await requireAdmin(event)
  const body = await event.request.json() as {
    updates?: Array<{ id: string; input: number; output: number; cache_read: number | null; cache_write: number | null }>
  }

  if (!body.updates || !Array.isArray(body.updates) || body.updates.length === 0) {
    return json({ error: 'No updates provided' }, { status: 400 })
  }

  try {
    await updatePriceEntries(admin.id, body.updates)
    return json({ success: true })
  } catch (err) {
    return json({ error: (err as Error).message }, { status: 400 })
  }
}

export const POST: RequestHandler = async (event) => {
  const admin = await requireAdmin(event)
  const body = await event.request.json() as {
    model_key: string; input: number; output: number;
    cache_read: number | null; cache_write: number | null; currency?: string
  }

  if (!body.model_key || body.input == null || body.output == null) {
    return json({ error: 'model_key, input, and output are required' }, { status: 400 })
  }

  try {
    const entryId = await addPriceEntry(admin.id, {
      model_key: body.model_key,
      input: body.input,
      output: body.output,
      cache_read: body.cache_read ?? null,
      cache_write: body.cache_write ?? null,
      currency: body.currency || 'USD',
    })
    return json({ id: entryId })
  } catch (err) {
    const msg = (err as Error).message
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return json({ error: 'Model already exists' }, { status: 409 })
    }
    return json({ error: msg }, { status: 400 })
  }
}

export const DELETE: RequestHandler = async (event) => {
  const admin = await requireAdmin(event)
  const body = await event.request.json() as { entry_id: string; model_key: string }

  if (!body.entry_id) {
    return json({ error: 'entry_id is required' }, { status: 400 })
  }

  try {
    await deletePriceEntry(admin.id, body.entry_id, body.model_key || 'unknown')
    return json({ success: true })
  } catch (err) {
    return json({ error: (err as Error).message }, { status: 400 })
  }
}
