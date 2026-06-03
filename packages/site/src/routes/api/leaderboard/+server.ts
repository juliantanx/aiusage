import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { queryLeaderboard, getCurrentPeriodStart } from '$lib/server/leaderboard/query.js'
import { getUserFromEvent } from '$lib/server/auth/session.js'

export const GET: RequestHandler = async (event) => {
  const user = await getUserFromEvent(event)

  const periodType = event.url.searchParams.get('period_type') || 'daily'
  let periodStart = event.url.searchParams.get('period_start')
  const cursor = event.url.searchParams.get('cursor')

  if (!periodStart) {
    periodStart = getCurrentPeriodStart(periodType)
  }

  if (!['daily', 'weekly', 'monthly', 'yearly', 'all_time'].includes(periodType)) {
    return json({ error: 'Invalid period_type' }, { status: 400 })
  }

  const result = await queryLeaderboard(periodType, periodStart, cursor, user?.id ?? null)
  return json(result)
}
