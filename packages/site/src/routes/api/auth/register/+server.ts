import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { sql } from '$lib/server/db/pool.js'
import { hashPassword, validateUsername, validateEmail, validatePassword } from '$lib/server/auth/password.js'
import { createSession } from '$lib/server/auth/session.js'
import { maybeGrantAdmin } from '$lib/server/oauth/providers.js'
import { nanoid } from 'nanoid'

export const POST: RequestHandler = async ({ request, cookies }) => {
  const body = await request.json()
  const { username, email, password } = body

  const usernameError = validateUsername(username)
  if (usernameError) return json({ error: usernameError }, { status: 400 })

  const emailError = validateEmail(email)
  if (emailError) return json({ error: emailError }, { status: 400 })

  const passwordError = validatePassword(password)
  if (passwordError) return json({ error: passwordError }, { status: 400 })

  // Check uniqueness
  const existingUser = await sql`SELECT id FROM users WHERE username = ${username} OR email = ${email}`
  if (existingUser[0]) {
    return json({ error: 'Username or email already taken' }, { status: 409 })
  }

  const userId = nanoid()
  const passwordHash = await hashPassword(password)

  await sql`
    INSERT INTO users (id, username, email, display_name, password_hash, role, status)
    VALUES (${userId}, ${username}, ${email}, ${username}, ${passwordHash}, 'user', 'active')
  `

  // Check admin emails
  await maybeGrantAdmin(userId, email)

  const sid = await createSession(userId)
  cookies.set('ai_session', sid, {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 604800
  })

  return json({ success: true, user: { id: userId, username, email, display_name: username } })
}
