import { redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import { sql } from '$lib/server/db/pool.js'
import { getConfigValue, CFG } from '$lib/server/config.js'

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) throw redirect(302, '/login')

  const base = {
    id: locals.user.id,
    username: locals.user.username,
    email: locals.user.email,
    display_name: locals.user.display_name,
    avatar_url: locals.user.avatar_url,
    role: locals.user.role,
    has_password: false,
    username_changed_at: null as string | null,
    leaderboard_visibility: 'public',
    leaderboard_anonymous: false,
  }

  try {
    const rows = await sql`SELECT password_hash, username_changed_at, leaderboard_visibility, leaderboard_anonymous FROM users WHERE id = ${locals.user.id}`
    const row = rows[0] as { password_hash: string | null; username_changed_at: string | null; leaderboard_visibility: string; leaderboard_anonymous: boolean } | undefined
    if (row) {
      base.has_password = row.password_hash != null
      base.username_changed_at = row.username_changed_at || null
      base.leaderboard_visibility = row.leaderboard_visibility || 'public'
      base.leaderboard_anonymous = row.leaderboard_anonymous || false
    }
  } catch (err) {
    console.error('Settings load: DB query failed, using defaults:', err)
  }

  const usernameCooldownDays = await getConfigValue(CFG.USERNAME_COOLDOWN_DAYS)
  const avatarMaxSize = await getConfigValue(CFG.AVATAR_MAX_FILE_SIZE)

  // Load linked identities
  let identities: Array<{ provider: string; username: string | null; email: string | null; created_at: string }> = []
  try {
    const rows = await sql`
      SELECT provider, provider_username AS username, email, created_at
      FROM user_identities
      WHERE user_id = ${locals.user.id}
      ORDER BY created_at ASC
    `
    identities = rows as typeof identities
  } catch {}

  return { profile: base, usernameCooldownDays, identities, avatarMaxSize }
}
