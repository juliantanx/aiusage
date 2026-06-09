import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { sql } from '$lib/server/db/pool.js'
import { requireAdmin } from '$lib/server/auth/session.js'
import { loadPricingRegistry } from '$lib/server/pricing/registry.js'
import { invalidateLeaderboardCache } from '$lib/server/leaderboard/query.js'
import { recomputeAggregateCost, recomputeToolModelCost, type CostMetricRow } from '$lib/server/leaderboard/recompute.js'
import { nanoid } from 'nanoid'

/**
 * POST /api/admin/leaderboard/recompute
 *
 * Recompute leaderboard metrics from upload_snapshots.
 * Useful after pricing table changes or fixing data issues.
 *
 * Body:
 *   - period_type?: string (daily|weekly|monthly|yearly|all_time)
 *   - period_start?: string (ISO date)
 *   - period_end?: string (ISO date)
 *   - user_id?: string
 */
export const POST: RequestHandler = async (event) => {
  const admin = await requireAdmin(event)
  const body = await event.request.json()

  const periodType = body.period_type
  const periodStart = body.period_start
  const periodEnd = body.period_end
  const userId = body.user_id

  const pricing = await loadPricingRegistry(sql)

  // Query accepted leaderboard rows and recalculate costs from their token breakdown.
  let query = sql`
    SELECT lm.id, lm.upload_request_id, lm.user_id, lm.device_id,
           lm.period_type, lm.period_start, lm.period_end, lm.scope_type, lm.tool, lm.model,
           lm.input_tokens, lm.output_tokens, lm.cache_read_tokens, lm.cache_write_tokens,
           lm.thinking_tokens, lm.total_tokens, lm.total_cost_usd, lm.has_unknown_cost
    FROM leaderboard_metrics lm
    JOIN users u ON u.id = lm.user_id
    WHERE lm.visibility != 'hidden'
      AND u.status = 'active'
      AND u.leaderboard_visibility = 'public'
      AND lm.scope_type = 'tool_model'
  `

  if (periodType) {
    query = sql`${query} AND lm.period_type = ${periodType}`
  }
  if (periodStart) {
    query = sql`${query} AND lm.period_start >= ${periodStart}`
  }
  if (periodEnd) {
    query = sql`${query} AND lm.period_end <= ${periodEnd}`
  }
  if (userId) {
    query = sql`${query} AND lm.user_id = ${userId}`
  }

  const metrics = await query as CostMetricRow[]

  let recomputed = 0
  let skipped = 0
  let preserved = 0
  const unresolvedModels = new Set<string>()

  for (const row of metrics) {
    const metric = row
    const update = recomputeToolModelCost(metric, pricing)
    if (!update) { skipped++; continue }
    if (update.unresolvedModel) unresolvedModels.add(update.unresolvedModel)
    if (update.preserved) preserved++

    await sql`
      UPDATE leaderboard_metrics
      SET total_cost_usd = ${update.totalCostUsd},
          has_unknown_cost = ${update.hasUnknownCost},
          updated_at = NOW()
      WHERE id = ${metric.id}
        AND visibility != 'hidden'
    `

    recomputed++
  }

  const aggregateRows = await sql`
    SELECT lm.id, lm.scope_type, lm.tool, lm.model, lm.upload_request_id, lm.user_id,
           lm.period_type, lm.period_start, lm.input_tokens, lm.output_tokens,
           lm.cache_read_tokens, lm.cache_write_tokens, lm.thinking_tokens, lm.total_tokens,
           lm.total_cost_usd, lm.has_unknown_cost
    FROM leaderboard_metrics lm
    JOIN users u ON u.id = lm.user_id
    WHERE lm.visibility != 'hidden'
      AND lm.scope_type IN ('all', 'tool', 'model')
      AND u.status = 'active'
      AND u.leaderboard_visibility = 'public'
      ${periodType ? sql`AND lm.period_type = ${periodType}` : sql``}
      ${periodStart ? sql`AND lm.period_start >= ${periodStart}` : sql``}
      ${periodEnd ? sql`AND lm.period_end <= ${periodEnd}` : sql``}
      ${userId ? sql`AND lm.user_id = ${userId}` : sql``}
  `

  for (const row of aggregateRows) {
    const metric = row as CostMetricRow & { upload_request_id: string; user_id: string; period_type: string; period_start: string }
    let children
    if (metric.scope_type === 'all') {
      children = await sql`
        SELECT total_cost_usd, has_unknown_cost FROM leaderboard_metrics
        WHERE upload_request_id = ${metric.upload_request_id} AND scope_type = 'tool_model' AND visibility != 'hidden'
      `
    } else if (metric.scope_type === 'tool') {
      children = await sql`
        SELECT total_cost_usd, has_unknown_cost FROM leaderboard_metrics
        WHERE upload_request_id = ${metric.upload_request_id} AND scope_type = 'tool_model' AND tool = ${metric.tool} AND visibility != 'hidden'
      `
    } else {
      children = await sql`
        SELECT total_cost_usd, has_unknown_cost FROM leaderboard_metrics
        WHERE upload_request_id = ${metric.upload_request_id} AND scope_type = 'tool_model' AND model = ${metric.model} AND visibility != 'hidden'
      `
    }

    const update = recomputeAggregateCost(metric, children as Array<{ total_cost_usd: string | number; has_unknown_cost: boolean | null }>, pricing)
    if (!update) { skipped++; continue }
    if (update.unresolvedModel) unresolvedModels.add(update.unresolvedModel)
    if (update.preserved) preserved++

    await sql`
      UPDATE leaderboard_metrics
      SET total_cost_usd = ${update.totalCostUsd}, has_unknown_cost = ${update.hasUnknownCost}, updated_at = NOW()
      WHERE id = ${metric.id}
    `
    recomputed++
  }

  invalidateLeaderboardCache()

  const unresolvedModelList = [...unresolvedModels].sort()

  // Audit log
  const auditId = nanoid()
  await sql`
    INSERT INTO admin_audit_logs (id, admin_user_id, action, target_type, target_id, reason, metadata)
    VALUES (${auditId}, ${admin.id}, 'recompute', 'leaderboard', 'batch',
      ${body.reason || null}, ${JSON.stringify({ period_type: periodType, period_start: periodStart, period_end: periodEnd, user_id: userId, recomputed, skipped, preserved, unresolved_models: unresolvedModelList })}::jsonb)
  `

  return json({
    status: 'completed',
    recomputed,
    skipped,
    preserved,
    unresolved_models: unresolvedModelList,
  })
}
