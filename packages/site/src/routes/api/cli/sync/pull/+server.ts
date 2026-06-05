import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { sql } from '$lib/server/db/pool.js'
import { verifyUploadRequest } from '$lib/server/uploads/verify.js'

const DEFAULT_LIMIT = 1000
const MAX_LIMIT = 2000

export const GET: RequestHandler = async ({ request, url }) => {
  // Verify HMAC signature (pull uses same auth as push)
  const bodyText = '' // GET has no body
  const verification = await verifyUploadRequest(request, bodyText)
  if (!verification.valid) {
    const status = verification.error_code === 'rate_limited' ? 429 : 401
    return json({ error: verification.error, error_code: verification.error_code }, { status })
  }

  const userId = verification.userId!
  const deviceId = verification.deviceId!

  const cursor = url.searchParams.get('cursor')
  const limit = Math.min(Math.max(1, parseInt(url.searchParams.get('limit') || String(DEFAULT_LIMIT))), MAX_LIMIT)

  // Get device instance to exclude self
  const instance = await sql`
    SELECT device_instance_id, sync_generation FROM cloud_device_instances
    WHERE user_id = ${userId} AND device_id = ${deviceId}
  `

  if (instance.length === 0) {
    return json({
      records: [],
      tombstones: [],
      sync_generation: 1,
      next_cursor: null,
      has_more: false
    })
  }

  const instanceRow = instance[0] as { device_instance_id: string; sync_generation: number }
  const excludeDeviceInstanceId = instanceRow.device_instance_id

  // Get current sync generation
  const reset = await sql`SELECT sync_generation FROM cloud_sync_resets WHERE user_id = ${userId}`
  const currentGeneration = reset.length > 0 ? (reset[0] as { sync_generation: number }).sync_generation : 1

  // Query records from other devices, using change_seq as cursor
  const cursorValue = cursor ? parseInt(cursor) : 0

  const rows = await sql`
    SELECT
      record_id, ts, tool, model, provider,
      input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens,
      cost, cost_source, session_key, source_file, cwd,
      device_name, platform, updated_at, deleted_at, change_seq
    FROM cloud_usage_records
    WHERE user_id = ${userId}
      AND sync_generation = ${currentGeneration}
      AND device_instance_id != ${excludeDeviceInstanceId}
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
        device_instance_id: excludeDeviceInstanceId, // tell client which device was excluded
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
