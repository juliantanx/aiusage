import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { sql } from '$lib/server/db/pool.js'
import { requireUser } from '$lib/server/auth/session.js'

const USERNAME_COOLDOWN_DAYS = 30

export const PUT: RequestHandler = async (event) => {
  const user = await requireUser(event)
  const body = await event.request.json() as Record<string, unknown>

  const updates: Record<string, string> = {}
  let usernameChanged = false

  // username
  if (body.username !== undefined) {
    const username = String(body.username).trim()
    if (username.length < 3 || username.length > 32) {
      return json({ error: 'username_length', error_key: 'username_length' }, { status: 400 })
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      return json({ error: 'username_format', error_key: 'username_format' }, { status: 400 })
    }
    if (username !== user.username) {
      // Check cooldown
      const userRow = await sql`SELECT username_changed_at FROM users WHERE id = ${user.id}`
      const lastChanged = (userRow[0] as { username_changed_at: string | null })?.username_changed_at
      if (lastChanged) {
        const cooldownEnd = new Date(new Date(lastChanged).getTime() + USERNAME_COOLDOWN_DAYS * 24 * 60 * 60 * 1000)
        if (cooldownEnd > new Date()) {
          return json({
            error: 'username_cooldown',
            error_key: 'username_cooldown',
            cooldown_until: cooldownEnd.toISOString()
          }, { status: 429 })
        }
      }

      // Check if taken by another user
      const existing = await sql`SELECT id FROM users WHERE username = ${username} AND id != ${user.id}`
      if (existing.length > 0) {
        return json({ error: 'username_taken', error_key: 'username_taken' }, { status: 409 })
      }

      // Check if reserved
      const reserved = await sql`
        SELECT username FROM reserved_usernames
        WHERE username = ${username} AND user_id != ${user.id} AND reserved_until > NOW()
      `
      if (reserved.length > 0) {
        return json({ error: 'username_reserved', error_key: 'username_reserved' }, { status: 409 })
      }

      updates.username = username
      usernameChanged = true
    }
  }

  // display_name
  if (body.display_name !== undefined) {
    const displayName = String(body.display_name).trim()
    if (displayName.length < 1 || displayName.length > 64) {
      return json({ error: 'display_name_length', error_key: 'display_name_length' }, { status: 400 })
    }
    updates.display_name = displayName
  }

  if (Object.keys(updates).length === 0) {
    return json({ message: 'No changes' })
  }

  const setClauses: string[] = []
  const values: unknown[] = []

  if (updates.username !== undefined) {
    values.push(updates.username)
    setClauses.push(`username = $${values.length}`)
    setClauses.push(`username_changed_at = NOW()`)
  }
  if (updates.display_name !== undefined) {
    values.push(updates.display_name)
    setClauses.push(`display_name = $${values.length}`)
  }

  values.push(user.id)
  const idParam = `$${values.length}`

  await sql.unsafe(
    `UPDATE users SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = ${idParam}`,
    values
  )

  // Reserve old username for 30 days
  if (usernameChanged) {
    const reservedUntil = new Date(Date.now() + USERNAME_COOLDOWN_DAYS * 24 * 60 * 60 * 1000)
    await sql`
      INSERT INTO reserved_usernames (username, user_id, reserved_until)
      VALUES (${user.username}, ${user.id}, ${reservedUntil})
      ON CONFLICT (username) DO UPDATE SET reserved_until = ${reservedUntil}, user_id = ${user.id}
    `
  }

  const updated = await sql`
    SELECT id, username, display_name, username_changed_at FROM users WHERE id = ${user.id}
  `

  return json(updated[0])
}
