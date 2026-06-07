import { sql } from '../db/pool.js'
import { getConfigValue, CFG } from '$lib/server/config.js'

export type RankingMetric = 'tokens' | 'cost'
export type RankingScope = 'all' | 'tool' | 'model' | 'tool_model'

export interface RankingEntry {
  rank: number
  user_id: string
  display_name: string
  avatar_url: string | null
  scope_type: RankingScope
  tool: string | null
  model: string | null
  total_tokens: string
  total_cost_usd: string
  updated_at: string
}

export interface LeaderboardResponse {
  entries: RankingEntry[]
  next_cursor: string | null
  current_user: RankingEntry | null
  period_type: string
  period_start: string
  metric: RankingMetric
  scope: RankingScope
  tool: string | null
  model: string | null
}

// In-memory TTL cache for leaderboard queries (§11.5)
interface CacheEntry {
  data: LeaderboardResponse
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()

function cacheKey(options: { periodType: string; periodStart: string; metric: string; scope: string; tool: string | null; model: string | null; cursor: string | null }): string {
  return `${options.periodType}:${options.periodStart}:${options.metric}:${options.scope}:${options.tool ?? ''}:${options.model ?? ''}:${options.cursor ?? '0'}`
}

export function invalidateLeaderboardCache(): void {
  cache.clear()
}

export async function queryLeaderboard(options: {
  periodType: string
  periodStart: string
  metric: RankingMetric
  scope: RankingScope
  tool: string | null
  model: string | null
  cursor: string | null
  currentUserId: string | null
}): Promise<LeaderboardResponse> {
  if (options.periodType === 'last_30_days') {
    return queryRollingLeaderboard(options, 30)
  }

  const pageSize = await getConfigValue(CFG.LEADERBOARD_PAGE_SIZE)
  const cacheTtlMs = await getConfigValue(CFG.LEADERBOARD_CACHE_TTL_MS)
  const orderExpr = options.metric === 'cost'
    ? sql`lm.total_cost_usd DESC`
    : sql`lm.total_tokens DESC`
  const cursorRank = options.cursor ? decodeCursor(options.cursor) : 0

  // Check cache (only for first page without cursor)
  const key = cacheKey(options)
  if (!options.cursor) {
    const cached = cache.get(key)
    if (cached && cached.expiresAt > Date.now()) {
      return {
        ...cached.data,
        current_user: await getCurrentUserRanking(options),
      }
    }
  }

  const entries = await sql`
    WITH ranked AS (
      SELECT
        CASE WHEN u.leaderboard_anonymous = TRUE THEN 'anon_' || substr(md5(lm.user_id), 1, 8) ELSE lm.user_id END AS user_id,
        CASE WHEN u.leaderboard_anonymous = TRUE THEN '***' ELSE u.display_name END AS display_name,
        CASE WHEN u.leaderboard_anonymous = TRUE THEN NULL ELSE u.avatar_url END AS avatar_url,
        lm.scope_type,
        lm.tool,
        lm.model,
        lm.total_tokens::text,
        lm.total_cost_usd::text,
        lm.updated_at::text,
        ROW_NUMBER() OVER (ORDER BY ${orderExpr}, lm.updated_at ASC, lm.user_id ASC) as rn
      FROM leaderboard_metrics lm
      JOIN users u ON u.id = lm.user_id
      WHERE lm.period_type = ${options.periodType}::period_type
        AND lm.period_start = ${options.periodStart}
        AND lm.scope_type = ${options.scope}
        AND (${options.tool}::text IS NULL OR lm.tool = ${options.tool})
        AND (${options.model}::text IS NULL OR lm.model = ${options.model})
        AND lm.visibility = 'public'
        AND u.status = 'active'
        AND u.leaderboard_visibility = 'public'
    )
    SELECT *
    FROM ranked
    WHERE rn > ${cursorRank}
    ORDER BY rn ASC
    LIMIT ${pageSize + 1}
  ` as Array<RankingEntry & { rn: string }>

  const hasMore = entries.length > pageSize
  const page = entries.slice(0, pageSize)
  const nextCursor = hasMore && page.length > 0 ? encodeCursor(page[page.length - 1].rn) : null

  const currentUser = await getCurrentUserRanking(options)

  const result: LeaderboardResponse = {
    entries: page.map(row => toRankingEntry(row)),
    next_cursor: nextCursor,
    current_user: currentUser,
    period_type: options.periodType,
    period_start: options.periodStart,
    metric: options.metric,
    scope: options.scope,
    tool: options.tool,
    model: options.model,
  }

  // Cache first-page results
  if (!options.cursor) {
    cache.set(key, { data: result, expiresAt: Date.now() + cacheTtlMs })
  }

  return result
}

async function queryRollingLeaderboard(options: {
  periodType: string
  periodStart: string
  metric: RankingMetric
  scope: RankingScope
  tool: string | null
  model: string | null
  cursor: string | null
  currentUserId: string | null
}, days: number): Promise<LeaderboardResponse> {
  const pageSize = await getConfigValue(CFG.LEADERBOARD_PAGE_SIZE)
  const cacheTtlMs = await getConfigValue(CFG.LEADERBOARD_CACHE_TTL_MS)
  const orderExpr = options.metric === 'cost'
    ? sql`a.total_cost_usd DESC`
    : sql`a.total_tokens DESC`
  const cursorRank = options.cursor ? decodeCursor(options.cursor) : 0
  const periodEnd = addUtcDays(options.periodStart, days)

  const key = cacheKey(options)
  if (!options.cursor) {
    const cached = cache.get(key)
    if (cached && cached.expiresAt > Date.now()) {
      return {
        ...cached.data,
        current_user: await getRollingCurrentUserRanking(options, days),
      }
    }
  }

  const entries = await sql`
    WITH aggregated AS (
      SELECT
        lm.user_id,
        lm.scope_type,
        lm.tool,
        lm.model,
        SUM(lm.total_tokens) AS total_tokens,
        SUM(lm.total_cost_usd) AS total_cost_usd,
        MAX(lm.updated_at) AS updated_at
      FROM leaderboard_metrics lm
      JOIN users u ON u.id = lm.user_id
      WHERE lm.period_type = 'daily'::period_type
        AND lm.period_start >= ${options.periodStart}
        AND lm.period_start < ${periodEnd}
        AND lm.scope_type = ${options.scope}
        AND (${options.tool}::text IS NULL OR lm.tool = ${options.tool})
        AND (${options.model}::text IS NULL OR lm.model = ${options.model})
        AND lm.visibility = 'public'
        AND u.status = 'active'
        AND u.leaderboard_visibility = 'public'
      GROUP BY lm.user_id, lm.scope_type, lm.tool, lm.model
    ),
    ranked AS (
      SELECT
        CASE WHEN u.leaderboard_anonymous = TRUE THEN 'anon_' || substr(md5(a.user_id), 1, 8) ELSE a.user_id END AS user_id,
        CASE WHEN u.leaderboard_anonymous = TRUE THEN '***' ELSE u.display_name END AS display_name,
        CASE WHEN u.leaderboard_anonymous = TRUE THEN NULL ELSE u.avatar_url END AS avatar_url,
        a.scope_type,
        a.tool,
        a.model,
        a.total_tokens::text,
        a.total_cost_usd::text,
        a.updated_at::text,
        ROW_NUMBER() OVER (ORDER BY ${orderExpr}, a.updated_at ASC, a.user_id ASC) as rn
      FROM aggregated a
      JOIN users u ON u.id = a.user_id
    )
    SELECT *
    FROM ranked
    WHERE rn > ${cursorRank}
    ORDER BY rn ASC
    LIMIT ${pageSize + 1}
  ` as Array<RankingEntry & { rn: string }>

  const hasMore = entries.length > pageSize
  const page = entries.slice(0, pageSize)
  const nextCursor = hasMore && page.length > 0 ? encodeCursor(page[page.length - 1].rn) : null
  const currentUser = await getRollingCurrentUserRanking(options, days)

  const result: LeaderboardResponse = {
    entries: page.map(row => toRankingEntry(row)),
    next_cursor: nextCursor,
    current_user: currentUser,
    period_type: options.periodType,
    period_start: options.periodStart,
    metric: options.metric,
    scope: options.scope,
    tool: options.tool,
    model: options.model,
  }

  if (!options.cursor) {
    cache.set(key, { data: result, expiresAt: Date.now() + cacheTtlMs })
  }

  return result
}

function toRankingEntry(row: RankingEntry & { rn: string }): RankingEntry {
  return {
    rank: Number(row.rn),
    user_id: row.user_id,
    display_name: row.display_name,
    avatar_url: row.avatar_url,
    scope_type: row.scope_type,
    tool: row.tool,
    model: row.model,
    total_tokens: row.total_tokens,
    total_cost_usd: row.total_cost_usd,
    updated_at: row.updated_at,
  }
}

async function getCurrentUserRanking(options: {
  periodType: string
  periodStart: string
  metric: RankingMetric
  scope: RankingScope
  tool: string | null
  model: string | null
  currentUserId: string | null
}): Promise<RankingEntry | null> {
  if (!options.currentUserId) return null

  const userEntry = await sql`
    SELECT
      CASE WHEN u.leaderboard_anonymous = TRUE THEN 'anon_' || substr(md5(lm.user_id), 1, 8) ELSE lm.user_id END AS user_id,
      CASE WHEN u.leaderboard_anonymous = TRUE THEN '***' ELSE u.display_name END AS display_name,
      CASE WHEN u.leaderboard_anonymous = TRUE THEN NULL ELSE u.avatar_url END AS avatar_url,
      lm.scope_type,
      lm.tool,
      lm.model,
      lm.total_tokens::text,
      lm.total_cost_usd::text,
      lm.updated_at::text
    FROM leaderboard_metrics lm
    JOIN users u ON u.id = lm.user_id
    WHERE lm.period_type = ${options.periodType}::period_type
      AND lm.period_start = ${options.periodStart}
      AND lm.scope_type = ${options.scope}
      AND (${options.tool}::text IS NULL OR lm.tool = ${options.tool})
      AND (${options.model}::text IS NULL OR lm.model = ${options.model})
      AND lm.user_id = ${options.currentUserId}
      AND lm.visibility = 'public'
      AND u.status = 'active'
      AND u.leaderboard_visibility = 'public'
  ` as Array<Omit<RankingEntry, 'rank'>>

  if (!userEntry[0]) return null

  const ue = userEntry[0]
  const rankResult = await sql`
    SELECT COUNT(*) + 1 as rank
    FROM leaderboard_metrics lm
    JOIN users u ON u.id = lm.user_id
    WHERE lm.period_type = ${options.periodType}::period_type
      AND lm.period_start = ${options.periodStart}
      AND lm.scope_type = ${options.scope}
      AND (${options.tool}::text IS NULL OR lm.tool = ${options.tool})
      AND (${options.model}::text IS NULL OR lm.model = ${options.model})
      AND lm.visibility = 'public'
      AND u.status = 'active'
      AND u.leaderboard_visibility = 'public'
      AND (
        ${
          options.metric === 'cost'
            ? sql`lm.total_cost_usd > ${ue.total_cost_usd}`
            : sql`lm.total_tokens > ${ue.total_tokens}`
        }
        OR (
          ${
            options.metric === 'cost'
              ? sql`lm.total_cost_usd = ${ue.total_cost_usd}`
              : sql`lm.total_tokens = ${ue.total_tokens}`
          }
          AND lm.updated_at < ${ue.updated_at}
        )
        OR (
          ${
            options.metric === 'cost'
              ? sql`lm.total_cost_usd = ${ue.total_cost_usd}`
              : sql`lm.total_tokens = ${ue.total_tokens}`
          }
          AND lm.updated_at = ${ue.updated_at}
          AND lm.user_id < ${options.currentUserId}
        )
      )
  `

  return {
    rank: Number((rankResult[0] as { rank: bigint }).rank),
    ...ue,
  }
}

async function getRollingCurrentUserRanking(options: {
  periodType: string
  periodStart: string
  metric: RankingMetric
  scope: RankingScope
  tool: string | null
  model: string | null
  currentUserId: string | null
}, days: number): Promise<RankingEntry | null> {
  if (!options.currentUserId) return null

  const periodEnd = addUtcDays(options.periodStart, days)
  const rankedRows = await sql`
    WITH aggregated AS (
      SELECT
        lm.user_id,
        lm.scope_type,
        lm.tool,
        lm.model,
        SUM(lm.total_tokens) AS total_tokens,
        SUM(lm.total_cost_usd) AS total_cost_usd,
        MAX(lm.updated_at) AS updated_at
      FROM leaderboard_metrics lm
      JOIN users u ON u.id = lm.user_id
      WHERE lm.period_type = 'daily'::period_type
        AND lm.period_start >= ${options.periodStart}
        AND lm.period_start < ${periodEnd}
        AND lm.scope_type = ${options.scope}
        AND (${options.tool}::text IS NULL OR lm.tool = ${options.tool})
        AND (${options.model}::text IS NULL OR lm.model = ${options.model})
        AND lm.visibility = 'public'
        AND u.status = 'active'
        AND u.leaderboard_visibility = 'public'
      GROUP BY lm.user_id, lm.scope_type, lm.tool, lm.model
    ),
    ranked AS (
      SELECT
        a.user_id AS raw_user_id,
        CASE WHEN u.leaderboard_anonymous = TRUE THEN 'anon_' || substr(md5(a.user_id), 1, 8) ELSE a.user_id END AS user_id,
        CASE WHEN u.leaderboard_anonymous = TRUE THEN '***' ELSE u.display_name END AS display_name,
        CASE WHEN u.leaderboard_anonymous = TRUE THEN NULL ELSE u.avatar_url END AS avatar_url,
        a.scope_type,
        a.tool,
        a.model,
        a.total_tokens::text,
        a.total_cost_usd::text,
        a.updated_at::text,
        ROW_NUMBER() OVER (
          ORDER BY ${
            options.metric === 'cost'
              ? sql`a.total_cost_usd DESC`
              : sql`a.total_tokens DESC`
          }, a.updated_at ASC, a.user_id ASC
        ) as rn
      FROM aggregated a
      JOIN users u ON u.id = a.user_id
    )
    SELECT *
    FROM ranked
    WHERE raw_user_id = ${options.currentUserId}
    LIMIT 1
  ` as Array<RankingEntry & { rn: string }>

  return rankedRows[0] ? toRankingEntry(rankedRows[0]) : null
}

export function getCurrentPeriodStart(periodType: string): string {
  const now = new Date()
  switch (periodType) {
    case 'last_30_days':
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29)).toISOString()
    case 'daily':
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()
    case 'weekly': {
      const day = now.getUTCDay()
      const diff = day === 0 ? 6 : day - 1
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diff)).toISOString()
    }
    case 'monthly':
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
    case 'yearly':
      return new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString()
    case 'all_time':
      return '1970-01-01T00:00:00.000Z'
    default:
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()
  }
}

function addUtcDays(iso: string, days: number): string {
  const date = new Date(iso)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString()
}

function encodeCursor(rank: string): string {
  return Buffer.from(rank, 'utf-8').toString('base64url')
}

function decodeCursor(cursor: string): number {
  const decoded = Buffer.from(cursor, 'base64url').toString('utf-8')
  const rank = Number(decoded)
  return Number.isFinite(rank) && rank > 0 ? rank : 0
}
