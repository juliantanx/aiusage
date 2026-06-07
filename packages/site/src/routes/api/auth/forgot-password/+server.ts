import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { sql } from '$lib/server/db/pool.js'
import {
  checkPasswordResetRateLimit,
  createPasswordResetToken,
  recordPasswordResetAttempt,
  sendPasswordResetEmail
} from '$lib/server/auth/email-verification.js'

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  const body = await request.json()
  const email = String(body.email || '').trim().toLowerCase()

  if (!email) {
    return json({ error: 'email_required' }, { status: 400 })
  }

  const ip = getClientAddress()
  const rateLimitError = await checkPasswordResetRateLimit(ip, email)
  if (rateLimitError) {
    return json({ error: rateLimitError.code }, { status: 429 })
  }

  const users = await sql`
    SELECT id, username, email_verified
    FROM users
    WHERE email = ${email} AND password_hash IS NOT NULL
  `
  const user = users[0] as { id: string; username: string; email_verified: boolean } | undefined

  // Always return success to prevent email enumeration
  if (!user || !user.email_verified) {
    return json({ success: true })
  }

  try {
    const resetUrl = await createPasswordResetToken(user.id)
    await sendPasswordResetEmail(email, user.username, resetUrl)
    await recordPasswordResetAttempt(ip, email)
  } catch (err) {
    console.error('Failed to send password reset email:', err)
  }

  return json({ success: true })
}
