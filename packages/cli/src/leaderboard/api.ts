import { computeHmac, sha256, generateNonce, generateIdempotencyKey, buildCanonicalString } from './crypto.js'
import { loadCredentials } from './credentials.js'

const UPLOAD_PATH = '/api/leaderboard/uploads'
const DEVICE_START_PATH = '/api/cli/device/start'
const DEVICE_COMPLETE_PATH = '/api/cli/device/complete'
const LEADERBOARD_STATUS_PATH = '/api/cli/leaderboard/status'
const LEADERBOARD_PATH = '/api/leaderboard'

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
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_write_tokens: number
  thinking_tokens: number
  breakdowns: UploadBreakdown[]
  token_snapshot_hash: string
}

export interface UploadBreakdown {
  scope_type: 'all' | 'tool' | 'model' | 'tool_model'
  tool: string | null
  model: string | null
  total_tokens: number
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_write_tokens: number
  thinking_tokens: number
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

export interface LeaderboardEntry {
  rank: number
  user_id: string
  display_name: string
  avatar_url: string | null
  scope_type: string
  tool: string | null
  model: string | null
  total_tokens: string
  total_cost_usd: string
  updated_at: string
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[]
  next_cursor: string | null
  current_user: LeaderboardEntry | null
  period_type: string
  period_start: string
  metric: string
  scope: string
  tool: string | null
  model: string | null
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

async function readJsonOrNull(response: Response): Promise<any | null> {
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) return null
  return response.json().catch(() => null)
}

function endpointUnavailableMessage(path: string, status: number): string {
  return `Leaderboard API endpoint ${path} is unavailable (HTTP ${status}). The site deployment is not routing this API request to the Node server.`
}

export async function fetchLeaderboard(
  serverUrl: string,
  options: { period_type?: string; metric?: string; scope?: string; tool?: string; model?: string; cursor?: string } = {}
): Promise<LeaderboardResponse> {
  const params = new URLSearchParams()
  if (options.period_type) params.set('period_type', options.period_type)
  if (options.metric) params.set('metric', options.metric)
  if (options.scope) params.set('scope', options.scope)
  if (options.tool) params.set('tool', options.tool)
  if (options.model) params.set('model', options.model)
  if (options.cursor) params.set('cursor', options.cursor)

  const query = params.toString()
  const response = await fetch(`${serverUrl}${LEADERBOARD_PATH}${query ? `?${query}` : ''}`, {
    headers: { Accept: 'application/json' },
  })
  const data = await readJsonOrNull(response) || {}

  if (!response.ok) {
    throw new LeaderboardApiError(data.error || 'Failed to fetch leaderboard', data.error)
  }

  if (!data || !Array.isArray(data.entries)) {
    return {
      entries: [],
      next_cursor: null,
      current_user: null,
      period_type: options.period_type || 'daily',
      period_start: new Date().toISOString().slice(0, 10),
      metric: options.metric || 'tokens',
      scope: options.scope || 'all',
      tool: options.tool || null,
      model: options.model || null,
    }
  }

  return data
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

  const data = await readJsonOrNull(response)

  if (!response.ok) {
    throw new LeaderboardApiError(
      data?.error || endpointUnavailableMessage(DEVICE_START_PATH, response.status),
      data?.error || 'endpoint_unavailable'
    )
  }

  if (!data) {
    throw new LeaderboardApiError(endpointUnavailableMessage(DEVICE_START_PATH, response.status), 'endpoint_unavailable')
  }

  return data
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

  const data = await readJsonOrNull(response)

  if (response.status === 202 || data?.pending) {
    throw new LeaderboardApiError('Authorization pending', 'authorization_pending')
  }

  if (!response.ok) {
    throw new LeaderboardApiError(
      data?.error || endpointUnavailableMessage(DEVICE_COMPLETE_PATH, response.status),
      data?.error || 'endpoint_unavailable'
    )
  }

  if (!data) {
    throw new LeaderboardApiError(endpointUnavailableMessage(DEVICE_COMPLETE_PATH, response.status), 'endpoint_unavailable')
  }

  if (!data.device_id || !data.device_secret) {
    throw new LeaderboardApiError('Invalid device auth response: missing device credentials', 'invalid_response')
  }

  return data
}

export async function uploadSnapshots(
  serverUrl: string,
  payload: UploadRequest
): Promise<UploadResponse> {
  const creds = loadCredentials()
  if (!creds) {
    throw new LeaderboardApiError('Not logged in. Run `aiusage login` first.', 'not_logged_in')
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

  const data = await readJsonOrNull(response)

  if (!response.ok) {
    throw new LeaderboardApiError(
      data?.error || endpointUnavailableMessage(UPLOAD_PATH, response.status),
      data?.error || 'endpoint_unavailable',
      data?.retry_after
    )
  }

  if (!data) {
    throw new LeaderboardApiError(endpointUnavailableMessage(UPLOAD_PATH, response.status), 'endpoint_unavailable')
  }

  return data
}

export async function fetchLeaderboardStatus(serverUrl: string): Promise<LeaderboardStatusResponse> {
  const creds = loadCredentials()
  if (!creds) {
    throw new LeaderboardApiError('Not logged in. Run `aiusage login` first.', 'not_logged_in')
  }

  const bodyHash = sha256('')
  const timestamp = Date.now().toString()
  const nonce = generateNonce()
  const idempotencyKey = generateIdempotencyKey()
  const canonical = buildCanonicalString(
    'GET',
    LEADERBOARD_STATUS_PATH,
    bodyHash,
    timestamp,
    nonce,
    creds.device_id,
    idempotencyKey
  )
  const signature = computeHmac(creds.device_secret, canonical)

  const response = await fetch(`${serverUrl}${LEADERBOARD_STATUS_PATH}`, {
    headers: {
      'X-AIUsage-Device-Id': creds.device_id,
      'X-AIUsage-Timestamp': timestamp,
      'X-AIUsage-Nonce': nonce,
      'X-AIUsage-Idempotency-Key': idempotencyKey,
      'X-AIUsage-Signature': `hmac-sha256=${signature}`,
    },
  })

  const data = await readJsonOrNull(response)

  if (!response.ok) {
    throw new LeaderboardApiError(
      data?.error || endpointUnavailableMessage(LEADERBOARD_STATUS_PATH, response.status),
      data?.error || 'endpoint_unavailable'
    )
  }

  if (!data) {
    throw new LeaderboardApiError(endpointUnavailableMessage(LEADERBOARD_STATUS_PATH, response.status), 'endpoint_unavailable')
  }

  return data
}
