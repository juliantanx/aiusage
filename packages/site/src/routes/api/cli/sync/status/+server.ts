import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getConfigValue, CFG } from '$lib/server/config.js'

export const GET: RequestHandler = async () => {
  const globalEnabled = await getConfigValue(CFG.CLOUD_SYNC_GLOBALLY_ENABLED)
  return json({ enabled: globalEnabled === 1 })
}
