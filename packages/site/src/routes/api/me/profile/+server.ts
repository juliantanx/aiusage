import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { sql } from '$lib/server/db/pool.js'
import { requireUser } from '$lib/server/auth/session.js'

export const PUT: RequestHandler = async (event) => {
  const user = await requireUser(event)
  const body = await event.request.json() as Record<string, unknown>

  const updates: Record<string, string> = {}

  // username
  if (body.username !== undefined) {
    const username = String(body.username).trim()
    if (username.length < 3 || username.length > 32) {
      return json({ error: 'Username must be 3-32 characters' }, { status: 400 })
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      return json({ error: 'Username can only contain letters, numbers, hyphens, and underscores' }, { status: 400 })
    }
    if (username !== user.username) {
      const existing = await sql`SELECT id FROM users WHERE username = ${username} AND id != ${user.id}`
      if (existing.length > 0) {
        return json({ error: 'Username is already taken' }, { status: 409 })
      }
      updates.username = username
    }
  }

  // display_name
  if (body.display_name !== undefined) {
    const displayName = String(body.display_name).trim()
    if (displayName.length < 1 || displayName.length > 64) {
      return json({ error: 'Display name must be 1-64 characters' }, { status: 400 })
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

  const updated = await sql`
    SELECT id, username, display_name FROM users WHERE id = ${user.id}
  `

  return json(updated[0])
}
