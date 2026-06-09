import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { sql } from '$lib/server/db/pool.js'
import { requireAdmin } from '$lib/server/auth/session.js'
import { calculateRegistryCost, loadPricingRegistry, resolvePriceFromRegistry } from '$lib/server/pricing/registry.js'
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
           lm.thinking_tokens, lm.total_tokens
    FROM leaderboard_metrics lm
    JOIN users u ON u.id = lm.user_id
    WHERE lm.visibility != 'hidden'
      AND u.status = 'active'
      AND u.leaderboard_visibility = 'public'
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

  const metrics = await query

  let recomputed = 0
  let skipped = 0

  for (const row of metrics) {
    const metric = row as {
      id: string; upload_request_id: string; user_id: string; device_id: string;
      period_type: string; period_start: string; period_end: string; scope_type: string;
      tool: string | null; model: string | null; input_tokens: number; output_tokens: number;
      cache_read_tokens: number; cache_write_tokens: number; thinking_tokens: number; total_tokens: number
    }

    let costUsd = 0
    let hasUnknownCost = false
    if (metric.scope_type === 'tool_model' && metric.model && metric.model !== 'unknown') {
      const price = resolvePriceFromRegistry(metric.model, pricing)
      if (price) {
        costUsd = calculateRegistryCost(price, metric)
      } else if (metric.total_tokens > 0) {
        hasUnknownCost = true
      }
    }

    await sql`
      UPDATE leaderboard_metrics
      SET total_cost_usd = ${costUsd},
          has_unknown_cost = ${hasUnknownCost},
          updated_at = NOW()
      WHERE id = ${metric.id}
        AND visibility != 'hidden'
    `

    recomputed++
  }

  const aggregateRows = await sql`
    SELECT id, scope_type, tool, model, upload_request_id, user_id, period_type, period_start
    FROM leaderboard_metrics
    WHERE visibility != 'hidden'
      AND scope_type IN ('all', 'tool', 'model')
      ${periodType ? sql`AND period_type = ${periodType}` : sql``}
      ${periodStart ? sql`AND period_start >= ${periodStart}` : sql``}
      ${periodEnd ? sql`AND period_end <= ${periodEnd}` : sql``}
      ${userId ? sql`AND user_id = ${userId}` : sql``}
  `

  for (const row of aggregateRows) {
    const metric = row as { id: string; scope_type: string; tool: string | null; model: string | null; upload_request_id: string; user_id: string; period_type: string; period_start: string }
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
    const totalCost = children.reduce((sum, child) => sum + Number((child as { total_cost_usd: string | number }).total_cost_usd), 0)
    const hasUnknownCost = children.some(child => Boolean((child as { has_unknown_cost: boolean }).has_unknown_cost))
    await sql`
      UPDATE leaderboard_metrics
      SET total_cost_usd = ${totalCost}, has_unknown_cost = ${hasUnknownCost}, updated_at = NOW()
      WHERE id = ${metric.id}
    `
  }

  // Audit log
  const auditId = nanoid()
  await sql`
    INSERT INTO admin_audit_logs (id, admin_user_id, action, target_type, target_id, reason, metadata)
    VALUES (${auditId}, ${admin.id}, 'recompute', 'leaderboard', 'batch',
      ${body.reason || null}, ${JSON.stringify({ period_type: periodType, period_start: periodStart, period_end: periodEnd, user_id: userId, recomputed, skipped })}::jsonb)
  `

  return json({
    status: 'completed',
    recomputed,
    skipped,
  })
}
