import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { sql } from '$lib/server/db/pool.js'
import { requireAdmin } from '$lib/server/auth/session.js'
import { nanoid } from 'nanoid'

const CURRENT_PRICING_VERSION = 'current'
const FALLBACK_CNY_USD = 0.14

interface PriceEntry {
  input: number
  output: number
  cacheRead?: number
  cacheWrite?: number
  currency?: string
}

function resolvePriceFromTable(model: string, table: Map<string, PriceEntry>): PriceEntry | undefined {
  if (table.has(model)) return table.get(model)
  const stripped = model.replace(/^(accounts\/fireworks\/models\/|moonshotai\/|z-ai\/|zai-org\/|frank\/|nvidia\/)/, '')
  if (table.has(stripped)) return table.get(stripped)
  if (table.has(stripped.toLowerCase())) return table.get(stripped.toLowerCase())

  let bestKey = ''
  let best: PriceEntry | undefined
  for (const candidate of [model, stripped, stripped.toLowerCase()]) {
    for (const [key, price] of table) {
      if (candidate.startsWith(key) && key.length > bestKey.length) {
        bestKey = key
        best = price
      }
    }
  }
  return best
}

function calculateCost(price: PriceEntry, tokens: {
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_write_tokens: number
  thinking_tokens: number
}): number {
  const raw = (tokens.input_tokens / 1_000_000) * price.input +
    (tokens.output_tokens / 1_000_000) * price.output +
    (tokens.cache_read_tokens / 1_000_000) * (price.cacheRead ?? 0) +
    (tokens.cache_write_tokens / 1_000_000) * (price.cacheWrite ?? 0) +
    (tokens.thinking_tokens / 1_000_000) * price.output
  return price.currency === 'CNY' ? raw * FALLBACK_CNY_USD : raw
}

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

  const pricingVersion = CURRENT_PRICING_VERSION

  const entries = await sql`
    SELECT model_key, input, output, cache_read, cache_write, currency
    FROM model_prices
    WHERE status = 'active'
  `
  const priceMap = new Map<string, PriceEntry>()
  for (const entry of entries) {
    const e = entry as { model_key: string; input: string | number; output: string | number; cache_read: string | number | null; cache_write: string | number | null; currency: string }
    priceMap.set(e.model_key, {
      input: Number(e.input),
      output: Number(e.output),
      cacheRead: e.cache_read == null ? undefined : Number(e.cache_read),
      cacheWrite: e.cache_write == null ? undefined : Number(e.cache_write),
      currency: e.currency || 'USD',
    })
  }

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
      const price = resolvePriceFromTable(metric.model, priceMap)
      if (price) {
        costUsd = calculateCost(price, metric)
      } else if (metric.total_tokens > 0) {
        hasUnknownCost = true
      }
    }

    await sql`
      UPDATE leaderboard_metrics
      SET total_cost_usd = ${costUsd},
          pricing_version = ${pricingVersion},
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
      SET total_cost_usd = ${totalCost}, pricing_version = ${pricingVersion}, has_unknown_cost = ${hasUnknownCost}, updated_at = NOW()
      WHERE id = ${metric.id}
    `
  }

  // Audit log
  const auditId = nanoid()
  await sql`
    INSERT INTO admin_audit_logs (id, admin_user_id, action, target_type, target_id, reason, metadata)
    VALUES (${auditId}, ${admin.id}, 'recompute', 'leaderboard', 'batch',
      ${body.reason || null}, ${JSON.stringify({ period_type: periodType, period_start: periodStart, period_end: periodEnd, user_id: userId, pricing_version: pricingVersion, recomputed, skipped })}::jsonb)
  `

  return json({
    status: 'completed',
    recomputed,
    skipped,
    pricing_version: pricingVersion,
  })
}
