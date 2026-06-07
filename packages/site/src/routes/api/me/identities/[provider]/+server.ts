import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getSessionUser } from '$lib/server/auth/session.js'
import { sql } from '$lib/server/db/pool.js'

export const DELETE: RequestHandler = async ({ cookies, params }) => {
  const sid = cookies.get('ai_session')
  if (!sid) return json({ error: 'Not authenticated' }, { status: 401 })

  const user = await getSessionUser(sid)
  if (!user) return json({ error: 'Not authenticated' }, { status: 401 })

  const { provider } = params
  if (!['github', 'linux_do'].includes(provider)) {
    return json({ error: 'Invalid provider' }, { status: 400 })
  }

  const deleted = await sql`
    DELETE FROM user_identities
    WHERE user_id = ${user.id} AND provider = ${provider}
    RETURNING provider
  `

  if (deleted.length === 0) {
    return json({ error: 'Identity not found' }, { status: 404 })
  }

  return json({ ok: true, provider })
}
