import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { sql } from '$lib/server/db/pool.js'

const startTime = Date.now()

export const GET: RequestHandler = async () => {
  try {
    await sql`SELECT 1`
    return json({
      status: 'ok',
      db: 'connected',
      uptime: Math.floor((Date.now() - startTime) / 1000)
    })
  } catch {
    return json({ status: 'error', db: 'disconnected' }, { status: 503 })
  }
}
