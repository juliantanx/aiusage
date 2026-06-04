import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { sql } from '$lib/server/db/pool.js'
import { getCurrentPeriodStart } from '$lib/server/leaderboard/query.js'
import { getUserFromEvent } from '$lib/server/auth/session.js'

export const GET: RequestHandler = async (event) => {
  try {
    const user = await getUserFromEvent(event)
    const periodType = event.url.searchParams.get('period_type') || 'daily'
    const metric = event.url.searchParams.get('metric') || 'tokens'
    const periodStart = event.url.searchParams.get('period_start') || getCurrentPeriodStart(periodType)
    const valueColumn = metric === 'cost' ? sql`total_cost_usd` : sql`total_tokens`

    const [tools, models] = await Promise.all([
      sql`
        SELECT tool
        FROM leaderboard_metrics
        WHERE period_type = ${periodType}::period_type
          AND period_start = ${periodStart}
          AND scope_type = 'tool'
          AND tool IS NOT NULL
          AND visibility = 'public'
        GROUP BY tool
        ORDER BY
          SUM(CASE WHEN user_id = ${user?.id ?? null} THEN ${valueColumn} ELSE 0 END) DESC,
          SUM(${valueColumn}) DESC,
          tool ASC
      `,
      sql`
        SELECT model
        FROM leaderboard_metrics
        WHERE period_type = ${periodType}::period_type
          AND period_start = ${periodStart}
          AND scope_type = 'model'
          AND model IS NOT NULL
          AND visibility = 'public'
        GROUP BY model
        ORDER BY
          SUM(CASE WHEN user_id = ${user?.id ?? null} THEN ${valueColumn} ELSE 0 END) DESC,
          SUM(${valueColumn}) DESC,
          model ASC
      `,
    ])
    return json({
      tools: (tools as Array<{ tool: string }>).map(r => r.tool),
      models: (models as Array<{ model: string }>).map(r => r.model),
    })
  } catch (err) {
    console.error('Leaderboard filters query failed:', err)
    return json({ tools: [], models: [] })
  }
}
