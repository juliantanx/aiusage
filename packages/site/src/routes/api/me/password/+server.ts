import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { sql } from '$lib/server/db/pool.js'
import { hashPassword, verifyPassword, validatePassword } from '$lib/server/auth/password.js'
import { requireUser } from '$lib/server/auth/session.js'

export const PUT: RequestHandler = async (event) => {
  const user = await requireUser(event)
  const body = await event.request.json()
  const { current_password, new_password } = body

  const passwordError = await validatePassword(new_password)
  if (passwordError) return json({ error: passwordError.code, params: passwordError.params }, { status: 400 })

  // Check if user already has a password
  const rows = await sql`SELECT password_hash FROM users WHERE id = ${user.id}`
  const existing = rows[0] as { password_hash: string | null } | undefined
  const hasExistingPassword = existing?.password_hash != null

  if (hasExistingPassword) {
    if (!current_password) {
      return json({ error: 'current_password_required' }, { status: 400 })
    }
    const valid = await verifyPassword(current_password, existing!.password_hash!)
    if (!valid) {
      return json({ error: 'current_password_incorrect' }, { status: 403 })
    }
  }

  const newHash = await hashPassword(new_password)
  await sql`UPDATE users SET password_hash = ${newHash}, updated_at = NOW() WHERE id = ${user.id}`

  return json({ success: true })
}
