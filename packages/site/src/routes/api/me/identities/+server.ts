import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getSessionUser } from '$lib/server/auth/session.js'
import { sql } from '$lib/server/db/pool.js'

export const GET: RequestHandler = async ({ cookies }) => {
  const sid = cookies.get('ai_session')
  if (!sid) return json({ error: 'Not authenticated' }, { status: 401 })

  const user = await getSessionUser(sid)
  if (!user) return json({ error: 'Not authenticated' }, { status: 401 })

  const rows = await sql`
    SELECT provider, provider_username AS username, email, created_at
    FROM user_identities
    WHERE user_id = ${user.id}
    ORDER BY created_at ASC
  `

  return json({ identities: rows })
}
