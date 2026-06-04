import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { queryLeaderboard, getCurrentPeriodStart, type RankingMetric, type RankingScope } from '$lib/server/leaderboard/query.js'
import { getUserFromEvent } from '$lib/server/auth/session.js'

export const GET: RequestHandler = async (event) => {
  const user = await getUserFromEvent(event)

  const periodType = event.url.searchParams.get('period_type') || 'daily'
  const metric = event.url.searchParams.get('metric') || 'tokens'
  const scope = event.url.searchParams.get('scope') || 'all'
  const tool = event.url.searchParams.get('tool')
  const model = event.url.searchParams.get('model')
  let periodStart = event.url.searchParams.get('period_start')
  const cursor = event.url.searchParams.get('cursor')

  if (!periodStart) {
    periodStart = getCurrentPeriodStart(periodType)
  }

  if (!['daily', 'weekly', 'monthly', 'yearly', 'all_time'].includes(periodType)) {
    return json({ error: 'Invalid period_type' }, { status: 400 })
  }
  if (!['tokens', 'cost'].includes(metric)) {
    return json({ error: 'Invalid metric' }, { status: 400 })
  }
  if (!['all', 'tool', 'model', 'tool_model'].includes(scope)) {
    return json({ error: 'Invalid scope' }, { status: 400 })
  }
  if (scope === 'all' && (tool || model)) {
    return json({ error: 'all scope cannot be filtered by tool or model' }, { status: 400 })
  }

  const result = await queryLeaderboard({
    periodType,
    periodStart,
    metric: metric as RankingMetric,
    scope: scope as RankingScope,
    tool,
    model,
    cursor,
    currentUserId: user?.id ?? null,
  })
  return json(result)
}
