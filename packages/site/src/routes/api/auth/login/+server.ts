import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { sql } from '$lib/server/db/pool.js'
import { verifyPassword } from '$lib/server/auth/password.js'
import { createSession } from '$lib/server/auth/session.js'

export const POST: RequestHandler = async ({ request, cookies }) => {
  const body = await request.json()
  const { login, password } = body

  if (!login || !password) {
    return json({ error: 'Login and password are required' }, { status: 400 })
  }

  // Find user by username or email
  const users = await sql`
    SELECT id, username, email, display_name, avatar_url, role, status, password_hash
    FROM users
    WHERE (username = ${login} OR email = ${login}) AND password_hash IS NOT NULL
  `
  const user = users[0] as { id: string; username: string; email: string; display_name: string; avatar_url: string | null; role: string; status: string; password_hash: string } | undefined

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return json({ error: 'Invalid credentials' }, { status: 401 })
  }

  if (user.status === 'banned') {
    return json({ error: 'user_banned', message: 'Your account has been banned' }, { status: 403 })
  }

  const sid = await createSession(user.id)
  cookies.set('ai_session', sid, {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 604800
  })

  return json({
    success: true,
    user: { id: user.id, username: user.username, email: user.email, display_name: user.display_name, avatar_url: user.avatar_url, role: user.role }
  })
}
