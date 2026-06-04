import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { sql } from '$lib/server/db/pool.js'
import { requireAdmin } from '$lib/server/auth/session.js'
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

  // Get the published pricing table
  const priceTable = await sql`
    SELECT id, version FROM official_price_tables WHERE status = 'published' ORDER BY created_at DESC LIMIT 1
  `
  const pricingVersion = priceTable.length > 0 ? (priceTable[0] as { id: string; version: string }).version : 'core_default'
  const priceTableId = priceTable.length > 0 ? (priceTable[0] as { id: string; version: string }).id : null

  // Build price lookup
  const priceMap = new Map<string, { input: number; output: number; cache_read: number; cache_write: number }>()
  if (priceTableId) {
    const entries = await sql`
      SELECT model_key, input, output, cache_read, cache_write
      FROM official_price_entries WHERE table_id = ${priceTableId}
    `
    for (const entry of entries) {
      const e = entry as { model_key: string; input: number; output: number; cache_read: number; cache_write: number }
      priceMap.set(e.model_key, { input: Number(e.input), output: Number(e.output), cache_read: Number(e.cache_read), cache_write: Number(e.cache_write) })
    }
  }

  // Query accepted upload snapshots
  let query = sql`
    SELECT us.id, us.upload_request_id, us.user_id, us.device_id,
           us.period_type, us.period_start, us.period_end,
           us.total_tokens
    FROM upload_snapshots us
    JOIN users u ON u.id = us.user_id
    WHERE us.status = 'accepted'
      AND u.status = 'active'
      AND u.leaderboard_visibility = 'public'
  `

  if (periodType) {
    query = sql`${query} AND us.period_type = ${periodType}`
  }
  if (periodStart) {
    query = sql`${query} AND us.period_start >= ${periodStart}`
  }
  if (periodEnd) {
    query = sql`${query} AND us.period_end <= ${periodEnd}`
  }
  if (userId) {
    query = sql`${query} AND us.user_id = ${userId}`
  }

  const snapshots = await query

  let recomputed = 0
  let skipped = 0

  for (const snap of snapshots) {
    const s = snap as {
      id: string; upload_request_id: string; user_id: string; device_id: string;
      period_type: string; period_start: string; period_end: string; total_tokens: number
    }

    // Check visibility — don't recompute hidden/rejected
    const existing = await sql`
      SELECT id FROM leaderboard_metrics
      WHERE upload_request_id = ${s.upload_request_id}
        AND visibility IN ('hidden')
      LIMIT 1
    `
    if (existing.length > 0) {
      skipped++
      continue
    }

    // Get the snapshot's breakdown data from upload_requests
    const uploadReq = await sql`
      SELECT result_summary FROM upload_requests WHERE id = ${s.upload_request_id}
    `
    if (uploadReq.length === 0) {
      skipped++
      continue
    }

    const summary = (uploadReq[0] as { result_summary: Record<string, unknown> }).result_summary
    const snapshotData = summary?.snapshots?.[0]
    if (!snapshotData) {
      skipped++
      continue
    }

    const breakdowns = snapshotData.breakdowns || []

    // Compute cost for each breakdown
    for (const bd of breakdowns) {
      const scopeType = bd.scope_type
      const tool = bd.tool || null
      const model = bd.model || null

      const inputTokens = bd.input_tokens || 0
      const outputTokens = bd.output_tokens || 0
      const cacheReadTokens = bd.cache_read_tokens || 0
      const cacheWriteTokens = bd.cache_write_tokens || 0
      const thinkingTokens = bd.thinking_tokens || 0
      const totalTokens = bd.total_tokens || 0

      // Calculate cost using price table
      let costUsd = 0
      let hasUnknownCost = false
      if (model && priceMap.has(model)) {
        const p = priceMap.get(model)!
        costUsd = (inputTokens * p.input + outputTokens * p.output +
                   cacheReadTokens * p.cache_read + cacheWriteTokens * p.cache_write) / 1_000_000
      } else if (model && model !== 'unknown') {
        hasUnknownCost = true
      }

      const id = nanoid()
      await sql`
        INSERT INTO leaderboard_metrics (
          id, upload_request_id, user_id, device_id,
          period_type, period_start, period_end,
          scope_type, tool, model,
          input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens,
          total_tokens, total_cost_usd, pricing_version, has_unknown_cost, visibility
        ) VALUES (
          ${id}, ${s.upload_request_id}, ${s.user_id}, ${s.device_id},
          ${s.period_type}, ${s.period_start}, ${s.period_end},
          ${scopeType}, ${tool}, ${model},
          ${inputTokens}, ${outputTokens}, ${cacheReadTokens}, ${cacheWriteTokens}, ${thinkingTokens},
          ${totalTokens}, ${costUsd}, ${pricingVersion}, ${hasUnknownCost}, 'public'
        )
        ON CONFLICT (user_id, period_type, period_start, scope_type, COALESCE(tool, ''), COALESCE(model, ''))
        DO UPDATE SET
          total_tokens = EXCLUDED.total_tokens,
          total_cost_usd = EXCLUDED.total_cost_usd,
          pricing_version = EXCLUDED.pricing_version,
          has_unknown_cost = EXCLUDED.has_unknown_cost,
          updated_at = NOW()
        WHERE leaderboard_metrics.visibility NOT IN ('hidden')
      `
    }

    recomputed++
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
