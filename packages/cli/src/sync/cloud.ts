import type { SyncRecord } from '@aiusage/core'
import { computeHmac, sha256, generateNonce, generateIdempotencyKey, buildCanonicalString } from '../leaderboard/crypto.js'
import { loadCredentials } from '../leaderboard/credentials.js'
import { getSiteUrl } from '../site-url.js'
import { fromCloudRecord, parseSyncGeneration, toCloudRecord } from './cloud-dto.js'

const SYNC_PUSH_PATH = '/api/cli/sync/push'
const SYNC_PULL_PATH = '/api/cli/sync/pull'

/**
 * Tombstone as the server returns it from `/sync/pull` (snake_case fields).
 * `SyncTombstone` from core describes the local table, not this wire shape.
 */
export interface CloudPulledTombstone {
  id: string
  device_instance_id?: string
  deleted_at?: string | number
  updated_at?: string | number
}

/** Tombstone as `/sync/push` expects it: the wire id of a record this device retracts. */
export interface CloudPushTombstone {
  record_id: string
  updatedAt: number
}

export interface PullResult {
  records: SyncRecord[]
  tombstones: CloudPulledTombstone[]
  nextCursor?: string
  hasMore: boolean
  syncGeneration: number
}

export interface PushResult {
  inserted: number
  updated: number
  skipped: number
  serverCursor?: string
  syncGeneration: number
}

export class CloudSyncError extends Error {
  constructor(
    message: string,
    public code?: string,
    public retryAfter?: number
  ) {
    super(message)
    this.name = 'CloudSyncError'
  }
}

function buildHeaders(method: string, path: string, body: string): Record<string, string> {
  const creds = loadCredentials()
  if (!creds) throw new CloudSyncError('Not logged in. Run `aiusage login` first.', 'not_logged_in')

  const bodyHash = sha256(body)
  const timestamp = Date.now().toString()
  const nonce = generateNonce()
  const idempotencyKey = generateIdempotencyKey()

  const canonical = buildCanonicalString(method, path, bodyHash, timestamp, nonce, creds.device_id, idempotencyKey)
  const signature = computeHmac(creds.device_secret, canonical)

  return {
    'Content-Type': 'application/json',
    'X-AIUsage-Device-Id': creds.device_id,
    'X-AIUsage-Timestamp': timestamp,
    'X-AIUsage-Nonce': nonce,
    'X-AIUsage-Idempotency-Key': idempotencyKey,
    'X-AIUsage-Signature': `hmac-sha256=${signature}`,
  }
}

async function readJsonOrNull(response: Response): Promise<Record<string, unknown> | null> {
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) return null
  try {
    const data: unknown = await response.json()
    return data !== null && typeof data === 'object' && !Array.isArray(data)
      ? data as Record<string, unknown> : null
  } catch {
    return null
  }
}

export async function cloudPush(
  records: SyncRecord[],
  tombstones: CloudPushTombstone[],
  deviceInstanceId: string,
  syncGeneration: number
): Promise<PushResult> {
  const serverUrl = getSiteUrl()
  const creds = loadCredentials()
  if (!creds) throw new CloudSyncError('Not logged in.', 'not_logged_in')

  const body = JSON.stringify({
    schema_version: 1,
    device_instance_id: deviceInstanceId,
    sync_generation: syncGeneration,
    client_version: getClientVersion(),
    client_platform: process.platform,
    records: records.map(toCloudRecord),
    tombstones,
  })

  const headers = buildHeaders('POST', SYNC_PUSH_PATH, body)
  const response = await fetch(`${serverUrl}${SYNC_PUSH_PATH}`, { method: 'POST', headers, body })
  const data = await readJsonOrNull(response)

  if (!response.ok) {
    const errObj = data?.error
    // Handle nested error object from star-gating: { error: { code, message, repo, url } }
    const errMsg = typeof errObj === 'object' && errObj !== null
      ? (errObj as Record<string, unknown>).message as string || `Push failed (HTTP ${response.status})`
      : (errObj as string) || `Push failed (HTTP ${response.status})`
    const errCode = typeof errObj === 'object' && errObj !== null
      ? (errObj as Record<string, unknown>).code as string || 'server_error'
      : (data?.error_code as string) || 'server_error'
    throw new CloudSyncError(errMsg, errCode, data?.retry_after as number | undefined)
  }

  if (!data) throw new CloudSyncError('Invalid response from server', 'invalid_response')

  return {
    inserted: (data.inserted as number) || 0,
    updated: (data.updated as number) || 0,
    skipped: (data.skipped as number) || 0,
    serverCursor: data.server_cursor as string | undefined,
    syncGeneration: parseSyncGeneration(data.sync_generation) ?? syncGeneration,
  }
}

export async function cloudPull(
  cursor?: string,
  limit: number = 1000
): Promise<PullResult> {
  const serverUrl = getSiteUrl()
  const creds = loadCredentials()
  if (!creds) throw new CloudSyncError('Not logged in.', 'not_logged_in')

  const params = new URLSearchParams()
  if (cursor) params.set('cursor', cursor)
  params.set('limit', String(limit))

  const query = params.toString()
  const path = `${SYNC_PULL_PATH}${query ? `?${query}` : ''}`

  // For GET requests, body is empty
  const headers = buildHeaders('GET', SYNC_PULL_PATH, '')
  const response = await fetch(`${serverUrl}${path}`, { method: 'GET', headers })
  const data = await readJsonOrNull(response)

  if (!response.ok) {
    const errObj = data?.error
    const errMsg = typeof errObj === 'object' && errObj !== null
      ? (errObj as Record<string, unknown>).message as string || `Pull failed (HTTP ${response.status})`
      : (errObj as string) || `Pull failed (HTTP ${response.status})`
    const errCode = typeof errObj === 'object' && errObj !== null
      ? (errObj as Record<string, unknown>).code as string || 'server_error'
      : (data?.error_code as string) || 'server_error'
    throw new CloudSyncError(errMsg, errCode)
  }

  if (!data) throw new CloudSyncError('Invalid response from server', 'invalid_response')

  // A completed pull is reconciled against: every record must be
  // representable, or the pull fails rather than silently omitting it (an
  // omission would read as the record's absence from the cloud).
  const syncGeneration = parseSyncGeneration(data.sync_generation)
  if (!Array.isArray(data.records) || !Array.isArray(data.tombstones)
    || typeof data.has_more !== 'boolean'
    || syncGeneration === undefined
    || (data.next_cursor != null && (typeof data.next_cursor !== 'string' || !/^[0-9]+$/.test(data.next_cursor)))
    || (data.has_more && (typeof data.next_cursor !== 'string' || BigInt(data.next_cursor) <= 0n))) {
    throw new CloudSyncError('Invalid response from server: malformed pull envelope', 'invalid_response')
  }
  // Tombstones can delete records too; validate their identity before any
  // page is returned to the authoritative reconciliation path.
  for (const raw of data.tombstones) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)
      || typeof raw.id !== 'string' || !raw.id
      || typeof raw.device_instance_id !== 'string' || !raw.device_instance_id) {
      throw new CloudSyncError('Invalid response from server: malformed tombstone', 'invalid_response')
    }
  }
  const rawRecords = data.records
  const records: SyncRecord[] = []
  for (const raw of rawRecords) {
    const record = fromCloudRecord(raw)
    if (!record) throw new CloudSyncError('Invalid response from server: a pulled record could not be parsed', 'invalid_response')
    records.push(record)
  }

  return {
    records,
    tombstones: data.tombstones as CloudPulledTombstone[],
    nextCursor: (data.next_cursor as string | null | undefined) ?? undefined,
    hasMore: data.has_more,
    syncGeneration,
  }
}

export async function cloudClear(): Promise<{ syncGeneration: number }> {
  const serverUrl = getSiteUrl()
  const creds = loadCredentials()
  if (!creds) throw new CloudSyncError('Not logged in.', 'not_logged_in')

  const SYNC_CLEAR_PATH = '/api/cli/sync/clear'
  const body = '{}'
  const headers = buildHeaders('POST', SYNC_CLEAR_PATH, body)
  const response = await fetch(`${serverUrl}${SYNC_CLEAR_PATH}`, { method: 'POST', headers, body })
  const data = await readJsonOrNull(response)

  if (!response.ok) {
    const errObj = data?.error
    const errMsg = typeof errObj === 'object' && errObj !== null
      ? (errObj as Record<string, unknown>).message as string || `Clear failed (HTTP ${response.status})`
      : (errObj as string) || `Clear failed (HTTP ${response.status})`
    const errCode = typeof errObj === 'object' && errObj !== null
      ? (errObj as Record<string, unknown>).code as string || 'server_error'
      : (data?.error_code as string) || 'server_error'
    throw new CloudSyncError(errMsg, errCode)
  }

  if (!data) throw new CloudSyncError('Invalid response from server', 'invalid_response')

  return {
    syncGeneration: parseSyncGeneration(data.sync_generation) ?? 1,
  }
}

function getClientVersion(): string {
  try {
    const { readFileSync } = require('node:fs')
    const { join } = require('node:path')
    const pkgPath = join(__dirname, '../../package.json')
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
    return pkg.version || '0.0.0'
  } catch {
    return '0.0.0'
  }
}
