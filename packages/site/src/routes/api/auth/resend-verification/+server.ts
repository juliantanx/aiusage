import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { sql } from '$lib/server/db/pool.js'
import {
  checkVerificationEmailRateLimit,
  createEmailVerification,
  recordVerificationEmailAttempt,
  sendVerificationEmail
} from '$lib/server/auth/email-verification.js'

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  const body = await request.json()
  const email = String(body.email || '').trim().toLowerCase()

  if (!email) {
    return json({ error: 'Email is required' }, { status: 400 })
  }

  const ip = getClientAddress()
  const rateLimitError = await checkVerificationEmailRateLimit(ip, email)
  if (rateLimitError) {
    return json({ error: rateLimitError }, { status: 429 })
  }

  const users = await sql`
    SELECT id, username, email_verified
    FROM users
    WHERE email = ${email}
  `
  const user = users[0] as { id: string; username: string; email_verified: boolean } | undefined

  if (!user) {
    return json({ success: true, message: 'If an account exists, a verification email has been sent' })
  }

  if (user.email_verified) {
    return json({ error: 'Email is already verified' }, { status: 400 })
  }

  const verificationUrl = await createEmailVerification(user.id, email)
  try {
    await sendVerificationEmail(email, user.username, verificationUrl)
    await recordVerificationEmailAttempt(ip, email)
  } catch (err) {
    console.error('Failed to resend verification email:', err)
    return json({ error: 'Failed to send verification email' }, { status: 500 })
  }

  return json({ success: true, message: 'If an account exists, a verification email has been sent' })
}
