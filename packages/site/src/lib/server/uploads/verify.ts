import { sql } from '../db/pool.js'
import { decryptDeviceSecret, sha256, buildCanonicalString, hashIp, computeHmac } from '../crypto/hmac.js'
import { invalidateLeaderboardCache } from '../leaderboard/query.js'
import { getConfigValue, CFG } from '../config.js'
import { calculateDefaultCost, resolveDefaultPrice } from '@aiusage/core'
import { nanoid } from 'nanoid'
import { createHmac, timingSafeEqual as cryptoTimingSafeEqual } from 'node:crypto'

const CORE_PRICING_VERSION = 'core_v1'

const ALLOWED_PERIOD_TYPES = ['daily', 'weekly', 'monthly', 'yearly', 'all_time'] as const
const ALLOWED_SCOPE_TYPES = ['all', 'tool', 'model', 'tool_model'] as const

type PeriodType = (typeof ALLOWED_PERIOD_TYPES)[number]
type ScopeType = (typeof ALLOWED_SCOPE_TYPES)[number]

interface TokenTotals {
  total_tokens: number
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_write_tokens: number
  thinking_tokens: number
}

export interface UploadBreakdown extends TokenTotals {
  scope_type: ScopeType
  tool: string | null
  model: string | null
}

export interface UploadSnapshot extends TokenTotals {
  period_type: PeriodType
  period_start: string
  period_end: string
  breakdowns: UploadBreakdown[]
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

const UPLOAD_FIELDS = new Set(['schema_version', 'client_version', 'client_platform', 'snapshots'])
const SNAPSHOT_FIELDS = new Set([
  'period_type',
  'period_start',
  'period_end',
  'total_tokens',
  'input_tokens',
  'output_tokens',
  'cache_read_tokens',
  'cache_write_tokens',
  'thinking_tokens',
  'breakdowns',
  'token_snapshot_hash',
])
const BREAKDOWN_FIELDS = new Set([
  'scope_type',
  'tool',
  'model',
  'total_tokens',
  'input_tokens',
  'output_tokens',
  'cache_read_tokens',
  'cache_write_tokens',
  'thinking_tokens',
])

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function validateAllowedFields(obj: Record<string, unknown>, allowed: Set<string>, errorCode: string): string | null {
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) return `${errorCode}:${key}`
  }
  return null
}

function totalsFrom(value: TokenTotals): TokenTotals {
  return {
    total_tokens: value.total_tokens,
    input_tokens: value.input_tokens,
    output_tokens: value.output_tokens,
    cache_read_tokens: value.cache_read_tokens,
    cache_write_tokens: value.cache_write_tokens,
    thinking_tokens: value.thinking_tokens,
  }
}

function zeroTotals(): TokenTotals {
  return {
    total_tokens: 0,
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    thinking_tokens: 0,
  }
}

function mergeTotals(a: TokenTotals, b: TokenTotals): TokenTotals {
  return {
    input_tokens: a.input_tokens + b.input_tokens,
    output_tokens: a.output_tokens + b.output_tokens,
    cache_read_tokens: a.cache_read_tokens + b.cache_read_tokens,
    cache_write_tokens: a.cache_write_tokens + b.cache_write_tokens,
    thinking_tokens: a.thinking_tokens + b.thinking_tokens,
    total_tokens: a.total_tokens + b.total_tokens,
  }
}

function totalsEqual(a: TokenTotals, b: TokenTotals): boolean {
  return a.total_tokens === b.total_tokens &&
    a.input_tokens === b.input_tokens &&
    a.output_tokens === b.output_tokens &&
    a.cache_read_tokens === b.cache_read_tokens &&
    a.cache_write_tokens === b.cache_write_tokens &&
    a.thinking_tokens === b.thinking_tokens
}

function validateTokenTotals(value: Record<string, unknown>): boolean {
  return isNonNegativeInteger(value.total_tokens) &&
    isNonNegativeInteger(value.input_tokens) &&
    isNonNegativeInteger(value.output_tokens) &&
    isNonNegativeInteger(value.cache_read_tokens) &&
    isNonNegativeInteger(value.cache_write_tokens) &&
    isNonNegativeInteger(value.thinking_tokens) &&
    value.total_tokens === value.input_tokens + value.output_tokens + value.cache_read_tokens + value.cache_write_tokens + value.thinking_tokens
}

function metricKey(scopeType: ScopeType, tool: string | null, model: string | null): string {
  return `${scopeType}:${tool ?? ''}:${model ?? ''}`
}

function normalizeBreakdowns(breakdowns: UploadBreakdown[]): UploadBreakdown[] {
  return [...breakdowns].sort((a, b) =>
    a.scope_type.localeCompare(b.scope_type) ||
    String(a.tool ?? '').localeCompare(String(b.tool ?? '')) ||
    String(a.model ?? '').localeCompare(String(b.model ?? ''))
  )
}

function canonicalSnapshot(snapshot: UploadSnapshot): Omit<UploadSnapshot, 'token_snapshot_hash'> {
  return {
    period_type: snapshot.period_type,
    period_start: snapshot.period_start,
    period_end: snapshot.period_end,
    total_tokens: snapshot.total_tokens,
    input_tokens: snapshot.input_tokens,
    output_tokens: snapshot.output_tokens,
    cache_read_tokens: snapshot.cache_read_tokens,
    cache_write_tokens: snapshot.cache_write_tokens,
    thinking_tokens: snapshot.thinking_tokens,
    breakdowns: normalizeBreakdowns(snapshot.breakdowns).map(b => ({
      scope_type: b.scope_type,
      tool: b.tool,
      model: b.model,
      total_tokens: b.total_tokens,
      input_tokens: b.input_tokens,
      output_tokens: b.output_tokens,
      cache_read_tokens: b.cache_read_tokens,
      cache_write_tokens: b.cache_write_tokens,
      thinking_tokens: b.thinking_tokens,
    })),
  }
}

function computeSnapshotHash(snapshot: UploadSnapshot): string {
  return `sha256:${sha256(JSON.stringify(canonicalSnapshot(snapshot)))}`
}

function getBreakdownShapeError(raw: Record<string, unknown>): string | null {
  const forbidden = validateAllowedFields(raw, BREAKDOWN_FIELDS, 'breakdown_forbidden_field')
  if (forbidden) return forbidden
  if (!ALLOWED_SCOPE_TYPES.includes(raw.scope_type as ScopeType)) return `invalid_scope_type:${String(raw.scope_type)}`
  if (!validateTokenTotals(raw)) return 'invalid_token_totals'

  const tool = raw.tool
  const model = raw.model
  if (tool !== null && typeof tool !== 'string') return `invalid_tool_type:${typeof tool}`
  if (model !== null && typeof model !== 'string') return `invalid_model_type:${typeof model}`
  if (typeof tool === 'string' && tool.trim() === '') return 'empty_tool'
  if (typeof model === 'string' && model.trim() === '') return 'empty_model'

  switch (raw.scope_type) {
    case 'all':
      return tool === null && model === null ? null : 'all_scope_requires_null_tool_and_model'
    case 'tool':
      return typeof tool === 'string' && model === null ? null : 'tool_scope_requires_tool_only'
    case 'model':
      return tool === null && typeof model === 'string' ? null : 'model_scope_requires_model_only'
    case 'tool_model':
      return typeof tool === 'string' && typeof model === 'string' ? null : 'tool_model_scope_requires_tool_and_model'
    default:
      return 'invalid_scope_type'
  }
}

function validateBreakdownShape(raw: Record<string, unknown>): raw is UploadBreakdown {
  return getBreakdownShapeError(raw) === null
}

function validateBreakdownConsistency(snapshot: UploadSnapshot): { valid: boolean; error?: string; error_code?: string } {
  const seen = new Set<string>()
  const allRows = snapshot.breakdowns.filter(b => b.scope_type === 'all')
  if (allRows.length !== 1) {
    return { valid: false, error: 'Expected exactly one all-scope breakdown', error_code: 'invalid_breakdowns' }
  }

  for (const row of snapshot.breakdowns) {
    const key = metricKey(row.scope_type, row.tool, row.model)
    if (seen.has(key)) {
      return { valid: false, error: `Duplicate breakdown: ${key}`, error_code: 'invalid_breakdowns' }
    }
    seen.add(key)
  }

  if (!totalsEqual(totalsFrom(snapshot), totalsFrom(allRows[0]))) {
    return { valid: false, error: 'Snapshot totals do not match all-scope breakdown', error_code: 'invalid_breakdowns' }
  }

  let toolModelTotal = zeroTotals()
  const byTool = new Map<string, TokenTotals>()
  const byModel = new Map<string, TokenTotals>()

  for (const row of snapshot.breakdowns) {
    if (row.scope_type !== 'tool_model') continue
    const rowTotals = totalsFrom(row)
    toolModelTotal = mergeTotals(toolModelTotal, rowTotals)

    byTool.set(row.tool!, mergeTotals(byTool.get(row.tool!) ?? zeroTotals(), rowTotals))
    byModel.set(row.model!, mergeTotals(byModel.get(row.model!) ?? zeroTotals(), rowTotals))
  }

  if (!totalsEqual(toolModelTotal, totalsFrom(snapshot))) {
    return { valid: false, error: 'tool_model totals do not match snapshot totals', error_code: 'invalid_breakdowns' }
  }

  for (const row of snapshot.breakdowns) {
    if (row.scope_type === 'tool' && !totalsEqual(totalsFrom(row), byTool.get(row.tool!) ?? zeroTotals())) {
      return { valid: false, error: `Tool breakdown mismatch: ${row.tool}`, error_code: 'invalid_breakdowns' }
    }
    if (row.scope_type === 'model' && !totalsEqual(totalsFrom(row), byModel.get(row.model!) ?? zeroTotals())) {
      return { valid: false, error: `Model breakdown mismatch: ${row.model}`, error_code: 'invalid_breakdowns' }
    }
  }

  return { valid: true }
}

export async function validatePayload(body: unknown): Promise<{ valid: boolean; error?: string; error_code?: string }> {
  if (!isObject(body)) {
    return { valid: false, error: 'Invalid JSON body', error_code: 'invalid_payload' }
  }

  const forbidden = validateAllowedFields(body, UPLOAD_FIELDS, 'payload_forbidden_field')
  if (forbidden) {
    const [, field] = forbidden.split(':')
    return { valid: false, error: `Forbidden field: ${field}`, error_code: 'payload_forbidden_field' }
  }

  if (body.schema_version !== 1) {
    return { valid: false, error: 'Unsupported schema version', error_code: 'unsupported_schema_version' }
  }
  if (typeof body.client_version !== 'string' || body.client_version.length > 40) {
    return { valid: false, error: 'Invalid client_version', error_code: 'invalid_payload' }
  }
  if (!['macos', 'linux', 'windows'].includes(body.client_platform as string)) {
    return { valid: false, error: 'Invalid client_platform', error_code: 'invalid_payload' }
  }

  const maxSnapshots = await getConfigValue(CFG.UPLOAD_MAX_SNAPSHOTS)
  if (!Array.isArray(body.snapshots) || body.snapshots.length === 0 || body.snapshots.length > maxSnapshots) {
    return { valid: false, error: 'Invalid snapshots', error_code: 'invalid_payload' }
  }

  for (const rawSnap of body.snapshots) {
    if (!isObject(rawSnap)) {
      return { valid: false, error: 'Invalid snapshot', error_code: 'invalid_payload' }
    }
    const snapshotForbidden = validateAllowedFields(rawSnap, SNAPSHOT_FIELDS, 'snapshot_forbidden_field')
    if (snapshotForbidden) {
      const [, field] = snapshotForbidden.split(':')
      return { valid: false, error: `Forbidden snapshot field: ${field}`, error_code: 'payload_forbidden_field' }
    }
    if (!ALLOWED_PERIOD_TYPES.includes(rawSnap.period_type as PeriodType)) {
      return { valid: false, error: `Invalid period_type: ${rawSnap.period_type}`, error_code: 'invalid_period_boundary' }
    }
    if (typeof rawSnap.period_start !== 'string' || typeof rawSnap.period_end !== 'string') {
      return { valid: false, error: 'Invalid period boundary', error_code: 'invalid_period_boundary' }
    }
    if (!validateTokenTotals(rawSnap)) {
      return { valid: false, error: 'Invalid token totals', error_code: 'invalid_token_value' }
    }
    const maxBreakdowns = await getConfigValue(CFG.UPLOAD_MAX_BREAKDOWNS)
    if (!Array.isArray(rawSnap.breakdowns) || rawSnap.breakdowns.length === 0 || rawSnap.breakdowns.length > maxBreakdowns) {
      return { valid: false, error: 'Invalid breakdowns', error_code: 'invalid_breakdowns' }
    }
    for (const rawBreakdown of rawSnap.breakdowns) {
      const shapeError = isObject(rawBreakdown) ? getBreakdownShapeError(rawBreakdown) : 'not_an_object'
      if (shapeError) {
        const detail = isObject(rawBreakdown) ? `reason=${shapeError} scope=${rawBreakdown.scope_type} tool=${JSON.stringify(rawBreakdown.tool)} model=${JSON.stringify(rawBreakdown.model)} total=${rawBreakdown.total_tokens} sum=${Number(rawBreakdown.input_tokens||0)+Number(rawBreakdown.output_tokens||0)+Number(rawBreakdown.cache_read_tokens||0)+Number(rawBreakdown.cache_write_tokens||0)+Number(rawBreakdown.thinking_tokens||0)}` : 'not an object'
        return { valid: false, error: `Invalid breakdown: ${detail}`, error_code: 'invalid_breakdowns' }
      }
    }

    const snap = rawSnap as unknown as UploadSnapshot
    if (!validatePeriodBoundary(snap)) {
      return { valid: false, error: 'Period boundary does not match UTC rules', error_code: 'invalid_period_boundary' }
    }
    if (snap.token_snapshot_hash !== computeSnapshotHash(snap)) {
      return { valid: false, error: 'Snapshot hash mismatch', error_code: 'invalid_snapshot_hash' }
    }
    const consistency = validateBreakdownConsistency(snap)
    if (!consistency.valid) return consistency
  }

  return { valid: true }
}

export async function verifyUploadRequest(
  request: Request,
  bodyText: string
): Promise<{ valid: boolean; deviceId?: string; userId?: string; idempotencyKey?: string; error?: string; error_code?: string }> {
  const deviceId = request.headers.get('X-AIUsage-Device-Id')
  const timestamp = request.headers.get('X-AIUsage-Timestamp')
  const nonce = request.headers.get('X-AIUsage-Nonce')
  const idempotencyKey = request.headers.get('X-AIUsage-Idempotency-Key')
  const signature = request.headers.get('X-AIUsage-Signature')

  if (!deviceId || !timestamp || !nonce || !idempotencyKey || !signature) {
    return { valid: false, error: 'Missing required headers', error_code: 'invalid_signature' }
  }

  const devices = await sql`
    SELECT d.id, d.user_id, d.secret_encrypted, d.status, u.status as user_status
    FROM user_devices d
    JOIN users u ON u.id = d.user_id
    WHERE d.id = ${deviceId}
  `
  const device = devices[0] as { id: string; user_id: string; secret_encrypted: string; status: string; user_status: string } | undefined

  if (!device) return { valid: false, error: 'Device not found', error_code: 'device_not_found' }
  if (device.status === 'revoked') return { valid: false, error: 'Device revoked', error_code: 'device_revoked' }
  if (device.user_status === 'banned') return { valid: false, error: 'User banned', error_code: 'user_banned' }

  const timestampWindowMs = await getConfigValue(CFG.UPLOAD_TIMESTAMP_WINDOW_MS)
  const ts = parseInt(timestamp, 10)
  if (Number.isNaN(ts) || Math.abs(Date.now() - ts) > timestampWindowMs) {
    return { valid: false, error: 'Timestamp expired', error_code: 'timestamp_expired' }
  }

  const existingNonce = await sql`SELECT nonce FROM upload_nonces WHERE device_id = ${deviceId} AND nonce = ${nonce}`
  if (existingNonce[0]) return { valid: false, error: 'Nonce reused', error_code: 'nonce_reused' }

  let deviceSecret: string
  try {
    deviceSecret = decryptDeviceSecret(device.secret_encrypted)
  } catch {
    return { valid: false, error: 'Failed to decrypt device secret', error_code: 'invalid_signature' }
  }

  const bodyHash = sha256(bodyText)
  const path = new URL(request.url).pathname
  const canonical = buildCanonicalString(request.method, path, bodyHash, timestamp, nonce, deviceId, idempotencyKey)
  const expectedSig = `hmac-sha256=${computeHmacForVerify(canonical, deviceSecret)}`
  if (!timingSafeEqual(expectedSig, signature)) {
    return { valid: false, error: 'Invalid signature', error_code: 'invalid_signature' }
  }

  await sql`INSERT INTO upload_nonces (device_id, nonce) VALUES (${deviceId}, ${nonce})`
  await sql`UPDATE user_devices SET last_used_at = NOW() WHERE id = ${deviceId}`

  return { valid: true, deviceId, userId: device.user_id, idempotencyKey }
}

function computeHmacForVerify(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('hex')
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return cryptoTimingSafeEqual(Buffer.from(a), Buffer.from(b))
}

export function validatePeriodBoundary(snap: UploadSnapshot): boolean {
  const start = new Date(snap.period_start)
  const end = new Date(snap.period_end)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false

  switch (snap.period_type) {
    case 'daily':
      return start.getUTCHours() === 0 && start.getUTCMinutes() === 0 && start.getUTCSeconds() === 0 &&
        end.getTime() === start.getTime() + 86400000 - 1
    case 'weekly':
      return start.getUTCDay() === 1 && start.getUTCHours() === 0 && start.getUTCMinutes() === 0 &&
        end.getTime() === start.getTime() + 7 * 86400000 - 1
    case 'monthly':
      return start.getUTCDate() === 1 && start.getUTCHours() === 0 && start.getUTCMinutes() === 0 &&
        end.getTime() === Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1) - 1
    case 'yearly':
      return start.getUTCMonth() === 0 && start.getUTCDate() === 1 && start.getUTCHours() === 0 &&
        end.getTime() === Date.UTC(start.getUTCFullYear() + 1, 0, 1) - 1
    case 'all_time':
      return snap.period_start === '1970-01-01T00:00:00.000Z' && end.getTime() >= start.getTime()
    default:
      return false
  }
}

function costForBreakdown(row: UploadBreakdown): { cost: number; unknown: boolean } {
  if (row.scope_type !== 'tool_model' || !row.model) return { cost: 0, unknown: false }
  const price = resolveDefaultPrice(row.model)
  if (!price) {
    return { cost: 0, unknown: row.total_tokens > 0 }
  }
  return {
    cost: calculateDefaultCost(row.model, {
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      cacheReadTokens: row.cache_read_tokens,
      cacheWriteTokens: row.cache_write_tokens,
      thinkingTokens: row.thinking_tokens,
    }),
    unknown: false,
  }
}

interface CostMapResult {
  costs: Map<string, number>
  unknownModels: Set<string>
}

function buildCostMap(snapshot: UploadSnapshot): CostMapResult {
  const costs = new Map<string, number>()
  const unknownModels = new Set<string>()
  let allCost = 0

  for (const row of snapshot.breakdowns.filter(b => b.scope_type === 'tool_model')) {
    const { cost, unknown } = costForBreakdown(row)
    if (unknown && row.model) unknownModels.add(row.model)
    allCost += cost
    costs.set(metricKey('tool_model', row.tool, row.model), cost)
    costs.set(metricKey('tool', row.tool, null), (costs.get(metricKey('tool', row.tool, null)) ?? 0) + cost)
    costs.set(metricKey('model', null, row.model), (costs.get(metricKey('model', null, row.model)) ?? 0) + cost)
  }

  costs.set(metricKey('all', null, null), allCost)
  return { costs, unknownModels }
}

interface RiskAssessment {
  status: 'accepted' | 'flagged'
  reasonCode?: string
  reasonMessage?: string
}

async function assessRisk(
  tx: ReturnType<typeof sql>,
  userId: string,
  deviceId: string,
  snapshot: UploadSnapshot
): Promise<RiskAssessment> {
  const inconsistencyPct = await getConfigValue(CFG.RISK_INCONSISTENCY_PCT)
  const unknownModelPct = await getConfigValue(CFG.RISK_UNKNOWN_MODEL_PCT)
  const repeatCount = await getConfigValue(CFG.RISK_REPEAT_COUNT)
  const repeatWindowHours = await getConfigValue(CFG.RISK_REPEAT_WINDOW_HOURS)
  const tokenSpikeMultiplier = await getConfigValue(CFG.RISK_TOKEN_SPIKE_MULTIPLIER)
  const tokenSpikeMinAvg = await getConfigValue(CFG.RISK_TOKEN_SPIKE_MIN_AVG)
  const tokenSpikeLookbackDays = await getConfigValue(CFG.RISK_TOKEN_SPIKE_LOOKBACK_DAYS)

  const ruleInconsistency = await getConfigValue(CFG.RISK_RULE_INCONSISTENCY)
  const ruleUnknownModel = await getConfigValue(CFG.RISK_RULE_UNKNOWN_MODEL)
  const ruleRepeat = await getConfigValue(CFG.RISK_RULE_REPEAT)
  const ruleTokenSpike = await getConfigValue(CFG.RISK_RULE_TOKEN_SPIKE)

  if (ruleInconsistency) {
    // Rule 1: Breakdown consistency — all-scope total must equal sum of breakdowns
    const allBd = snapshot.breakdowns.find(b => b.scope_type === 'all')
    if (allBd) {
      const toolModelTotal = snapshot.breakdowns
        .filter(b => b.scope_type === 'tool_model')
        .reduce((sum, b) => sum + b.total_tokens, 0)
      if (toolModelTotal > 0 && Math.abs(allBd.total_tokens - toolModelTotal) > allBd.total_tokens * inconsistencyPct) {
        return {
          status: 'flagged',
          reasonCode: 'breakdown_inconsistent',
          reasonMessage: `All-scope total (${allBd.total_tokens}) differs from tool_model sum (${toolModelTotal}) by >${(inconsistencyPct * 100).toFixed(0)}%`
        }
      }
    }
  }

  if (ruleUnknownModel) {
    // Rule 2: Unknown model ratio — tokens from unknown models in cost breakdown
    const { unknownModels } = buildCostMap(snapshot)
    if (unknownModels.size > 0) {
      const toolModelBds = snapshot.breakdowns.filter(b => b.scope_type === 'tool_model')
      const totalToolModel = toolModelBds.reduce((sum, b) => sum + b.total_tokens, 0)
      const unknownTokens = toolModelBds
        .filter(b => b.model && unknownModels.has(b.model))
        .reduce((sum, b) => sum + b.total_tokens, 0)
      if (totalToolModel > 0 && unknownTokens / totalToolModel > unknownModelPct) {
        return {
          status: 'flagged',
          reasonCode: 'unknown_model_ratio',
          reasonMessage: `${Math.round(unknownTokens / totalToolModel * 100)}% of tokens from models not in official price table`
        }
      }
    }
  }

  if (ruleRepeat) {
    // Rule 3: Repeat uploads — same device uploaded same period too many times
    const repeatResult = await tx`
      SELECT COUNT(*) as cnt FROM upload_snapshots
      WHERE device_id = ${deviceId}
        AND period_type = ${snapshot.period_type}
        AND period_start = ${snapshot.period_start}
        AND created_at > NOW() - ${`${repeatWindowHours} hours`}::interval
    `
    const repeatCnt = Number((repeatResult[0] as { cnt: bigint }).cnt)
    if (repeatCnt >= repeatCount) {
      return {
        status: 'flagged',
        reasonCode: 'repeat_upload',
        reasonMessage: `Same period uploaded ${repeatCnt} times in ${repeatWindowHours}h`
      }
    }
  }

  if (ruleTokenSpike) {
    // Rule 4: Massive growth — total_tokens > N x user's historical average for this period type
    const userAvg = await tx`
      SELECT COALESCE(AVG(total_tokens), 0) as avg_tokens FROM upload_snapshots
      WHERE user_id = ${userId}
        AND period_type = ${snapshot.period_type}
        AND status = 'accepted'
        AND created_at > NOW() - ${`${tokenSpikeLookbackDays} days`}::interval
    `
    const avgTokens = Number((userAvg[0] as { avg_tokens: number }).avg_tokens)
    if (avgTokens > tokenSpikeMinAvg && snapshot.total_tokens > avgTokens * tokenSpikeMultiplier) {
      return {
        status: 'flagged',
        reasonCode: 'token_spike',
        reasonMessage: `Total tokens (${snapshot.total_tokens.toLocaleString()}) is ${Math.round(snapshot.total_tokens / avgTokens)}x the ${tokenSpikeLookbackDays}-day average (${avgTokens.toLocaleString()})`
      }
    }
  }

  return { status: 'accepted' }
}

export async function processUpload(
  userId: string,
  deviceId: string,
  idempotencyKey: string,
  request: UploadRequest,
  ip: string
): Promise<UploadResult> {
  const existing = await sql`
    SELECT id, status, payload_hash, result_summary FROM upload_requests
    WHERE device_id = ${deviceId} AND idempotency_key = ${idempotencyKey}
  `
  if (existing[0]) {
    const ex = existing[0] as { status: string; payload_hash: string; result_summary: unknown }
    const currentHash = sha256(JSON.stringify(request))
    if (ex.payload_hash === currentHash) {
      return { status: ex.status as UploadResult['status'], snapshots: (ex.result_summary as SnapshotResult[]) || [] }
    }
    return { status: 'rejected', snapshots: [], error: 'Idempotency conflict', error_code: 'idempotency_conflict' }
  }

  const rateLimit = await getConfigValue(CFG.UPLOAD_RATE_LIMIT)
  const rateLimitWindowHours = await getConfigValue(CFG.UPLOAD_RATE_LIMIT_WINDOW_HOURS)
  const recentRequests = await sql`
    SELECT COUNT(*) as cnt FROM upload_requests
    WHERE device_id = ${deviceId} AND created_at > NOW() - ${`${rateLimitWindowHours} hours`}::interval
  `
  if (Number((recentRequests[0] as { cnt: bigint }).cnt) >= rateLimit) {
    return { status: 'rejected', snapshots: [], error: 'Rate limited', error_code: 'rate_limited' }
  }

  const requestId = nanoid()
  const payloadHash = sha256(JSON.stringify(request))
  const ipHash = hashIp(ip)
  const snapshotResults: SnapshotResult[] = []

  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO upload_requests (id, user_id, device_id, idempotency_key, payload_hash, status, result_summary, client_version, client_platform, schema_version, ip_hash)
      VALUES (${requestId}, ${userId}, ${deviceId}, ${idempotencyKey}, ${payloadHash}, 'accepted', ${JSON.stringify(snapshotResults)}, ${request.client_version}, ${request.client_platform}, ${request.schema_version}, ${ipHash})
    `

    for (const snapshot of request.snapshots) {
      // Run risk assessment
      const risk = await assessRisk(tx, userId, deviceId, snapshot)
      const snapshotStatus = risk.status

      const snapshotId = nanoid()
      await tx`
        INSERT INTO upload_snapshots (id, upload_request_id, user_id, device_id, period_type, period_start, period_end, total_tokens, token_snapshot_hash, status, reason_code, reason_message)
        VALUES (${snapshotId}, ${requestId}, ${userId}, ${deviceId}, ${snapshot.period_type}, ${snapshot.period_start}, ${snapshot.period_end}, ${snapshot.total_tokens}, ${snapshot.token_snapshot_hash}, ${snapshotStatus}, ${risk.reasonCode ?? null}, ${risk.reasonMessage ?? null})
      `

      snapshotResults.push({
        period_type: snapshot.period_type,
        period_start: snapshot.period_start,
        status: snapshotStatus,
        reason_code: risk.reasonCode,
        reason_message: risk.reasonMessage,
      })

      // Get current pricing version: prefer published official table, fallback to core
      const publishedTable = await tx`
        SELECT version FROM official_price_tables WHERE status = 'published' ORDER BY published_at DESC LIMIT 1
      `
      const pricingVersion = publishedTable[0] ? (publishedTable[0] as { version: string }).version : CORE_PRICING_VERSION

      // Flagged snapshots get 'flagged' visibility; accepted get 'public'
      const metricVisibility = snapshotStatus === 'flagged' ? 'flagged' : 'public'

      const { costs, unknownModels } = buildCostMap(snapshot)
      for (const row of snapshot.breakdowns) {
        const metricId = nanoid()
        const cost = costs.get(metricKey(row.scope_type, row.tool, row.model)) ?? 0
        // Determine if this metric row has unknown cost
        const hasUnknownCost = row.scope_type === 'tool_model' && row.model != null && unknownModels.has(row.model)
          || row.scope_type === 'model' && row.model != null && unknownModels.has(row.model)
          || row.scope_type === 'all' && unknownModels.size > 0
          || row.scope_type === 'tool' && snapshot.breakdowns
              .filter(b => b.scope_type === 'tool_model' && b.tool === row.tool && b.model != null && unknownModels.has(b.model))
              .length > 0

        await tx`
          INSERT INTO leaderboard_metrics (
            id, upload_request_id, user_id, device_id, period_type, period_start, period_end,
            scope_type, tool, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
            thinking_tokens, total_tokens, total_cost_usd, visibility, pricing_version, has_unknown_cost
          )
          VALUES (
            ${metricId}, ${requestId}, ${userId}, ${deviceId}, ${snapshot.period_type}, ${snapshot.period_start}, ${snapshot.period_end},
            ${row.scope_type}, ${row.tool}, ${row.model}, ${row.input_tokens}, ${row.output_tokens}, ${row.cache_read_tokens}, ${row.cache_write_tokens},
            ${row.thinking_tokens}, ${row.total_tokens}, ${cost}, ${metricVisibility}, ${pricingVersion}, ${hasUnknownCost}
          )
          ON CONFLICT (user_id, period_type, period_start, scope_type, (COALESCE(tool, '')), (COALESCE(model, '')))
          DO UPDATE SET
            upload_request_id = ${requestId},
            device_id = ${deviceId},
            period_end = ${snapshot.period_end},
            input_tokens = ${row.input_tokens},
            output_tokens = ${row.output_tokens},
            cache_read_tokens = ${row.cache_read_tokens},
            cache_write_tokens = ${row.cache_write_tokens},
            thinking_tokens = ${row.thinking_tokens},
            total_tokens = ${row.total_tokens},
            total_cost_usd = ${cost},
            visibility = ${metricVisibility},
            pricing_version = ${pricingVersion},
            has_unknown_cost = ${hasUnknownCost},
            updated_at = NOW()
        `
      }

      invalidateLeaderboardCache()
    }

    // Update request status if any snapshot was flagged
    const hasFlagged = snapshotResults.some(s => s.status === 'flagged')
    if (hasFlagged) {
      await tx`
        UPDATE upload_requests SET status = 'flagged', result_summary = ${JSON.stringify(snapshotResults)}::jsonb
        WHERE id = ${requestId}
      `
    } else {
      await tx`
        UPDATE upload_requests SET result_summary = ${JSON.stringify(snapshotResults)}::jsonb
        WHERE id = ${requestId}
      `
    }
  })

  const overallStatus = snapshotResults.some(s => s.status === 'flagged') ? 'flagged' : 'accepted'
  return { status: overallStatus, snapshots: snapshotResults }
}

export async function getMaxPayloadSize(): Promise<number> {
  return getConfigValue(CFG.UPLOAD_MAX_PAYLOAD_SIZE)
}
