/**
 * F6: Official Subscription Quota Query
 *
 * Reads local OAuth credentials for each AI tool and queries their official
 * usage APIs to get real-time quota utilization.
 *
 * Supported tools: claude-code, codex
 */

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir, platform } from 'node:os'
import { execSync } from 'node:child_process'

// ── Types ────────────────────────────────────────────────────────────────────

export type CredentialStatus = 'valid' | 'expired' | 'not_found' | 'parse_error'

export interface QuotaTier {
  /** Window identifier: five_hour, seven_day, seven_day_opus, seven_day_sonnet, weekly_limit, etc. */
  name: string
  /** Utilization percentage 0–100 */
  utilization: number
  /** ISO 8601 reset time, null if unknown */
  resetsAt: string | null
}

export interface QuotaResult {
  tool: string
  credentialStatus: CredentialStatus
  credentialMessage: string | null
  success: boolean
  tiers: QuotaTier[]
  error: string | null
  queriedAt: number | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function nowMs(): number {
  return Date.now()
}

function notFound(tool: string): QuotaResult {
  return { tool, credentialStatus: 'not_found', credentialMessage: null, success: false, tiers: [], error: null, queriedAt: null }
}

function parseError(tool: string, message: string): QuotaResult {
  return { tool, credentialStatus: 'parse_error', credentialMessage: message, success: false, tiers: [], error: message, queriedAt: nowMs() }
}

function expiredError(tool: string, message: string): QuotaResult {
  return { tool, credentialStatus: 'expired', credentialMessage: message, success: false, tiers: [], error: message, queriedAt: nowMs() }
}

function apiError(tool: string, message: string): QuotaResult {
  return { tool, credentialStatus: 'valid', credentialMessage: null, success: false, tiers: [], error: message, queriedAt: nowMs() }
}

function isExpired(expiresAt: unknown): boolean {
  if (expiresAt == null) return false
  const nowSecs = Date.now() / 1000
  if (typeof expiresAt === 'number') {
    // distinguish seconds vs milliseconds
    const secs = expiresAt > 1e12 ? expiresAt / 1000 : expiresAt
    return secs < nowSecs
  }
  if (typeof expiresAt === 'string') {
    const ts = Date.parse(expiresAt)
    if (!isNaN(ts)) return ts / 1000 < nowSecs
  }
  return false
}

// ── macOS Keychain helper ────────────────────────────────────────────────────

function readFromKeychain(service: string): string | null {
  if (platform() !== 'darwin') return null
  try {
    const result = execSync(`security find-generic-password -s "${service}" -w 2>/dev/null`, {
      timeout: 3000,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
    return result || null
  } catch {
    return null
  }
}

// ── Claude Code credential reading ──────────────────────────────────────────

interface ClaudeCredResult {
  token: string | null
  status: CredentialStatus
  message: string | null
}

function parseClaudeCredJson(content: string): ClaudeCredResult {
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(content)
  } catch (e) {
    return { token: null, status: 'parse_error', message: `Failed to parse credentials JSON: ${e}` }
  }

  const entry = (parsed['claudeAiOauth'] ?? parsed['claude.ai_oauth']) as Record<string, unknown> | undefined
  if (!entry) {
    return { token: null, status: 'parse_error', message: 'No OAuth entry found in credentials' }
  }

  const accessToken = entry['accessToken'] as string | undefined
  if (!accessToken) {
    return { token: null, status: 'parse_error', message: 'accessToken is empty or missing' }
  }

  if (isExpired(entry['expiresAt'])) {
    return { token: accessToken, status: 'expired', message: 'OAuth token has expired' }
  }

  return { token: accessToken, status: 'valid', message: null }
}

function readClaudeCredentials(): ClaudeCredResult {
  // Try macOS Keychain first
  const keychainJson = readFromKeychain('Claude Code-credentials')
  if (keychainJson) {
    const keychainResult = parseClaudeCredJson(keychainJson)
    if (keychainResult.status === 'valid' || keychainResult.status === 'expired') {
      return keychainResult
    }
    // Keychain data unusable (parse_error / not_found) — fall through to file
  }

  // Fall back to ~/.claude/.credentials.json
  const credPath = join(homedir(), '.claude', '.credentials.json')
  if (!existsSync(credPath)) {
    return { token: null, status: 'not_found', message: null }
  }

  let content: string
  try {
    content = readFileSync(credPath, 'utf-8')
  } catch (e) {
    return { token: null, status: 'parse_error', message: `Failed to read credentials file: ${e}` }
  }

  return parseClaudeCredJson(content)
}

// ── Codex credential reading ─────────────────────────────────────────────────

interface CodexCredResult {
  token: string | null
  accountId: string | null
  status: CredentialStatus
  message: string | null
}

function parseCodexCredJson(content: string): CodexCredResult {
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(content)
  } catch (e) {
    return { token: null, accountId: null, status: 'parse_error', message: `Failed to parse Codex auth JSON: ${e}` }
  }

  // Only OAuth mode has usage data
  if (parsed['auth_mode'] !== 'chatgpt') {
    return { token: null, accountId: null, status: 'not_found', message: 'Codex not using OAuth mode' }
  }

  const tokens = parsed['tokens'] as Record<string, unknown> | undefined
  if (!tokens) {
    return { token: null, accountId: null, status: 'parse_error', message: 'No tokens in Codex auth' }
  }

  const accessToken = tokens['access_token'] as string | undefined
  if (!accessToken) {
    return { token: null, accountId: null, status: 'parse_error', message: 'access_token is empty or missing' }
  }

  const accountId = (tokens['account_id'] ?? parsed['account_id']) as string | undefined ?? null

  // Check expiry if available
  const expiresAt = tokens['expires_at'] ?? tokens['expiresAt']
  if (isExpired(expiresAt)) {
    return { token: accessToken, accountId, status: 'expired', message: 'Codex OAuth token may be stale' }
  }

  return { token: accessToken, accountId, status: 'valid', message: null }
}

function readCodexCredentials(): CodexCredResult {
  // Try macOS Keychain first
  const keychainJson = readFromKeychain('Codex Auth')
  if (keychainJson) {
    const keychainResult = parseCodexCredJson(keychainJson)
    if (keychainResult.status === 'valid' || keychainResult.status === 'expired') {
      return keychainResult
    }
    // Keychain data unusable (parse_error / not_found) — fall through to file
  }

  // Fall back to ~/.codex/auth.json
  const authPath = join(homedir(), '.codex', 'auth.json')
  if (!existsSync(authPath)) {
    return { token: null, accountId: null, status: 'not_found', message: null }
  }

  let content: string
  try {
    content = readFileSync(authPath, 'utf-8')
  } catch (e) {
    return { token: null, accountId: null, status: 'parse_error', message: `Failed to read Codex auth file: ${e}` }
  }

  return parseCodexCredJson(content)
}

// ── Claude quota API query ────────────────────────────────────────────────────

const CLAUDE_KNOWN_TIERS = ['five_hour', 'seven_day', 'seven_day_opus', 'seven_day_sonnet']
const CLAUDE_QUOTA_URL = 'https://api.anthropic.com/api/oauth/usage'

async function queryClaudeQuota(accessToken: string): Promise<QuotaResult> {
  let resp: Response
  try {
    resp = await fetch(CLAUDE_QUOTA_URL, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'anthropic-beta': 'oauth-2025-04-20',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    })
  } catch (e) {
    return apiError('claude-code', `Network error: ${e}`)
  }

  if (resp.status === 401 || resp.status === 403) {
    return expiredError('claude-code', `Authentication failed (HTTP ${resp.status}). Please re-login with Claude CLI.`)
  }

  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    return apiError('claude-code', `API error (HTTP ${resp.status}): ${body}`)
  }

  let body: Record<string, unknown>
  try {
    body = await resp.json()
  } catch (e) {
    return apiError('claude-code', `Failed to parse API response: ${e}`)
  }

  const tiers: QuotaTier[] = []

  // Parse known tiers first (in defined order)
  for (const name of CLAUDE_KNOWN_TIERS) {
    const window = body[name] as Record<string, unknown> | undefined
    if (!window) continue
    const utilization = window['utilization'] as number | undefined
    if (utilization == null) continue
    tiers.push({
      name,
      utilization,
      resetsAt: (window['resets_at'] as string | undefined) ?? null,
    })
  }

  // Parse any additional unknown tiers returned by the API
  for (const [key, value] of Object.entries(body)) {
    if (key === 'extra_usage' || CLAUDE_KNOWN_TIERS.includes(key)) continue
    const window = value as Record<string, unknown> | undefined
    if (!window || typeof window !== 'object') continue
    const utilization = window['utilization'] as number | undefined
    if (utilization == null) continue
    tiers.push({
      name: key,
      utilization,
      resetsAt: (window['resets_at'] as string | undefined) ?? null,
    })
  }

  return {
    tool: 'claude-code',
    credentialStatus: 'valid',
    credentialMessage: null,
    success: true,
    tiers,
    error: null,
    queriedAt: nowMs(),
  }
}

// ── Codex quota API query ─────────────────────────────────────────────────────

const CODEX_QUOTA_URL = 'https://chatgpt.com/backend-api/wham/usage'

function windowSecondsToTierName(seconds: number): string {
  if (seconds <= 3600 * 6) return 'five_hour'     // ≤6h → 5h window
  if (seconds <= 86400 * 7) return 'weekly_limit' // ≤7d → weekly
  return `${seconds}s`
}

async function callCodexQuotaApi(accessToken: string, accountId: string | null): Promise<QuotaResult> {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${accessToken}`,
    'User-Agent': 'codex-cli',
    'Accept': 'application/json',
  }
  if (accountId) headers['ChatGPT-Account-Id'] = accountId

  let resp: Response
  try {
    resp = await fetch(CODEX_QUOTA_URL, {
      headers,
      signal: AbortSignal.timeout(10000),
    })
  } catch (e) {
    return apiError('codex', `Network error: ${e}`)
  }

  if (resp.status === 401 || resp.status === 403) {
    return expiredError('codex', `Authentication failed (HTTP ${resp.status}). Please re-login with Codex CLI.`)
  }

  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    return apiError('codex', `API error (HTTP ${resp.status}): ${body}`)
  }

  let body: Record<string, unknown>
  try {
    body = await resp.json()
  } catch (e) {
    return apiError('codex', `Failed to parse API response: ${e}`)
  }

  const tiers: QuotaTier[] = []
  const rateLimit = body['rate_limit'] as Record<string, unknown> | undefined

  if (rateLimit) {
    for (const windowKey of ['primary_window', 'secondary_window']) {
      const window = rateLimit[windowKey] as Record<string, unknown> | undefined
      if (!window) continue
      const usedPercent = window['used_percent'] as number | undefined
      if (usedPercent == null) continue
      const windowSecs = window['limit_window_seconds'] as number | undefined
      const name = windowSecs != null ? windowSecondsToTierName(windowSecs) : 'unknown'
      const resetAt = window['reset_at'] as number | null | undefined
      const resetsAt = resetAt ? new Date(resetAt * 1000).toISOString() : null
      tiers.push({ name, utilization: usedPercent, resetsAt })
    }
  }

  return {
    tool: 'codex',
    credentialStatus: 'valid',
    credentialMessage: null,
    success: true,
    tiers,
    error: null,
    queriedAt: nowMs(),
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Query Claude Code official subscription quota */
export async function queryClaudeCodeQuota(): Promise<QuotaResult> {
  const cred = readClaudeCredentials()

  if (cred.status === 'not_found') return notFound('claude-code')
  if (cred.status === 'parse_error') return parseError('claude-code', cred.message ?? 'Failed to parse credentials')

  if (cred.status === 'expired') {
    // Try anyway — token might still work
    if (cred.token) {
      const result = await queryClaudeQuota(cred.token)
      if (result.success) return result
    }
    return expiredError('claude-code', cred.message ?? 'OAuth token has expired')
  }

  return queryClaudeQuota(cred.token!)
}

/** Query Codex official subscription quota */
export async function queryCodexQuota(): Promise<QuotaResult> {
  const cred = readCodexCredentials()

  if (cred.status === 'not_found') return notFound('codex')
  if (cred.status === 'parse_error') return parseError('codex', cred.message ?? 'Failed to parse credentials')

  if (cred.status === 'expired') {
    if (cred.token) {
      const result = await callCodexQuotaApi(cred.token, cred.accountId)
      if (result.success) return result
    }
    return expiredError('codex', cred.message ?? 'Codex OAuth token may be stale')
  }

  return callCodexQuotaApi(cred.token!, cred.accountId)
}

/** Query all supported tools in parallel */
export async function queryAllQuotas(): Promise<QuotaResult[]> {
  const [claude, codex] = await Promise.all([
    queryClaudeCodeQuota(),
    queryCodexQuota(),
  ])
  return [claude, codex]
}
