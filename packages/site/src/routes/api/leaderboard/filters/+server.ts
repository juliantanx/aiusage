import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { sql } from '$lib/server/db/pool.js'
import { getCurrentPeriodStart } from '$lib/server/leaderboard/query.js'

export const GET: RequestHandler = async (event) => {
  try {
    const periodType = event.url.searchParams.get('period_type') || 'all_time'
    const metric = event.url.searchParams.get('metric') || 'tokens'
    const periodStart = event.url.searchParams.get('period_start') || getCurrentPeriodStart(periodType)
    const valueColumn = metric === 'cost' ? sql`lm.total_cost_usd` : sql`lm.total_tokens`
    // The rows the leaderboard itself shows (leaderboard/query.ts): public
    // rows of active users whose leaderboard visibility is public.
    const periodFilter = sql`lm.period_type = ${periodType}::period_type AND lm.period_start = ${periodStart}
      AND lm.visibility = 'public' AND u.status = 'active' AND u.leaderboard_visibility = 'public'`

    const [tools, models] = await Promise.all([
      sql`
        SELECT lm.tool
        FROM leaderboard_metrics lm
        JOIN users u ON u.id = lm.user_id
        WHERE ${periodFilter}
          AND lm.scope_type = 'tool'
          AND lm.tool IS NOT NULL
        GROUP BY lm.tool
        ORDER BY
          SUM(${valueColumn}) DESC,
          lm.tool ASC
      `,
      sql`
        SELECT lm.model
        FROM leaderboard_metrics lm
        JOIN users u ON u.id = lm.user_id
        WHERE ${periodFilter}
          AND lm.scope_type = 'model'
          AND lm.model IS NOT NULL
        GROUP BY lm.model
        ORDER BY
          SUM(${valueColumn}) DESC,
          lm.model ASC
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
