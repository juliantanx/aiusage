import { sql } from '../db/pool.js'

export interface LeaderboardEntry {
  rank: number
  user_id: string
  display_name: string
  avatar_url: string | null
  total_tokens: string
  updated_at: string
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[]
  next_cursor: string | null
  current_user: LeaderboardEntry | null
  period_type: string
  period_start: string
}

const PAGE_SIZE = 50

export async function queryLeaderboard(
  periodType: string,
  periodStart: string,
  cursor: string | null,
  currentUserId: string | null
): Promise<LeaderboardResponse> {
  let entries: Array<{ user_id: string; display_name: string; avatar_url: string | null; total_tokens: string; updated_at: string; rn: string }>

  if (cursor) {
    const [cursorTokens, cursorUserId] = decodeCursor(cursor)
    entries = await sql`
      SELECT user_id, display_name, avatar_url, total_tokens::text, updated_at::text,
        ROW_NUMBER() OVER (ORDER BY total_tokens DESC, updated_at ASC, user_id ASC) as rn
      FROM leaderboard_entries le
      JOIN users u ON u.id = le.user_id
      WHERE le.period_type = ${periodType}::period_type
        AND le.period_start = ${periodStart}
        AND le.visibility = 'public'
        AND u.status = 'active'
        AND u.leaderboard_visibility = 'public'
        AND (le.total_tokens < ${cursorTokens} OR (le.total_tokens = ${cursorTokens} AND le.user_id > ${cursorUserId}))
      ORDER BY le.total_tokens DESC, le.updated_at ASC, le.user_id ASC
      LIMIT ${PAGE_SIZE + 1}
    `
  } else {
    entries = await sql`
      SELECT user_id, display_name, avatar_url, total_tokens::text, updated_at::text,
        ROW_NUMBER() OVER (ORDER BY total_tokens DESC, updated_at ASC, user_id ASC) as rn
      FROM leaderboard_entries le
      JOIN users u ON u.id = le.user_id
      WHERE le.period_type = ${periodType}::period_type
        AND le.period_start = ${periodStart}
        AND le.visibility = 'public'
        AND u.status = 'active'
        AND u.leaderboard_visibility = 'public'
      ORDER BY le.total_tokens DESC, le.updated_at ASC, le.user_id ASC
      LIMIT ${PAGE_SIZE + 1}
    `
  }

  const hasMore = entries.length > PAGE_SIZE
  const page = entries.slice(0, PAGE_SIZE)

  let nextCursor: string | null = null
  if (hasMore && page.length > 0) {
    const last = page[page.length - 1]
    nextCursor = encodeCursor(last.total_tokens, last.user_id)
  }

  // Get current user's rank
  let currentUser: LeaderboardEntry | null = null
  if (currentUserId) {
    const userEntry = await sql`
      SELECT le.user_id, u.display_name, u.avatar_url, le.total_tokens::text, le.updated_at::text
      FROM leaderboard_entries le
      JOIN users u ON u.id = le.user_id
      WHERE le.period_type = ${periodType}::period_type
        AND le.period_start = ${periodStart}
        AND le.user_id = ${currentUserId}
        AND le.visibility = 'public'
    `
    if (userEntry[0]) {
      const ue = userEntry[0] as { user_id: string; display_name: string; avatar_url: string | null; total_tokens: string; updated_at: string }
      const rankResult = await sql`
        SELECT COUNT(*) + 1 as rank
        FROM leaderboard_entries le
        JOIN users u ON u.id = le.user_id
        WHERE le.period_type = ${periodType}::period_type
          AND le.period_start = ${periodStart}
          AND le.visibility = 'public'
          AND u.status = 'active'
          AND u.leaderboard_visibility = 'public'
          AND le.total_tokens > ${ue.total_tokens}
      `
      currentUser = {
        rank: Number((rankResult[0] as { rank: bigint }).rank),
        ...ue
      }
    }
  }

  return {
    entries: page.map(e => ({
      rank: Number(e.rn),
      user_id: e.user_id,
      display_name: e.display_name,
      avatar_url: e.avatar_url,
      total_tokens: e.total_tokens,
      updated_at: e.updated_at
    })),
    next_cursor: nextCursor,
    current_user: currentUser,
    period_type: periodType,
    period_start: periodStart
  }
}

export function getCurrentPeriodStart(periodType: string): string {
  const now = new Date()
  switch (periodType) {
    case 'daily':
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()
    case 'weekly': {
      const day = now.getUTCDay()
      const diff = day === 0 ? 6 : day - 1
      const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diff))
      return monday.toISOString()
    }
    case 'monthly':
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
    case 'yearly':
      return new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString()
    case 'all_time':
      return '1970-01-01T00:00:00.000Z'
    default:
      return ''
  }
}

function encodeCursor(tokens: string, userId: string): string {
  return Buffer.from(`${tokens}:${userId}`).toString('base64url')
}

function decodeCursor(cursor: string): [string, string] {
  const decoded = Buffer.from(cursor, 'base64url').toString('utf8')
  const [tokens, userId] = decoded.split(':')
  return [tokens, userId]
}
