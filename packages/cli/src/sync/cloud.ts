import type { SyncRecord, SyncTombstone } from '@aiusage/core'
import { computeHmac, sha256, generateNonce, generateIdempotencyKey, buildCanonicalString } from '../leaderboard/crypto.js'
import { loadCredentials } from '../leaderboard/credentials.js'
import { getSiteUrl } from '../site-url.js'

const SYNC_PUSH_PATH = '/api/cli/sync/push'
const SYNC_PULL_PATH = '/api/cli/sync/pull'

export interface PullResult {
  records: SyncRecord[]
  tombstones: SyncTombstone[]
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
    return await response.json()
  } catch {
    return null
  }
}

export async function cloudPush(
  records: SyncRecord[],
  tombstones: SyncTombstone[],
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
    records,
    tombstones,
  })

  const headers = buildHeaders('POST', SYNC_PUSH_PATH, body)
  const response = await fetch(`${serverUrl}${SYNC_PUSH_PATH}`, { method: 'POST', headers, body })
  const data = await readJsonOrNull(response)

  if (!response.ok) {
    throw new CloudSyncError(
      (data?.error as string) || `Push failed (HTTP ${response.status})`,
      (data?.error_code as string) || 'server_error',
      data?.retry_after as number | undefined
    )
  }

  if (!data) throw new CloudSyncError('Invalid response from server', 'invalid_response')

  return {
    inserted: (data.inserted as number) || 0,
    updated: (data.updated as number) || 0,
    skipped: (data.skipped as number) || 0,
    serverCursor: data.server_cursor as string | undefined,
    syncGeneration: (data.sync_generation as number) || syncGeneration,
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
    throw new CloudSyncError(
      (data?.error as string) || `Pull failed (HTTP ${response.status})`,
      (data?.error_code as string) || 'server_error'
    )
  }

  if (!data) throw new CloudSyncError('Invalid response from server', 'invalid_response')

  return {
    records: (data.records as SyncRecord[]) || [],
    tombstones: (data.tombstones as SyncTombstone[]) || [],
    nextCursor: data.next_cursor as string | undefined,
    hasMore: (data.has_more as boolean) || false,
    syncGeneration: (data.sync_generation as number) || 1,
  }
}

export async function cloudClear(): Promise<{ syncGeneration: number }> {
  const serverUrl = getSiteUrl()
  const creds = loadCredentials()
  if (!creds) throw new CloudSyncError('Not logged in.', 'not_logged_in')

  const body = '{}'
  const headers = buildHeaders('POST', '/api/me/cloud-sync/clear', body)
  // Cloud clear uses session auth, not HMAC. We need to use a different approach.
  // For now, throw an error indicating this needs to be done via the web UI.
  throw new CloudSyncError(
    'Cloud data clear must be done via the web UI at /uploads',
    'use_web_ui'
  )
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
