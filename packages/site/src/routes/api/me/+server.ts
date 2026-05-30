import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { sql } from '$lib/server/db/pool.js'
import { requireUser } from '$lib/server/auth/session.js'

export const GET: RequestHandler = async (event) => {
  const user = await requireUser(event)

  const rows = await sql`SELECT password_hash FROM users WHERE id = ${user.id}`
  const hasPassword = rows[0] ? (rows[0] as { password_hash: string | null }).password_hash != null : false

  return json({
    id: user.id,
    username: user.username,
    email: user.email,
    display_name: user.display_name,
    avatar_url: user.avatar_url,
    role: user.role,
    has_password: hasPassword
  })
}
