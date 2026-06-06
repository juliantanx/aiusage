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
  let total
  if (q.trim()) {
    const pattern = `%${q.trim()}%`
    const [u, t] = await Promise.all([
      sql`
        SELECT id, username, display_name, email, role, status, created_at, banned_at, ban_reason
        FROM users
        WHERE username ILIKE ${pattern} OR display_name ILIKE ${pattern} OR email ILIKE ${pattern}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
      sql`SELECT COUNT(*)::INTEGER AS count FROM users WHERE username ILIKE ${pattern} OR display_name ILIKE ${pattern} OR email ILIKE ${pattern}`
    ])
    users = u
    total = (t[0] as { count: number }).count
  } else {
    const [u, t] = await Promise.all([
      sql`
        SELECT id, username, display_name, email, role, status, created_at, banned_at, ban_reason
        FROM users
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
      sql`SELECT COUNT(*)::INTEGER AS count FROM users`
    ])
    users = u
    total = (t[0] as { count: number }).count
  }

  return json({ users, total })
}
