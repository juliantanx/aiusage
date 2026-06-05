import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { sql } from '$lib/server/db/pool.js'
import { hashPassword, validateUsername, validateEmail, validatePassword } from '$lib/server/auth/password.js'
import {
  checkVerificationEmailRateLimit,
  createEmailVerification,
  recordVerificationEmailAttempt,
  sendVerificationEmail
} from '$lib/server/auth/email-verification.js'
import { nanoid } from 'nanoid'

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  const body = await request.json()
  const username = String(body.username || '').trim()
  const email = String(body.email || '').trim().toLowerCase()
  const password = body.password

  const usernameError = validateUsername(username)
  if (usernameError) return json({ error: usernameError }, { status: 400 })

  const emailError = validateEmail(email)
  if (emailError) return json({ error: emailError }, { status: 400 })

  const passwordError = validatePassword(password)
  if (passwordError) return json({ error: passwordError }, { status: 400 })

  const ip = getClientAddress()
  const rateLimitError = await checkVerificationEmailRateLimit(ip, email)
  if (rateLimitError) return json({ error: rateLimitError }, { status: 429 })

  // Check uniqueness
  const existingUser = await sql`SELECT id FROM users WHERE username = ${username} OR email = ${email}`
  if (existingUser[0]) {
    return json({ error: 'Username or email already taken' }, { status: 409 })
  }

  const userId = nanoid()
  const passwordHash = await hashPassword(password)

  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO users (id, username, email, email_verified, display_name, password_hash, role, status)
      VALUES (${userId}, ${username}, ${email}, FALSE, ${username}, ${passwordHash}, 'user', 'active')
    `
  })

  const verificationUrl = await createEmailVerification(userId, email)
  try {
    await sendVerificationEmail(email, username, verificationUrl)
    await recordVerificationEmailAttempt(ip, email)
  } catch (err) {
    console.error('Failed to send verification email:', err)
    await sql`DELETE FROM users WHERE id = ${userId}`
    return json({ error: 'Failed to send verification email' }, { status: 500 })
  }

  return json({
    success: true,
    requires_email_verification: true,
    message: 'Check your email to verify your account'
  })
}
