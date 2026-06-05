import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAdmin } from '$lib/server/auth/session.js'
import { sql } from '$lib/server/db/pool.js'

export const GET: RequestHandler = async (event) => {
  await requireAdmin(event)
  const q = event.url.searchParams.get('q') || ''
  const limit = Math.min(parseInt(event.url.searchParams.get('limit') || '20'), 100)
  const offset = Math.max(parseInt(event.url.searchParams.get('offset') || '0'), 0)

  let users
  if (q.trim()) {
    const pattern = `%${q.trim()}%`
    users = await sql`
      SELECT id, username, display_name, email, role, status, created_at, banned_at, ban_reason
      FROM users
      WHERE username ILIKE ${pattern} OR display_name ILIKE ${pattern} OR email ILIKE ${pattern}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `
  } else {
    users = await sql`
      SELECT id, username, display_name, email, role, status, created_at, banned_at, ban_reason
      FROM users
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `
  }

  return json({ users })
}
