import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { sql } from '$lib/server/db/pool.js'
import { requireUser } from '$lib/server/auth/session.js'
import { invalidateLeaderboardCache } from '$lib/server/leaderboard/query.js'
import { getConfigValue, CFG } from '$lib/server/config.js'

export const PUT: RequestHandler = async (event) => {
  const user = await requireUser(event)
  const body = await event.request.json() as Record<string, unknown>

  const usernameCooldownDays = await getConfigValue(CFG.USERNAME_COOLDOWN_DAYS)
  const usernameMinLength = await getConfigValue(CFG.USERNAME_MIN_LENGTH)
  const usernameMaxLength = await getConfigValue(CFG.USERNAME_MAX_LENGTH)
  const displayNameMinLength = await getConfigValue(CFG.DISPLAY_NAME_MIN_LENGTH)
  const displayNameMaxLength = await getConfigValue(CFG.DISPLAY_NAME_MAX_LENGTH)

  const updates: Record<string, string> = {}
  let usernameChanged = false

  // username
  if (body.username !== undefined) {
    const username = String(body.username).trim()
    if (username.length < usernameMinLength || username.length > usernameMaxLength) {
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
        const cooldownEnd = new Date(new Date(lastChanged).getTime() + usernameCooldownDays * 24 * 60 * 60 * 1000)
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
    if (displayName.length < displayNameMinLength || displayName.length > displayNameMaxLength) {
      return json({ error: 'display_name_length', error_key: 'display_name_length' }, { status: 400 })
    }
    updates.display_name = displayName
  }

  // leaderboard settings
  let leaderboardVisibility: string | undefined
  let leaderboardAnonymous: boolean | undefined
  if (body.leaderboard_visibility !== undefined) {
    const vis = String(body.leaderboard_visibility)
    if (!['public', 'private'].includes(vis)) {
      return json({ error: 'Invalid leaderboard_visibility', error_key: 'invalid_visibility' }, { status: 400 })
    }
    leaderboardVisibility = vis
  }
  if (body.leaderboard_anonymous !== undefined) {
    leaderboardAnonymous = body.leaderboard_anonymous === true
  }

  const hasLeaderboardUpdates = leaderboardVisibility !== undefined || leaderboardAnonymous !== undefined
  if (Object.keys(updates).length === 0 && !hasLeaderboardUpdates) {
    return json({ message: 'No changes' })
  }

  if (updates.username !== undefined) {
    await sql`UPDATE users SET username = ${updates.username}, username_changed_at = NOW(), updated_at = NOW() WHERE id = ${user.id}`
  }
  if (updates.display_name !== undefined) {
    await sql`UPDATE users SET display_name = ${updates.display_name}, updated_at = NOW() WHERE id = ${user.id}`
  }
  if (leaderboardVisibility !== undefined) {
    await sql`UPDATE users SET leaderboard_visibility = ${leaderboardVisibility}, updated_at = NOW() WHERE id = ${user.id}`
  }
  if (leaderboardAnonymous !== undefined) {
    await sql`UPDATE users SET leaderboard_anonymous = ${leaderboardAnonymous}, updated_at = NOW() WHERE id = ${user.id}`
  }
  if (hasLeaderboardUpdates) {
    invalidateLeaderboardCache()
  }

  // Reserve old username for 30 days
  if (usernameChanged) {
    const reservedUntil = new Date(Date.now() + usernameCooldownDays * 24 * 60 * 60 * 1000)
    await sql`
      INSERT INTO reserved_usernames (username, user_id, reserved_until)
      VALUES (${user.username}, ${user.id}, ${reservedUntil})
      ON CONFLICT (username) DO UPDATE SET reserved_until = ${reservedUntil}, user_id = ${user.id}
    `
  }

  const updated = await sql`
    SELECT id, username, display_name, username_changed_at, leaderboard_visibility, leaderboard_anonymous FROM users WHERE id = ${user.id}
  `

  return json(updated[0])
}
