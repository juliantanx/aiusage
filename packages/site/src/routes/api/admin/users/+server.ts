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
        SELECT u.id, u.username, u.display_name, u.email, u.role, u.status,
               u.created_at, u.banned_at, u.ban_reason,
               u.cloud_sync_enabled, u.github_starred,
               gi.provider_username AS github_username
        FROM users u
        LEFT JOIN user_identities gi ON gi.user_id = u.id AND gi.provider = 'github'
        WHERE u.username ILIKE ${pattern} OR u.display_name ILIKE ${pattern} OR u.email ILIKE ${pattern}
        ORDER BY u.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
      sql`SELECT COUNT(*)::INTEGER AS count FROM users WHERE username ILIKE ${pattern} OR display_name ILIKE ${pattern} OR email ILIKE ${pattern}`
    ])
    users = u
    total = (t[0] as { count: number }).count
  } else {
    const [u, t] = await Promise.all([
      sql`
        SELECT u.id, u.username, u.display_name, u.email, u.role, u.status,
               u.created_at, u.banned_at, u.ban_reason,
               u.cloud_sync_enabled, u.github_starred,
               gi.provider_username AS github_username
        FROM users u
        LEFT JOIN user_identities gi ON gi.user_id = u.id AND gi.provider = 'github'
        ORDER BY u.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
      sql`SELECT COUNT(*)::INTEGER AS count FROM users`
    ])
    users = u
    total = (t[0] as { count: number }).count
  }

  return json({ users, total })
}
