import { createDatabase } from '../db/index.js'
import { getState } from '../init.js'
import { AIUSAGE_DIR } from '../config.js'
import { generateSummary } from './summary.js'
import { uploadSnapshots, LeaderboardApiError, UploadBreakdown, UploadRequest, UploadSnapshot } from '../leaderboard/api.js'
import { sha256 } from '../leaderboard/crypto.js'
import { getCurrentPeriods } from '../leaderboard/periods.js'
import { hasCredentials } from '../leaderboard/credentials.js'
import { join } from 'node:path'
import { getSiteUrl } from '../site-url.js'
import type Database from 'better-sqlite3'

const DB_PATH = join(AIUSAGE_DIR, 'cache.db')

function getClientPlatform(): string {
  if (process.platform === 'darwin') return 'macos'
  if (process.platform === 'linux') return 'linux'
  if (process.platform === 'win32') return 'windows'
  return 'unknown'
}

function getCliVersion(): string {
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

function isRetryableError(error: LeaderboardApiError): boolean {
  const retryableCodes = [
    'rate_limited',
    'timestamp_expired',
    'nonce_reused',
    'network_error',
  ]
  return retryableCodes.includes(error.code || '') ||
         (error.message.includes('500') || error.message.includes('502') ||
          error.message.includes('503') || error.message.includes('504'))
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

interface TokenTotals {
  total_tokens: number
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_write_tokens: number
  thinking_tokens: number
}

interface UsageGroup extends TokenTotals {
  tool: string
  model: string
}

export interface LeaderboardUploadResult {
  totalTokens: number
  response: Awaited<ReturnType<typeof uploadSnapshots>> | null
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

function rowTotals(row: UsageGroup): TokenTotals {
  return {
    total_tokens: row.total_tokens,
    input_tokens: row.input_tokens,
    output_tokens: row.output_tokens,
    cache_read_tokens: row.cache_read_tokens,
    cache_write_tokens: row.cache_write_tokens,
    thinking_tokens: row.thinking_tokens,
  }
}

function buildBreakdown(
  scope_type: UploadBreakdown['scope_type'],
  tool: string | null,
  model: string | null,
  totals: TokenTotals
): UploadBreakdown {
  return { scope_type, tool, model, ...totals }
}

function normalizeBreakdowns(breakdowns: UploadBreakdown[]): UploadBreakdown[] {
  return [...breakdowns].sort((a, b) =>
    a.scope_type.localeCompare(b.scope_type) ||
    String(a.tool ?? '').localeCompare(String(b.tool ?? '')) ||
    String(a.model ?? '').localeCompare(String(b.model ?? ''))
  )
}

function canonicalSnapshot(snapshot: Omit<UploadSnapshot, 'token_snapshot_hash'>): Omit<UploadSnapshot, 'token_snapshot_hash'> {
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

function getPeriodUsageGroups(
  db: Database.Database,
  currentDeviceInstanceId: string | undefined,
  startTs: number,
  endTs: number
): UsageGroup[] {
  const timeWhere = 'AND ts >= @startTs AND ts <= @endTs'
  const localOnlyFilter = "AND source_file NOT LIKE 'synced/%'"
  const params = { currentId: currentDeviceInstanceId ?? '', startTs, endTs }

  if (currentDeviceInstanceId) {
    return db.prepare(`
      SELECT tool, model,
             SUM(input_tokens) AS input_tokens,
             SUM(output_tokens) AS output_tokens,
             SUM(cache_read_tokens) AS cache_read_tokens,
             SUM(cache_write_tokens) AS cache_write_tokens,
             SUM(thinking_tokens) AS thinking_tokens,
             SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens + thinking_tokens) AS total_tokens
      FROM (
        SELECT COALESCE(NULLIF(tool, ''), 'unknown') AS tool,
               COALESCE(NULLIF(model, ''), 'unknown') AS model,
               CASE WHEN input_tokens > 0 THEN input_tokens ELSE 0 END AS input_tokens,
               CASE WHEN output_tokens > 0 THEN output_tokens ELSE 0 END AS output_tokens,
               CASE WHEN cache_read_tokens > 0 THEN cache_read_tokens ELSE 0 END AS cache_read_tokens,
               CASE WHEN cache_write_tokens > 0 THEN cache_write_tokens ELSE 0 END AS cache_write_tokens,
               CASE WHEN thinking_tokens > 0 THEN thinking_tokens ELSE 0 END AS thinking_tokens
        FROM records
        WHERE 1=1 ${localOnlyFilter} ${timeWhere}
        UNION ALL
        SELECT COALESCE(NULLIF(tool, ''), 'unknown') AS tool,
               COALESCE(NULLIF(model, ''), 'unknown') AS model,
               CASE WHEN input_tokens > 0 THEN input_tokens ELSE 0 END AS input_tokens,
               CASE WHEN output_tokens > 0 THEN output_tokens ELSE 0 END AS output_tokens,
               CASE WHEN cache_read_tokens > 0 THEN cache_read_tokens ELSE 0 END AS cache_read_tokens,
               CASE WHEN cache_write_tokens > 0 THEN cache_write_tokens ELSE 0 END AS cache_write_tokens,
               CASE WHEN thinking_tokens > 0 THEN thinking_tokens ELSE 0 END AS thinking_tokens
        FROM synced_records
        WHERE device_instance_id != @currentId ${timeWhere}
      )
      GROUP BY tool, model
      ORDER BY total_tokens DESC, tool ASC, model ASC
    `).all(params) as UsageGroup[]
  }

  return db.prepare(`
    SELECT COALESCE(NULLIF(tool, ''), 'unknown') AS tool,
           COALESCE(NULLIF(model, ''), 'unknown') AS model,
           SUM(CASE WHEN input_tokens > 0 THEN input_tokens ELSE 0 END) AS input_tokens,
           SUM(CASE WHEN output_tokens > 0 THEN output_tokens ELSE 0 END) AS output_tokens,
           SUM(CASE WHEN cache_read_tokens > 0 THEN cache_read_tokens ELSE 0 END) AS cache_read_tokens,
           SUM(CASE WHEN cache_write_tokens > 0 THEN cache_write_tokens ELSE 0 END) AS cache_write_tokens,
           SUM(CASE WHEN thinking_tokens > 0 THEN thinking_tokens ELSE 0 END) AS thinking_tokens,
           SUM(
             (CASE WHEN input_tokens > 0 THEN input_tokens ELSE 0 END) +
             (CASE WHEN output_tokens > 0 THEN output_tokens ELSE 0 END) +
             (CASE WHEN cache_read_tokens > 0 THEN cache_read_tokens ELSE 0 END) +
             (CASE WHEN cache_write_tokens > 0 THEN cache_write_tokens ELSE 0 END) +
             (CASE WHEN thinking_tokens > 0 THEN thinking_tokens ELSE 0 END)
           ) AS total_tokens
    FROM records
    WHERE 1=1 ${timeWhere}
    GROUP BY tool, model
    ORDER BY total_tokens DESC, tool ASC, model ASC
  `).all({ startTs, endTs }) as UsageGroup[]
}

function buildSnapshotHash(snapshot: Omit<UploadSnapshot, 'token_snapshot_hash'>): string {
  return 'sha256:' + sha256(JSON.stringify(canonicalSnapshot(snapshot)))
}

function buildSnapshot(
  db: Database.Database,
  currentDeviceInstanceId: string | undefined,
  period: { period_type: string; period_start: string; period_end: string }
): UploadSnapshot {
  const groups = getPeriodUsageGroups(
    db,
    currentDeviceInstanceId,
    Date.parse(period.period_start),
    Date.parse(period.period_end)
  )
  let total = zeroTotals()
  const byTool = new Map<string, TokenTotals>()
  const byModel = new Map<string, TokenTotals>()

  for (const group of groups) {
    const totals = rowTotals(group)
    total = mergeTotals(total, totals)

    const toolKey = group.tool || ''
    const modelKey = group.model || ''
    if (toolKey) byTool.set(toolKey, mergeTotals(byTool.get(toolKey) ?? zeroTotals(), totals))
    if (modelKey) byModel.set(modelKey, mergeTotals(byModel.get(modelKey) ?? zeroTotals(), totals))
  }

  const breakdowns: UploadBreakdown[] = [
    buildBreakdown('all', null, null, total),
    ...Array.from(byTool.entries()).map(([tool, totals]) => buildBreakdown('tool', tool, null, totals)),
    ...Array.from(byModel.entries()).map(([model, totals]) => buildBreakdown('model', null, model, totals)),
    ...groups.map(group => buildBreakdown('tool_model', group.tool, group.model, rowTotals(group))),
  ]

  const snapshot = {
    ...period,
    ...total,
    breakdowns: normalizeBreakdowns(breakdowns),
  }

  return {
    ...snapshot,
    token_snapshot_hash: buildSnapshotHash(snapshot),
  }
}

export async function uploadLeaderboardData(
  db: Database.Database,
  currentDeviceInstanceId: string | undefined,
  onRetry?: (message: string) => void
): Promise<LeaderboardUploadResult> {
  if (!hasCredentials()) {
    throw new LeaderboardApiError('Not logged in. Run `aiusage login` first.', 'not_logged_in')
  }

  const serverUrl = getSiteUrl()

  // Generate summary for current device
  const summary = generateSummary(db, {
    currentDeviceInstanceId,
  })

  if (summary.totalTokens === 0) {
    return { totalTokens: 0, response: null }
  }

  // Generate snapshots for all periods
  const periods = getCurrentPeriods()
  const snapshots: UploadSnapshot[] = periods.map(period => buildSnapshot(db, currentDeviceInstanceId, period))

  const payload: UploadRequest = {
    schema_version: 1,
    client_version: getCliVersion(),
    client_platform: getClientPlatform(),
    snapshots,
  }

  // Upload with retry logic
  let lastError: LeaderboardApiError | null = null
  const maxRetries = 3
  const baseDelay = 5000 // 5 seconds

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await uploadSnapshots(serverUrl, payload)
      return { totalTokens: summary.totalTokens, response }
    } catch (error) {
      if (error instanceof LeaderboardApiError) {
        lastError = error

        if (!isRetryableError(error) || attempt >= maxRetries) {
          break
        }

        // Handle specific retryable errors
        if (error.code === 'rate_limited' && error.retryAfter) {
          onRetry?.(`Rate limited. Waiting ${error.retryAfter} seconds...`)
          await sleep(error.retryAfter * 1000)
          continue
        }

        if (error.code === 'timestamp_expired') {
          onRetry?.('Timestamp expired. Please check your system clock.')
          break
        }

        if (error.code === 'nonce_reused') {
          onRetry?.('Nonce reused. Retrying with new nonce...')
          continue
        }

        // Exponential backoff for other retryable errors
        const delay = baseDelay * Math.pow(2, attempt)
        onRetry?.(`Upload failed (attempt ${attempt + 1}/${maxRetries + 1}). Retrying in ${delay / 1000}s...`)
        await sleep(delay)
      } else {
        throw error
      }
    }
  }

  if (lastError) throw lastError
  throw new LeaderboardApiError('Upload failed', 'upload_failed')
}

export async function runLeaderboardUpload(): Promise<void> {
  const db = createDatabase(DB_PATH)
  const state = getState(AIUSAGE_DIR)

  try {
    const result = await uploadLeaderboardData(db, state?.deviceInstanceId, message => console.log(message))

    if (result.totalTokens === 0 || !result.response) {
      console.log('No token usage data to upload.')
      return
    }

    console.log(`Preparing upload: ${result.totalTokens.toLocaleString()} tokens`)
    console.log('\n=== Upload Results ===')
    for (const snap of result.response.snapshots) {
      const icon = snap.status === 'accepted' ? '✓' :
                  snap.status === 'flagged' ? '⚠' : '✗'
      console.log(`${icon} ${snap.period_type}: ${snap.status}${snap.reason_message ? ` - ${snap.reason_message}` : ''}`)
    }

    const accepted = result.response.snapshots.filter(s => s.status === 'accepted').length
    const flagged = result.response.snapshots.filter(s => s.status === 'flagged').length
    const rejected = result.response.snapshots.filter(s => s.status === 'rejected').length

    console.log(`\nSummary: ${accepted} accepted, ${flagged} flagged, ${rejected} rejected`)

    if (flagged > 0) {
      console.log('Flagged snapshots will be reviewed by administrators.')
    }
  } catch (error) {
    if (error instanceof LeaderboardApiError) {
      console.error(`\n✗ Upload failed: ${error.message}`)

      if (error.code === 'not_logged_in') {
        console.error('Please run `aiusage login` first.')
      } else if (error.code === 'device_not_found' || error.code === 'device_revoked') {
        console.error('Please run `aiusage login` to re-authenticate.')
      } else if (error.code === 'user_banned') {
        console.error('Your account has been banned from the leaderboard.')
      } else if (error.code === 'invalid_signature') {
        console.error('Authentication error. Please run `aiusage login` again.')
      } else if (error.code === 'unsupported_schema_version' || error.code === 'client_version_too_old') {
        console.error('Please update your CLI to the latest version.')
      }

      process.exit(1)
    }

    throw error
  } finally {
    db.close()
  }
}
