import { createDatabase } from '../db/index.js'
import { getState } from '../init.js'
import { AIUSAGE_DIR } from '../config.js'
import { generateSummary } from './summary.js'
import { uploadSnapshots, LeaderboardApiError, UploadRequest, UploadSnapshot } from '../leaderboard/api.js'
import { computeTokenSnapshotHash } from '../leaderboard/crypto.js'
import { getCurrentPeriods } from '../leaderboard/periods.js'
import { hasCredentials } from '../leaderboard/credentials.js'
import { join } from 'node:path'

const DB_PATH = join(AIUSAGE_DIR, 'cache.db')

function getServerUrl(): string {
  return process.env.AIUSAGE_LEADERBOARD_URL || 'https://aiusage.jtanx.com'
}

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

export async function runLeaderboardUpload(): Promise<void> {
  if (!hasCredentials()) {
    console.error('Not logged in. Run `aiusage leaderboard login` first.')
    process.exit(1)
  }

  const serverUrl = getServerUrl()
  const db = createDatabase(DB_PATH)
  const state = getState(AIUSAGE_DIR)

  try {
    // Generate summary for current device
    const summary = generateSummary(db, {
      currentDeviceInstanceId: state?.deviceInstanceId,
    })

    if (summary.totalTokens === 0) {
      console.log('No token usage data to upload.')
      return
    }

    console.log(`Preparing upload: ${summary.totalTokens.toLocaleString()} tokens`)

    // Generate snapshots for all periods
    const periods = getCurrentPeriods()
    const snapshots: UploadSnapshot[] = periods.map(period => ({
      ...period,
      total_tokens: summary.totalTokens,
      token_snapshot_hash: computeTokenSnapshotHash({
        ...period,
        total_tokens: summary.totalTokens,
        schema_version: 1,
      }),
    }))

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

        console.log('\n=== Upload Results ===')
        for (const snap of response.snapshots) {
          const icon = snap.status === 'accepted' ? '✓' :
                      snap.status === 'flagged' ? '⚠' : '✗'
          console.log(`${icon} ${snap.period_type}: ${snap.status}${snap.reason_message ? ` - ${snap.reason_message}` : ''}`)
        }

        const accepted = response.snapshots.filter(s => s.status === 'accepted').length
        const flagged = response.snapshots.filter(s => s.status === 'flagged').length
        const rejected = response.snapshots.filter(s => s.status === 'rejected').length

        console.log(`\nSummary: ${accepted} accepted, ${flagged} flagged, ${rejected} rejected`)

        if (flagged > 0) {
          console.log('Flagged snapshots will be reviewed by administrators.')
        }

        return
      } catch (error) {
        if (error instanceof LeaderboardApiError) {
          lastError = error

          if (!isRetryableError(error) || attempt >= maxRetries) {
            break
          }

          // Handle specific retryable errors
          if (error.code === 'rate_limited' && error.retryAfter) {
            console.log(`Rate limited. Waiting ${error.retryAfter} seconds...`)
            await sleep(error.retryAfter * 1000)
            continue
          }

          if (error.code === 'timestamp_expired') {
            console.log('Timestamp expired. Please check your system clock.')
            break
          }

          if (error.code === 'nonce_reused') {
            console.log('Nonce reused. Retrying with new nonce...')
            continue
          }

          // Exponential backoff for other retryable errors
          const delay = baseDelay * Math.pow(2, attempt)
          console.log(`Upload failed (attempt ${attempt + 1}/${maxRetries + 1}). Retrying in ${delay / 1000}s...`)
          await sleep(delay)
        } else {
          throw error
        }
      }
    }

    // If we get here, all retries failed
    if (lastError) {
      console.error(`\n✗ Upload failed: ${lastError.message}`)

      if (lastError.code === 'device_not_found' || lastError.code === 'device_revoked') {
        console.error('Please run `aiusage leaderboard login` to re-authenticate.')
      } else if (lastError.code === 'user_banned') {
        console.error('Your account has been banned from the leaderboard.')
      } else if (lastError.code === 'invalid_signature') {
        console.error('Authentication error. Please run `aiusage leaderboard login` again.')
      } else if (lastError.code === 'unsupported_schema_version' || lastError.code === 'client_version_too_old') {
        console.error('Please update your CLI to the latest version.')
      }

      process.exit(1)
    }
  } finally {
    db.close()
  }
}
