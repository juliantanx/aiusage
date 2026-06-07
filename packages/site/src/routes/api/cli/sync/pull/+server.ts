import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { sql } from '$lib/server/db/pool.js'
import { verifyUploadRequest } from '$lib/server/uploads/verify.js'
import { getConfigValue, CFG } from '$lib/server/config.js'
import { checkCloudSyncAccess } from '$lib/server/cloud/star-check.js'

export const GET: RequestHandler = async ({ request, url }) => {
  const defaultLimit = await getConfigValue(CFG.SYNC_PULL_DEFAULT_LIMIT)
  const maxLimit = await getConfigValue(CFG.SYNC_PULL_MAX_LIMIT)

  // Verify HMAC signature (pull uses same auth as push)
  const bodyText = '' // GET has no body
  const verification = await verifyUploadRequest(request, bodyText)
  if (!verification.valid) {
    const status = verification.error_code === 'rate_limited' ? 429 : 401
    return json({ error: verification.error, error_code: verification.error_code }, { status })
  }

  const userId = verification.userId!
  const deviceId = verification.deviceId!

  // Star gate check
  const starCheck = await checkCloudSyncAccess(userId)
  if (!starCheck.allowed) {
    return json({
      error: { code: starCheck.error_code, message: starCheck.message, repo: starCheck.repo, url: starCheck.url }
    }, { status: 403 })
  }

  const cursor = url.searchParams.get('cursor')
  const limit = Math.min(Math.max(1, parseInt(url.searchParams.get('limit') || String(defaultLimit))), maxLimit)

  // Get current sync generation
  const reset = await sql`SELECT sync_generation FROM cloud_sync_resets WHERE user_id = ${userId}`
  const currentGeneration = reset.length > 0 ? (reset[0] as { sync_generation: number }).sync_generation : 1

  // Query records from all devices (including self), using change_seq as cursor.
  // Local merge logic (mergeSyncedRecordsIntoRecords) deduplicates via LEFT JOIN,
  // so self-records won't cause duplicates.
  const cursorValue = cursor ? parseInt(cursor) : 0

  const rows = await sql`
    SELECT
      record_id, ts, tool, model, provider,
      input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens,
      cost, cost_source, session_key, source_file, cwd,
      device_instance_id, device_name, platform, updated_at, deleted_at, change_seq
    FROM cloud_usage_records
    WHERE user_id = ${userId}
      AND sync_generation = ${currentGeneration}
      AND change_seq > ${cursorValue}
    ORDER BY change_seq ASC
    LIMIT ${limit + 1}
  `

  const hasMore = rows.length > limit
  const resultRows = hasMore ? rows.slice(0, limit) : rows

  const records: Array<Record<string, unknown>> = []
  const tombstones: Array<Record<string, unknown>> = []

  for (const row of resultRows) {
    const r = row as Record<string, unknown>
    if (r.deleted_at) {
      tombstones.push({
        record_id: r.record_id,
        device_instance_id: r.device_instance_id,
        deleted_at: r.deleted_at,
        updated_at: r.updated_at
      })
    } else {
      records.push({
        record_id: r.record_id,
        ts: r.ts,
        tool: r.tool,
        model: r.model,
        provider: r.provider,
        inputTokens: r.input_tokens,
        outputTokens: r.output_tokens,
        cacheReadTokens: r.cache_read_tokens,
        cacheWriteTokens: r.cache_write_tokens,
        thinkingTokens: r.thinking_tokens,
        cost: r.cost,
        costSource: r.cost_source,
        sessionKey: r.session_key,
        sourceFile: r.source_file,
        cwd: r.cwd,
        deviceInstanceId: r.device_instance_id,
        deviceName: r.device_name,
        platform: r.platform,
        updatedAt: r.updated_at
      })
    }
  }

  const nextCursor = hasMore ? String((resultRows[resultRows.length - 1] as Record<string, unknown>).change_seq) : null

  // Update sync state
  try {
    await sql`
      INSERT INTO cloud_sync_state (user_id, device_id, last_pull_at, last_server_cursor, updated_at)
      VALUES (${userId}, ${deviceId}, NOW(), ${nextCursor}, NOW())
      ON CONFLICT (user_id, device_id)
      DO UPDATE SET last_pull_at = NOW(), last_server_cursor = ${nextCursor}, updated_at = NOW()
    `
  } catch {}

  return json({
    records,
    tombstones,
    sync_generation: currentGeneration,
    next_cursor: nextCursor,
    has_more: hasMore
  })
}
