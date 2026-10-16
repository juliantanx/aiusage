import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { sql } from '$lib/server/db/pool.js'
import { verifyUploadRequest } from '$lib/server/uploads/verify.js'
import { getConfigValue, CFG } from '$lib/server/config.js'
import { checkCloudSyncAccess } from '$lib/server/cloud/star-check.js'
import { nanoid } from 'nanoid'

/** A record of a push that was not stored, and why. */
export interface RejectedRecord {
  id: string | null
  reason: 'missing_field' | 'invalid_value'
}

/** A tombstone of a push that was not applied, and why. */
export interface RejectedTombstone {
  record_id: string | null
  reason: 'missing_field' | 'invalid_value'
}

/** Why a pushed tombstone cannot be applied, or null when it can (see `recordProblem`). */
function tombstoneProblem(tombstone: Record<string, unknown>): RejectedTombstone['reason'] | null {
  if (!tombstone.record_id) return 'missing_field'
  if (typeof tombstone.record_id !== 'string' || tombstone.record_id.includes('\u0000')) return 'invalid_value'
  const updatedAt = tombstone.updatedAt
  if (updatedAt != null && (typeof updatedAt !== 'number' || !Number.isSafeInteger(updatedAt) || updatedAt < 0)) return 'invalid_value'
  return null
}

const BIGINT_FIELDS = ['ts', 'inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'thinkingTokens', 'updatedAt'] as const
const TEXT_FIELDS = ['id', 'tool', 'model', 'provider', 'costSource', 'sessionKey', 'sourceFile', 'cwd', 'deviceName', 'platform'] as const
// cost is NUMERIC(20, 8): at most 12 digits before the decimal point.
const MAX_COST = 1e12

/**
 * Why a pushed record cannot be stored, or null when it can. Checked before
 * the record reaches the database: a statement that fails aborts the whole
 * PostgreSQL transaction, so one bad record would fail the batch it came in
 * and every retry of it.
 */
function recordProblem(record: Record<string, unknown>): RejectedRecord['reason'] | null {
  if (!record.id || !record.tool || !record.model) return 'missing_field'
  for (const field of TEXT_FIELDS) {
    const value = record[field]
    if (value == null) continue
    // PostgreSQL text cannot hold NUL.
    if (typeof value !== 'string' || value.includes('\u0000')) return 'invalid_value'
  }
  for (const field of BIGINT_FIELDS) {
    const value = record[field]
    if (value == null) continue
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return 'invalid_value'
  }
  if (record.cost != null && (typeof record.cost !== 'number' || !Number.isFinite(record.cost) || Math.abs(record.cost) >= MAX_COST)) {
    return 'invalid_value'
  }
  return null
}

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

  // Star gate check
  const starCheck = await checkCloudSyncAccess(userId)
  if (!starCheck.allowed) {
    return json({
      error: { code: starCheck.error_code, message: starCheck.message, repo: starCheck.repo, url: starCheck.url }
    }, { status: 403 })
  }

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
  const serverGeneration = reset.length > 0 ? Number((reset[0] as { sync_generation: string | number }).sync_generation) : 1

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
  // Records not written: older than or equal to the stored version (the
  // server already has it), or rejected below.
  let skipped = 0
  // Records that were not stored at all. The client must not count them as
  // synced; older clients ignore the field.
  const rejected: RejectedRecord[] = []
  // Tombstones that were not applied, likewise: the client keeps them to send
  // again instead of forgetting them as retracted.
  const rejectedTombstones: RejectedTombstone[] = []

  try {
    await sql.begin(async (tx) => {
      // Upsert records
      for (const record of records) {
        const problem = record !== null && typeof record === 'object' ? recordProblem(record) : 'invalid_value'
        if (problem) {
          rejected.push({ id: typeof record?.id === 'string' ? record.id : null, reason: problem })
          skipped++
          continue
        }

        const id = nanoid()
        const updatedAt = record.updatedAt || Date.now()
        // Plain INSERT first: a returned row means the record is new.
        const created = await tx`
          INSERT INTO cloud_usage_records (
            id, user_id, device_id, device_instance_id, sync_generation,
            record_id, ts, tool, model, provider,
            input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens,
            cost, cost_source, session_key, source_file, cwd,
            device_name, platform, updated_at, server_updated_at
          ) VALUES (
            ${id}, ${userId}, ${deviceId}, ${deviceInstanceId}, ${serverGeneration},
            ${record.id}, ${record.ts || 0}, ${record.tool}, ${record.model}, ${record.provider || ''},
            ${record.inputTokens || 0}, ${record.outputTokens || 0}, ${record.cacheReadTokens || 0},
            ${record.cacheWriteTokens || 0}, ${record.thinkingTokens || 0},
            ${record.cost ?? null}, ${record.costSource || null}, ${record.sessionKey || ''},
            ${record.sourceFile || ''}, ${record.cwd || ''},
            ${record.deviceName || null}, ${record.platform || null},
            ${updatedAt}, NOW()
          )
          ON CONFLICT (user_id, sync_generation, device_instance_id, record_id) DO NOTHING
          RETURNING id
        `
        if (created.length > 0) {
          inserted++
          continue
        }

        // The row already exists: apply the record only if it is newer.
        // No returned row means it was older/equal and nothing changed.
        const changed = await tx`
          UPDATE cloud_usage_records SET
            ts = ${record.ts || 0},
            tool = ${record.tool},
            model = ${record.model},
            provider = ${record.provider || ''},
            input_tokens = ${record.inputTokens || 0},
            output_tokens = ${record.outputTokens || 0},
            cache_read_tokens = ${record.cacheReadTokens || 0},
            cache_write_tokens = ${record.cacheWriteTokens || 0},
            thinking_tokens = ${record.thinkingTokens || 0},
            cost = ${record.cost ?? null},
            cost_source = ${record.costSource || null},
            session_key = ${record.sessionKey || ''},
            source_file = ${record.sourceFile || ''},
            cwd = ${record.cwd || ''},
            device_name = ${record.deviceName || null},
            platform = ${record.platform || null},
            updated_at = ${updatedAt},
            server_updated_at = NOW(),
            deleted_at = NULL
          WHERE user_id = ${userId} AND sync_generation = ${serverGeneration}
            AND device_instance_id = ${deviceInstanceId} AND record_id = ${record.id}
            AND updated_at < ${updatedAt}
          RETURNING id
        `
        if (changed.length > 0) updated++
        else skipped++
      }

      // Process tombstones
      for (const tombstone of tombstones) {
        const problem = tombstone !== null && typeof tombstone === 'object' ? tombstoneProblem(tombstone) : 'invalid_value'
        if (problem) {
          rejectedTombstones.push({ record_id: typeof tombstone?.record_id === 'string' ? tombstone.record_id : null, reason: problem })
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
      rejected,
      rejected_tombstones: rejectedTombstones,
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
