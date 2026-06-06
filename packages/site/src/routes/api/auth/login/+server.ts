import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { sql } from '$lib/server/db/pool.js'
import { verifyPassword } from '$lib/server/auth/password.js'
import { createSession, setSessionCookie } from '$lib/server/auth/session.js'
import { maybeGrantAdmin } from '$lib/server/oauth/providers.js'

export const POST: RequestHandler = async ({ request, cookies }) => {
  const body = await request.json()
  const { login, password } = body

  if (!login || !password) {
    return json({ error: 'Login and password are required' }, { status: 400 })
  }

  // Find user by username or email
  const users = await sql`
    SELECT id, username, email, email_verified, display_name, avatar_url, role, status, password_hash, ban_reason
    FROM users
    WHERE (username = ${login} OR email = ${login}) AND password_hash IS NOT NULL
  `
  const user = users[0] as { id: string; username: string; email: string; email_verified: boolean; display_name: string; avatar_url: string | null; role: string; status: string; password_hash: string; ban_reason: string | null } | undefined

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return json({ error: 'Invalid credentials' }, { status: 401 })
  }

  if (!user.email_verified) {
    return json({ error: 'email_not_verified', message: 'Please verify your email before signing in' }, { status: 403 })
  }

  if (user.status === 'banned') {
    return json({ error: 'user_banned', message: 'Your account has been banned', ban_reason: user.ban_reason }, { status: 403 })
  }

  await maybeGrantAdmin(user.id, user.email)

  // Re-fetch role in case it was just updated
  const updated = await sql`SELECT role FROM users WHERE id = ${user.id}`
  const role = (updated[0] as { role: string } | undefined)?.role ?? user.role

  const sid = await createSession(user.id)
  await setSessionCookie(cookies, sid)

  return json({
    success: true,
    user: { id: user.id, username: user.username, email: user.email, display_name: user.display_name, avatar_url: user.avatar_url, role }
  })
}
