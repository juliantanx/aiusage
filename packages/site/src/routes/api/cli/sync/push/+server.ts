import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { sql } from '$lib/server/db/pool.js'
import { verifyUploadRequest } from '$lib/server/uploads/verify.js'
import { getConfigValue, CFG } from '$lib/server/config.js'
import { nanoid } from 'nanoid'

export const POST: RequestHandler = async ({ request }) => {
  const maxRecords = await getConfigValue(CFG.SYNC_MAX_RECORDS)
  const maxTombstones = await getConfigValue(CFG.SYNC_MAX_TOMBSTONES)
  const bodyMaxSize = await getConfigValue(CFG.SYNC_BODY_MAX_SIZE)

  const contentType = request.headers.get('Content-Type')
  if (!contentType || !contentType.includes('application/json')) {
    return json({ error: 'Content-Type must be application/json', error_code: 'invalid_content_type' }, { status: 415 })
  }

  const bodyText = await request.text()
  if (bodyText.length > bodyMaxSize) {
    return json({ error: 'Payload too large', error_code: 'payload_too_large' }, { status: 413 })
  }

  let body: Record<string, unknown>
  try {
    body = JSON.parse(bodyText)
  } catch {
    return json({ error: 'Invalid JSON', error_code: 'invalid_json' }, { status: 400 })
  }

  // Verify HMAC signature (reuse existing upload verification)
  const verification = await verifyUploadRequest(request, bodyText)
  if (!verification.valid) {
    const status = verification.error_code === 'rate_limited' ? 429 : 401
    return json({ error: verification.error, error_code: verification.error_code }, { status })
  }

  const userId = verification.userId!
  const deviceId = verification.deviceId!
  const idempotencyKey = verification.idempotencyKey!

  // Check idempotency
  const existing = await sql`
    SELECT id, status, record_count FROM cloud_sync_batches
    WHERE device_id = ${deviceId} AND idempotency_key = ${idempotencyKey}
  `
  if (existing.length > 0) {
    const batch = existing[0] as { id: string; status: string; record_count: number }
    return json({
      status: batch.status,
      batch_id: batch.id,
      record_count: batch.record_count,
      message: 'Already processed'
    })
  }

  // Validate body
  const schemaVersion = body.schema_version
  if (schemaVersion !== 1) {
    return json({ error: 'Unsupported schema version', error_code: 'unsupported_schema_version' }, { status: 400 })
  }

  const deviceInstanceId = body.device_instance_id
  if (typeof deviceInstanceId !== 'string' || !deviceInstanceId) {
    return json({ error: 'Missing device_instance_id', error_code: 'invalid_payload' }, { status: 400 })
  }

  const clientSyncGeneration = body.sync_generation
  if (typeof clientSyncGeneration !== 'number') {
    return json({ error: 'Missing sync_generation', error_code: 'invalid_payload' }, { status: 400 })
  }

  const records = Array.isArray(body.records) ? body.records : []
  const tombstones = Array.isArray(body.tombstones) ? body.tombstones : []

  if (records.length > maxRecords) {
    return json({ error: `Too many records (max ${maxRecords})`, error_code: 'payload_too_large' }, { status: 400 })
  }
  if (tombstones.length > maxTombstones) {
    return json({ error: `Too many tombstones (max ${maxTombstones})`, error_code: 'payload_too_large' }, { status: 400 })
  }

  // Get or create cloud device instance
  let instance = await sql`
    SELECT id, sync_generation FROM cloud_device_instances
    WHERE user_id = ${userId} AND device_instance_id = ${deviceInstanceId}
  `

  if (instance.length === 0) {
    // First time this device syncs — create instance
    const instanceId = nanoid()
    await sql`
      INSERT INTO cloud_device_instances (id, user_id, device_id, device_instance_id, sync_generation)
      VALUES (${instanceId}, ${userId}, ${deviceId}, ${deviceInstanceId}, 1)
    `
    instance = [{ id: instanceId, sync_generation: 1 }]
  }

  const instanceRow = instance[0] as { id: string; sync_generation: number }

  // Check sync generation
  const reset = await sql`SELECT sync_generation FROM cloud_sync_resets WHERE user_id = ${userId}`
  const serverGeneration = reset.length > 0 ? (reset[0] as { sync_generation: number }).sync_generation : 1

  if (clientSyncGeneration < serverGeneration) {
    return json({
      error: 'Sync generation stale. Please pull first.',
      error_code: 'sync_generation_stale',
      server_generation: serverGeneration
    }, { status: 409 })
  }

  // Process records and tombstones in a transaction
  const batchId = nanoid()
  let inserted = 0
  let updated = 0
  let skipped = 0

  try {
    await sql.begin(async (tx) => {
      // Upsert records
      for (const record of records) {
        if (!record.record_id || !record.tool || !record.model) {
          skipped++
          continue
        }

        const id = nanoid()
        try {
          await tx`
            INSERT INTO cloud_usage_records (
              id, user_id, device_id, device_instance_id, sync_generation,
              record_id, ts, tool, model, provider,
              input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens,
              cost, cost_source, session_key, source_file, cwd,
              device_name, platform, updated_at, server_updated_at
            ) VALUES (
              ${id}, ${userId}, ${deviceId}, ${deviceInstanceId}, ${serverGeneration},
              ${record.record_id}, ${record.ts || 0}, ${record.tool}, ${record.model}, ${record.provider || ''},
              ${record.inputTokens || 0}, ${record.outputTokens || 0}, ${record.cacheReadTokens || 0},
              ${record.cacheWriteTokens || 0}, ${record.thinkingTokens || 0},
              ${record.cost ?? null}, ${record.costSource || null}, ${record.sessionKey || ''},
              ${record.sourceFile || ''}, ${record.cwd || ''},
              ${record.deviceName || null}, ${record.platform || null},
              ${record.updatedAt || Date.now()}, NOW()
            )
            ON CONFLICT (user_id, sync_generation, device_instance_id, record_id)
            DO UPDATE SET
              ts = EXCLUDED.ts,
              tool = EXCLUDED.tool,
              model = EXCLUDED.model,
              provider = EXCLUDED.provider,
              input_tokens = EXCLUDED.input_tokens,
              output_tokens = EXCLUDED.output_tokens,
              cache_read_tokens = EXCLUDED.cache_read_tokens,
              cache_write_tokens = EXCLUDED.cache_write_tokens,
              thinking_tokens = EXCLUDED.thinking_tokens,
              cost = EXCLUDED.cost,
              cost_source = EXCLUDED.cost_source,
              session_key = EXCLUDED.session_key,
              source_file = EXCLUDED.source_file,
              cwd = EXCLUDED.cwd,
              device_name = EXCLUDED.device_name,
              platform = EXCLUDED.platform,
              updated_at = EXCLUDED.updated_at,
              server_updated_at = NOW(),
              deleted_at = NULL
            WHERE EXCLUDED.updated_at > cloud_usage_records.updated_at
          `
          inserted++
        } catch {
          skipped++
        }
      }

      // Process tombstones
      for (const tombstone of tombstones) {
        if (!tombstone.record_id) {
          skipped++
          continue
        }
        await tx`
          UPDATE cloud_usage_records
          SET deleted_at = NOW(), server_updated_at = NOW(), updated_at = ${tombstone.updatedAt || Date.now()}
          WHERE user_id = ${userId} AND sync_generation = ${serverGeneration}
            AND device_instance_id = ${deviceInstanceId} AND record_id = ${tombstone.record_id}
        `
      }

      // Record batch
      await tx`
        INSERT INTO cloud_sync_batches (id, user_id, device_id, idempotency_key, direction, record_count, status)
        VALUES (${batchId}, ${userId}, ${deviceId}, ${idempotencyKey}, 'push', ${records.length}, 'accepted')
      `

      // Update device instance cursor
      await tx`
        UPDATE cloud_device_instances
        SET last_push_cursor = ${body.server_cursor || null}, updated_at = NOW()
        WHERE id = ${instanceRow.id}
      `

      // Update sync state
      await tx`
        INSERT INTO cloud_sync_state (user_id, device_id, last_push_at, updated_at)
        VALUES (${userId}, ${deviceId}, NOW(), NOW())
        ON CONFLICT (user_id, device_id)
        DO UPDATE SET last_push_at = NOW(), updated_at = NOW()
      `
    })

    // Get latest change_seq for cursor
    const cursorRow = await sql`
      SELECT MAX(change_seq) as max_seq FROM cloud_usage_records WHERE user_id = ${userId}
    `
    const serverCursor = String((cursorRow[0] as { max_seq: number | null })?.max_seq || '0')

    return json({
      status: 'accepted',
      batch_id: batchId,
      inserted,
      updated,
      skipped,
      sync_generation: serverGeneration,
      server_cursor: serverCursor
    })
  } catch (err) {
    // Record failed batch
    try {
      await sql`
        INSERT INTO cloud_sync_batches (id, user_id, device_id, idempotency_key, direction, record_count, status, error_code)
        VALUES (${batchId}, ${userId}, ${deviceId}, ${idempotencyKey}, 'push', ${records.length}, 'failed', 'server_error')
      `
    } catch {}

    return json({ error: 'Internal server error', error_code: 'server_error' }, { status: 500 })
  }
}
