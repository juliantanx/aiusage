import { computeHmac, sha256, generateNonce, generateIdempotencyKey, buildCanonicalString } from './crypto.js'
import { loadCredentials } from './credentials.js'

const UPLOAD_PATH = '/api/leaderboard/uploads'
const DEVICE_START_PATH = '/api/cli/device/start'
const DEVICE_COMPLETE_PATH = '/api/cli/device/complete'
const LEADERBOARD_STATUS_PATH = '/api/me/leaderboard/uploads'

export interface DeviceStartRequest {
  device_name: string
  cli_version: string
  device_challenge: string
}

export interface DeviceStartResponse {
  device_request_id: string
  user_code: string
  verification_url: string
  expires_at: string
  interval: number
}

export interface DeviceCompleteRequest {
  device_request_id: string
  device_verifier: string
}

export interface DeviceCompleteResponse {
  device_id: string
  device_secret: string
}

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
  status: string
  reason_code?: string
  reason_message?: string
}

export interface UploadResponse {
  request_id: string
  status: string
  snapshots: SnapshotResult[]
}

export interface LeaderboardStatusResponse {
  snapshots: Array<{
    period_type: string
    period_start: string
    total_tokens: string
    status: string
    reason_message?: string
    created_at: string
  }>
}

export class LeaderboardApiError extends Error {
  constructor(
    message: string,
    public code?: string,
    public retryAfter?: number
  ) {
    super(message)
    this.name = 'LeaderboardApiError'
  }
}

export async function startDeviceAuth(
  serverUrl: string,
  request: DeviceStartRequest
): Promise<DeviceStartResponse> {
  const response = await fetch(`${serverUrl}${DEVICE_START_PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new LeaderboardApiError(data.error || 'Failed to start device auth', data.error)
  }

  return response.json()
}

export async function completeDeviceAuth(
  serverUrl: string,
  request: DeviceCompleteRequest
): Promise<DeviceCompleteResponse> {
  const response = await fetch(`${serverUrl}${DEVICE_COMPLETE_PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new LeaderboardApiError(data.error || 'Failed to complete device auth', data.error)
  }

  return response.json()
}

export async function uploadSnapshots(
  serverUrl: string,
  payload: UploadRequest
): Promise<UploadResponse> {
  const creds = loadCredentials()
  if (!creds) {
    throw new LeaderboardApiError('Not logged in. Run `aiusage leaderboard login` first.', 'not_logged_in')
  }

  const body = JSON.stringify(payload)
  const bodyHash = sha256(body)
  const timestamp = Date.now().toString()
  const nonce = generateNonce()
  const idempotencyKey = generateIdempotencyKey()

  const canonical = buildCanonicalString(
    'POST',
    UPLOAD_PATH,
    bodyHash,
    timestamp,
    nonce,
    creds.device_id,
    idempotencyKey
  )
  const signature = computeHmac(creds.device_secret, canonical)

  const response = await fetch(`${serverUrl}${UPLOAD_PATH}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-AIUsage-Device-Id': creds.device_id,
      'X-AIUsage-Timestamp': timestamp,
      'X-AIUsage-Nonce': nonce,
      'X-AIUsage-Idempotency-Key': idempotencyKey,
      'X-AIUsage-Signature': `hmac-sha256=${signature}`,
    },
    body,
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new LeaderboardApiError(
      data.error || `Upload failed with status ${response.status}`,
      data.error,
      data.retry_after
    )
  }

  return data
}

export async function fetchLeaderboardStatus(serverUrl: string): Promise<LeaderboardStatusResponse> {
  const creds = loadCredentials()
  if (!creds) {
    throw new LeaderboardApiError('Not logged in. Run `aiusage leaderboard login` first.', 'not_logged_in')
  }

  const response = await fetch(`${serverUrl}${LEADERBOARD_STATUS_PATH}`, {
    headers: {
      'X-AIUsage-Device-Id': creds.device_id,
    },
  })

  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new LeaderboardApiError(data.error || 'Failed to fetch status', data.error)
  }

  return response.json()
}
