import { sql } from '../db/pool.js'
import { decryptDeviceSecret, sha256, buildCanonicalString, hashIp, computeHmac } from '../crypto/hmac.js'
import { nanoid } from 'nanoid'
import { createHmac } from 'node:crypto'

const TIMESTAMP_WINDOW_MS = 5 * 60 * 1000 // 5 minutes
const ALLOWED_PERIOD_TYPES = ['daily', 'weekly', 'monthly', 'yearly', 'all_time']
const MAX_TOKENS_PER_SNAPSHOT = 100_000_000_000 // 100B
const MAX_PAYLOAD_SIZE = 50_000 // 50KB

export interface UploadSnapshot {
  period_type: string
  period_start: string
  period_end: string
  total_tokens: number
  token_snapshot_hash: string
}

export interface UploadRequest {
  schema_version: number
  client_version: string
  client_platform: string
  snapshots: UploadSnapshot[]
}

export interface SnapshotResult {
  period_type: string
  period_start: string
  status: 'accepted' | 'rejected' | 'flagged'
  reason_code?: string
  reason_message?: string
}

export interface UploadResult {
  status: 'accepted' | 'rejected' | 'flagged'
  snapshots: SnapshotResult[]
  error?: string
  error_code?: string
}

const ALLOWED_FIELDS = new Set(['schema_version', 'client_version', 'client_platform', 'snapshots'])
const ALLOWED_SNAPSHOT_FIELDS = new Set(['period_type', 'period_start', 'period_end', 'total_tokens', 'token_snapshot_hash'])

export function validatePayload(body: unknown): { valid: boolean; error?: string; error_code?: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Invalid JSON body', error_code: 'invalid_payload' }
  }

  const obj = body as Record<string, unknown>

  // Check for forbidden fields
  for (const key of Object.keys(obj)) {
    if (!ALLOWED_FIELDS.has(key)) {
      return { valid: false, error: `Forbidden field: ${key}`, error_code: 'payload_forbidden_field' }
    }
  }

  if (typeof obj.schema_version !== 'number' || obj.schema_version !== 1) {
    return { valid: false, error: 'Unsupported schema version', error_code: 'unsupported_schema_version' }
  }

  if (typeof obj.client_version !== 'string') {
    return { valid: false, error: 'Missing client_version', error_code: 'invalid_payload' }
  }

  if (!['macos', 'linux', 'windows'].includes(obj.client_platform as string)) {
    return { valid: false, error: 'Invalid client_platform', error_code: 'invalid_payload' }
  }

  if (!Array.isArray(obj.snapshots) || obj.snapshots.length === 0) {
    return { valid: false, error: 'Missing or empty snapshots', error_code: 'invalid_payload' }
  }

  for (const snap of obj.snapshots as Record<string, unknown>[]) {
    for (const key of Object.keys(snap)) {
      if (!ALLOWED_SNAPSHOT_FIELDS.has(key)) {
        return { valid: false, error: `Forbidden snapshot field: ${key}`, error_code: 'payload_forbidden_field' }
      }
    }

    if (!ALLOWED_PERIOD_TYPES.includes(snap.period_type as string)) {
      return { valid: false, error: `Invalid period_type: ${snap.period_type}`, error_code: 'invalid_period_boundary' }
    }

    if (typeof snap.total_tokens !== 'number' || snap.total_tokens < 0 || !Number.isInteger(snap.total_tokens)) {
      return { valid: false, error: 'Invalid total_tokens', error_code: 'invalid_token_value' }
    }
  }

  return { valid: true }
}

export async function verifyUploadRequest(
  request: Request,
  bodyText: string
): Promise<{ valid: boolean; deviceId?: string; userId?: string; error?: string; error_code?: string }> {
  const deviceId = request.headers.get('X-AIUsage-Device-Id')
  const timestamp = request.headers.get('X-AIUsage-Timestamp')
  const nonce = request.headers.get('X-AIUsage-Nonce')
  const idempotencyKey = request.headers.get('X-AIUsage-Idempotency-Key')
  const signature = request.headers.get('X-AIUsage-Signature')

  if (!deviceId || !timestamp || !nonce || !idempotencyKey || !signature) {
    return { valid: false, error: 'Missing required headers', error_code: 'invalid_signature' }
  }

  // Check device exists and is active
  const devices = await sql`
    SELECT d.id, d.user_id, d.secret_encrypted, d.status, u.status as user_status
    FROM user_devices d
    JOIN users u ON u.id = d.user_id
    WHERE d.id = ${deviceId}
  `
  const device = devices[0] as { id: string; user_id: string; secret_encrypted: string; status: string; user_status: string } | undefined

  if (!device) {
    return { valid: false, error: 'Device not found', error_code: 'device_not_found' }
  }
  if (device.status === 'revoked') {
    return { valid: false, error: 'Device revoked', error_code: 'device_revoked' }
  }
  if (device.user_status === 'banned') {
    return { valid: false, error: 'User banned', error_code: 'user_banned' }
  }

  // Check timestamp
  const ts = parseInt(timestamp, 10)
  if (isNaN(ts) || Math.abs(Date.now() - ts) > TIMESTAMP_WINDOW_MS) {
    return { valid: false, error: 'Timestamp expired', error_code: 'timestamp_expired' }
  }

  // Check nonce
  const existingNonce = await sql`SELECT nonce FROM upload_nonces WHERE device_id = ${deviceId} AND nonce = ${nonce}`
  if (existingNonce[0]) {
    return { valid: false, error: 'Nonce reused', error_code: 'nonce_reused' }
  }

  // Verify signature
  const bodyHash = sha256(bodyText)
  const path = new URL(request.url).pathname
  const canonical = buildCanonicalString(request.method, path, bodyHash, timestamp, nonce, deviceId, idempotencyKey)

  let deviceSecret: string
  try {
    deviceSecret = decryptDeviceSecret(device.secret_encrypted)
  } catch {
    return { valid: false, error: 'Failed to decrypt device secret', error_code: 'invalid_signature' }
  }

  const expectedSig = `hmac-sha256=${computeHmacForVerify(canonical, deviceSecret)}`
  if (!timingSafeEqual(expectedSig, signature)) {
    return { valid: false, error: 'Invalid signature', error_code: 'invalid_signature' }
  }

  // Store nonce
  await sql`INSERT INTO upload_nonces (device_id, nonce) VALUES (${deviceId}, ${nonce})`

  // Update last_used_at
  await sql`UPDATE user_devices SET last_used_at = NOW() WHERE id = ${deviceId}`

  return { valid: true, deviceId, userId: device.user_id }
}

function computeHmacForVerify(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('hex')
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

export function validatePeriodBoundary(snap: UploadSnapshot): boolean {
  const start = new Date(snap.period_start)
  if (isNaN(start.getTime())) return false

  switch (snap.period_type) {
    case 'daily':
      return start.getUTCHours() === 0 && start.getUTCMinutes() === 0 && start.getUTCSeconds() === 0 && start.getUTCMilliseconds() === 0
    case 'weekly':
      return start.getUTCDay() === 1 && start.getUTCHours() === 0 && start.getUTCMinutes() === 0 && start.getUTCSeconds() === 0
    case 'monthly':
      return start.getUTCDate() === 1 && start.getUTCHours() === 0 && start.getUTCMinutes() === 0 && start.getUTCSeconds() === 0
    case 'yearly':
      return start.getUTCMonth() === 0 && start.getUTCDate() === 1 && start.getUTCHours() === 0 && start.getUTCMinutes() === 0 && start.getUTCSeconds() === 0
    case 'all_time':
      return snap.period_start === '1970-01-01T00:00:00.000Z'
    default:
      return false
  }
}

export async function riskCheck(
  userId: string,
  deviceId: string,
  snap: UploadSnapshot
): Promise<{ flagged: boolean; reason_code?: string; reason_message?: string }> {
  // Check token threshold
  const thresholds: Record<string, number> = {
    daily: 10_000_000,
    weekly: 50_000_000,
    monthly: 200_000_000,
    yearly: 2_000_000_000,
    all_time: 5_000_000_000
  }

  if (snap.total_tokens > (thresholds[snap.period_type] || MAX_TOKENS_PER_SNAPSHOT)) {
    return {
      flagged: true,
      reason_code: `token_exceeds_${snap.period_type}_threshold`,
      reason_message: `${snap.period_type} total_tokens ${snap.total_tokens} exceeds threshold`
    }
  }

  // Check for rapid overwrites
  const recentUploads = await sql`
    SELECT id FROM upload_snapshots
    WHERE user_id = ${userId} AND period_type = ${snap.period_type} AND period_start = ${snap.period_start}
    AND created_at > NOW() - INTERVAL '10 minutes'
  `
  if (recentUploads.length >= 3) {
    return {
      flagged: true,
      reason_code: 'frequent_period_overwrite',
      reason_message: `${recentUploads.length} uploads for ${snap.period_type} in last 10 minutes`
    }
  }

  // Check for large jump
  const lastAccepted = await sql`
    SELECT total_tokens FROM leaderboard_entries
    WHERE user_id = ${userId} AND period_type = ${snap.period_type} AND period_start = ${snap.period_start}
  `
  if (lastAccepted[0]) {
    const prev = Number((lastAccepted[0] as { total_tokens: bigint }).total_tokens)
    if (prev > 0 && snap.total_tokens > prev * 10) {
      return {
        flagged: true,
        reason_code: 'large_token_jump',
        reason_message: `total_tokens increased from ${prev} to ${snap.total_tokens}`
      }
    }
    if (snap.total_tokens < prev * 0.1 && prev > 10000) {
      return {
        flagged: true,
        reason_code: 'token_regression',
        reason_message: `total_tokens decreased from ${prev} to ${snap.total_tokens}`
      }
    }
  }

  return { flagged: false }
}

export async function processUpload(
  userId: string,
  deviceId: string,
  request: UploadRequest,
  ip: string
): Promise<UploadResult> {
  const idempotencyKey = `upload:${deviceId}:${JSON.stringify(request.snapshots.map(s => s.period_type))}`

  // Check idempotency
  const existing = await sql`
    SELECT id, status, payload_hash, result_summary FROM upload_requests
    WHERE device_id = ${deviceId} AND idempotency_key = ${idempotencyKey}
  `
  if (existing[0]) {
    const ex = existing[0] as { id: string; status: string; payload_hash: string; result_summary: unknown }
    const currentHash = sha256(JSON.stringify(request))
    if (ex.payload_hash === currentHash) {
      return { status: ex.status as 'accepted' | 'rejected' | 'flagged', snapshots: (ex.result_summary as SnapshotResult[]) || [] }
    }
    return { status: 'rejected', snapshots: [], error: 'Idempotency conflict', error_code: 'idempotency_conflict' }
  }

  const requestId = nanoid()
  const payloadHash = sha256(JSON.stringify(request))
  const ipHash = hashIp(ip)

  // Check rate limits
  const recentRequests = await sql`
    SELECT COUNT(*) as cnt FROM upload_requests
    WHERE device_id = ${deviceId} AND created_at > NOW() - INTERVAL '1 hour'
  `
  if (Number((recentRequests[0] as { cnt: bigint }).cnt) >= 10) {
    return { status: 'rejected', snapshots: [], error: 'Rate limited', error_code: 'rate_limited' }
  }

  const snapshotResults: SnapshotResult[] = []
  let hasAccepted = false
  let allFlagged = true

  for (const snap of request.snapshots) {
    // Validate period boundary
    if (!validatePeriodBoundary(snap)) {
      snapshotResults.push({
        period_type: snap.period_type,
        period_start: snap.period_start,
        status: 'rejected',
        reason_code: 'invalid_period_boundary',
        reason_message: 'Period boundary does not match UTC rules'
      })
      continue
    }

    // Risk check
    const risk = await riskCheck(userId, deviceId, snap)
    if (risk.flagged) {
      snapshotResults.push({
        period_type: snap.period_type,
        period_start: snap.period_start,
        status: 'flagged',
        reason_code: risk.reason_code,
        reason_message: risk.reason_message
      })
      continue
    }

    allFlagged = false
    hasAccepted = true
    snapshotResults.push({
      period_type: snap.period_type,
      period_start: snap.period_start,
      status: 'accepted'
    })
  }

  const requestStatus = allFlagged && snapshotResults.length > 0 ? 'flagged' : hasAccepted ? 'accepted' : 'rejected'

  // Store upload request
  await sql`
    INSERT INTO upload_requests (id, user_id, device_id, idempotency_key, payload_hash, status, result_summary, client_version, client_platform, schema_version, ip_hash)
    VALUES (${requestId}, ${userId}, ${deviceId}, ${idempotencyKey}, ${payloadHash}, ${requestStatus}, ${JSON.stringify(snapshotResults)}, ${request.client_version}, ${request.client_platform}, ${request.schema_version}, ${ipHash})
  `

  // Process accepted snapshots
  for (let i = 0; i < request.snapshots.length; i++) {
    const snap = request.snapshots[i]
    const result = snapshotResults[i]

    const snapId = nanoid()
    const entryId = nanoid()

    // Store snapshot
    if (result.status === 'accepted') {
      await sql`
        INSERT INTO upload_snapshots (id, upload_request_id, user_id, device_id, period_type, period_start, period_end, total_tokens, token_snapshot_hash, status)
        VALUES (${snapId}, ${requestId}, ${userId}, ${deviceId}, ${snap.period_type}, ${snap.period_start}, ${snap.period_end}, ${snap.total_tokens}, ${snap.token_snapshot_hash}, 'accepted')
      `

      // Upsert leaderboard entry
      await sql`
        INSERT INTO leaderboard_entries (id, user_id, period_type, period_start, period_end, total_tokens, visibility, source_snapshot_id)
        VALUES (${entryId}, ${userId}, ${snap.period_type}, ${snap.period_start}, ${snap.period_end}, ${snap.total_tokens}, 'public', ${snapId})
        ON CONFLICT (user_id, period_type, period_start)
        DO UPDATE SET
          total_tokens = ${snap.total_tokens},
          period_end = ${snap.period_end},
          source_snapshot_id = ${snapId},
          updated_at = NOW()
      `
    } else if (result.status === 'flagged') {
      await sql`
        INSERT INTO upload_snapshots (id, upload_request_id, user_id, device_id, period_type, period_start, period_end, total_tokens, token_snapshot_hash, status, reason_code, reason_message, review_status)
        VALUES (${snapId}, ${requestId}, ${userId}, ${deviceId}, ${snap.period_type}, ${snap.period_start}, ${snap.period_end}, ${snap.total_tokens}, ${snap.token_snapshot_hash}, 'flagged', ${result.reason_code || null}, ${result.reason_message || null}, 'pending')
      `
    } else {
      await sql`
        INSERT INTO upload_snapshots (id, upload_request_id, user_id, device_id, period_type, period_start, period_end, total_tokens, token_snapshot_hash, status, reason_code, reason_message)
        VALUES (${snapId}, ${requestId}, ${userId}, ${deviceId}, ${snap.period_type}, ${snap.period_start}, ${snap.period_end}, ${snap.total_tokens}, ${snap.token_snapshot_hash}, 'rejected', ${result.reason_code || null}, ${result.reason_message || null})
      `
    }
  }

  return { status: requestStatus, snapshots: snapshotResults }
}
