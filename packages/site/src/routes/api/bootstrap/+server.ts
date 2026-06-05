import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { sql } from '$lib/server/db/pool.js'
import { requireUser } from '$lib/server/auth/session.js'

export const GET: RequestHandler = async (event) => {
  const user = await requireUser(event)

  // Get user's devices
  const devices = await sql`
    SELECT id, name, status, last_used_at, created_at
    FROM user_devices
    WHERE user_id = ${user.id}
    ORDER BY created_at DESC
  `

  // Get recent upload stats
  const uploadStats = await sql`
    SELECT
      COUNT(*) as total_uploads,
      COUNT(*) FILTER (WHERE status = 'accepted') as accepted,
      COUNT(*) FILTER (WHERE status = 'flagged') as flagged,
      COUNT(*) FILTER (WHERE status = 'rejected') as rejected
    FROM upload_snapshots
    WHERE user_id = ${user.id}
  `

  // Get user's leaderboard visibility
  const userSettings = await sql`
    SELECT leaderboard_visibility, leaderboard_anonymous
    FROM users WHERE id = ${user.id}
  `

  return json({
    user: {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      avatar_url: user.avatar_url,
      role: user.role,
      leaderboard_visibility: userSettings[0]?.leaderboard_visibility || 'public',
      leaderboard_anonymous: userSettings[0]?.leaderboard_anonymous || false,
    },
    devices: devices.map((d: Record<string, unknown>) => ({
      id: d.id,
      name: d.name,
      status: d.status,
      last_used_at: d.last_used_at,
      created_at: d.created_at,
    })),
    upload_stats: uploadStats[0] || { total_uploads: 0, accepted: 0, flagged: 0, rejected: 0 },
  })
}
