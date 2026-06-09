import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getPublicPriceEntries } from '$lib/server/admin/operations.js'

export const GET: RequestHandler = async () => {
  const { entries } = await getPublicPriceEntries()
  return json({ entries })
}
