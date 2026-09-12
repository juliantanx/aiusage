import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { getState, setSyncTargetState } from '../init.js'
import { SyncOrchestrator, type SyncBackend, type SyncResult } from '../sync/index.js'
import { CloudSyncOrchestrator, type CloudSyncResult } from '../sync/cloud-orchestrator.js'
import { verifyConsent } from '../sync/consent.js'
import { GitSyncBackend } from '../sync/git.js'
import { S3SyncBackend } from '../sync/s3.js'
import { loadConfig, buildConsentConfig, loadCredential, AIUSAGE_DIR } from '../config.js'
import { hasCredentials } from '../leaderboard/credentials.js'
import type { SyncProgress } from '../sync/runtime.js'
import { getSyncTarget } from '../sync/target.js'
import { repairSyncContamination, type RepairReport } from '../sync/repair.js'
import { githubToken } from '../github/auth.js'

export function createBackend(config: import('../config.js').Config): SyncBackend | null {
  const sync = config.sync
  if (!sync) return null

  if (sync.backend === 'github') {
    if (!sync.repo) return null
    if (!sync.githubAuth && !process.env.AIUSAGE_GITHUB_TOKEN && !loadCredential(`github/${sync.repo}/token`)) return null
    return new GitSyncBackend({
      repo: sync.repo,
      getToken: () => githubToken(sync),
      branch: sync.branch,
      cacheDir: join(AIUSAGE_DIR, 'sync-repo'),
    })
  }

  if (sync.backend === 's3') {
    if (!sync.bucket) return null
    const accessKeyId = loadCredential(`s3/${sync.bucket}/accessKeyId`)
    const secretAccessKey = loadCredential(`s3/${sync.bucket}/secretAccessKey`)
    if (!accessKeyId || !secretAccessKey) return null
    return new S3SyncBackend({
      bucket: sync.bucket,
      prefix: sync.prefix ?? 'aiusage/',
      accessKeyId,
      secretAccessKey,
      endpoint: sync.endpoint,
      region: sync.region,
    })
  }

  return null
}

function failedResult(error: string): SyncResult {
  return { status: 'failed', pulledCount: 0, uploadedCount: 0, mergedCount: 0, error }
}

function blockedResult(error: string): SyncResult {
  return { status: 'blocked_pending_consent', pulledCount: 0, uploadedCount: 0, mergedCount: 0, error }
}

export async function runSync(
  db: Database.Database,
  options?: { onProgress?: (progress: SyncProgress) => void },
): Promise<SyncResult | CloudSyncResult> {
  const config = loadConfig()
  if (!config?.sync) {
    return failedResult('Sync not configured. Run "aiusage init" first.')
  }

  const state = getState(AIUSAGE_DIR)
  const target = getSyncTarget(config.sync)
  if (!target) {
    return failedResult('Invalid sync configuration.')
  }

  // Cloud sync doesn't use consent system — it uses device auth (HMAC)
  if (config.sync.backend === 'cloud') {
    if (!hasCredentials()) {
      return failedResult('Not logged in. Run "aiusage login" first.')
    }

    const orchestrator = new CloudSyncOrchestrator(db, {
      deviceInstanceId: state!.deviceInstanceId,
      target,
      onProgress: options?.onProgress,
    })

    const startedAt = Date.now()
    const result = await orchestrator.sync()

    const now = Date.now()
    setSyncTargetState(AIUSAGE_DIR, target, {
      lastSyncAt: now,
      lastSyncStatus: result.status === 'ok' ? 'ok' : 'failed',
      lastSyncError: result.error,
      lastSyncUploaded: result.uploadedCount,
      lastSyncPulled: result.pulledCount,
      lastSyncDurationMs: now - startedAt,
    })

    return result
  }

  // GitHub/S3 sync uses consent system
  const consent = state?.syncConsents?.[target]
    ?? (state?.lastSyncTarget === target && state.syncConsentAt && state.syncConsentTarget
      ? { syncConsentAt: state.syncConsentAt, syncConsentTarget: state.syncConsentTarget }
      : null)
  if (!consent?.syncConsentAt || !consent?.syncConsentTarget) {
    setSyncTargetState(AIUSAGE_DIR, target, { lastSyncStatus: 'blocked_pending_consent' })
    return blockedResult('Sync consent not provided. Run "aiusage init" to approve.')
  }

  const consentConfig = buildConsentConfig(config)
  if (!consentConfig) {
    return failedResult('Invalid sync configuration.')
  }

  if (!verifyConsent(consent.syncConsentTarget, consentConfig)) {
    setSyncTargetState(AIUSAGE_DIR, target, { lastSyncStatus: 'blocked_pending_consent' })
    return blockedResult('Sync configuration has changed since last approval. Run "aiusage init" to re-approve.')
  }

  const backend = createBackend(config)
  if (!backend) {
    return failedResult('Could not create sync backend. Check credentials.')
  }

  const orchestrator = new SyncOrchestrator(db, backend, {
    deviceInstanceId: state!.deviceInstanceId,
    target,
    consentVerified: true,
    onProgress: options?.onProgress,
  })

  const startedAt = Date.now()
  const result = await orchestrator.sync()

  const now = Date.now()
  setSyncTargetState(AIUSAGE_DIR, target, {
    lastSyncAt: now,
    lastSyncStatus: result.status === 'ok' ? 'ok' : result.status,
    lastSyncError: result.error,
    lastSyncUploaded: result.uploadedCount,
    lastSyncPulled: result.pulledCount,
    lastSyncDurationMs: now - startedAt,
  })

  return result
}

export interface SyncRepairOptions {
  /** Perform the changes; without it the report is a dry run. */
  apply?: boolean
  /** Also repair namespaces owned by other devices (file-based backends). */
  allNamespaces?: boolean
}

/**
 * `aiusage sync --repair`: analyse (and with `apply`, clean up) records that
 * the pre-provenance sync bug copied into the wrong device namespace.
 * See sync/repair.ts for the rules. Consent is required exactly as for sync,
 * because repairing rewrites files in the configured remote.
 */
export async function runSyncRepair(
  db: Database.Database,
  options: SyncRepairOptions = {},
): Promise<{ status: 'ok' | 'failed' | 'blocked_pending_consent'; report?: RepairReport; error?: string }> {
  const config = loadConfig()
  if (!config?.sync) {
    return { status: 'failed', error: 'Sync not configured. Run "aiusage init" first.' }
  }
  const state = getState(AIUSAGE_DIR)
  if (!state?.deviceInstanceId) {
    return { status: 'failed', error: 'Device identity not initialised. Run "aiusage init" first.' }
  }
  const target = getSyncTarget(config.sync)
  if (!target) {
    return { status: 'failed', error: 'Invalid sync configuration.' }
  }

  // Cloud backend has no per-device namespaces: local repair only.
  if (config.sync.backend === 'cloud') {
    const report = await repairSyncContamination(db, { deviceInstanceId: state.deviceInstanceId, apply: options.apply })
    return { status: 'ok', report }
  }

  const consent = state.syncConsents?.[target]
    ?? (state.lastSyncTarget === target && state.syncConsentAt && state.syncConsentTarget
      ? { syncConsentAt: state.syncConsentAt, syncConsentTarget: state.syncConsentTarget }
      : null)
  const consentConfig = buildConsentConfig(config)
  if (!consent?.syncConsentAt || !consent?.syncConsentTarget || !consentConfig || !verifyConsent(consent.syncConsentTarget, consentConfig)) {
    return { status: 'blocked_pending_consent', error: 'Sync consent not provided. Run "aiusage init" to approve.' }
  }

  const backend = createBackend(config)
  if (!backend) {
    return { status: 'failed', error: 'Could not create sync backend. Check credentials.' }
  }

  try {
    const report = await repairSyncContamination(db, {
      deviceInstanceId: state.deviceInstanceId,
      backend,
      allNamespaces: options.allNamespaces,
      apply: options.apply,
    })
    return { status: 'ok', report }
  } catch (error) {
    return { status: 'failed', error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/** Human-readable rendering of a repair report for the CLI. */
export function formatRepairReport(report: RepairReport): string {
  const lines: string[] = []
  const verb = report.applied ? 'Removed' : 'Would remove'
  const flag = report.applied ? 'Re-flagged' : 'Would re-flag'
  lines.push(`Device: ${report.deviceInstanceId}`)
  lines.push('')
  lines.push('Local database:')
  lines.push(`  ${flag} ${report.local.reflagRecordIds.length} record(s) still marked local that were pulled from other devices`)
  lines.push(`  ${verb} ${report.local.echoSyncedIds.length} echoed row(s) from synced_records (copies of records that bounced through another device)`)
  lines.push(`  ${verb} ${report.local.echoMergedIds.length} merged copy(ies) of those echoes from records`)
  lines.push(`  ${verb} ${report.local.staleSyncStateCount} stale sync bookkeeping row(s)`)
  if (report.remote) {
    lines.push('')
    lines.push(`Remote: scanned ${report.remote.scannedFiles} file(s), ${report.remote.scannedLines} line(s)`)
    for (const ns of report.remote.namespaces) {
      const own = ns.owner === report.deviceInstanceId ? ' (this device)' : ''
      const bad = ns.foreignLines + ns.echoLines
      lines.push(`  ${ns.owner}${own}: ${ns.lines} line(s) in ${ns.files} file(s), ${bad} contaminated (${ns.foreignLines} foreign-device, ${ns.echoLines} echo)`)
    }
    const dropped = report.remote.files.reduce((n, f) => n + f.foreignLines + f.echoLines, 0)
    lines.push(`  ${verb} ${dropped} line(s) across ${report.remote.files.length} file(s)`)
    if (report.remoteResult) {
      lines.push(`  Rewrote ${report.remoteResult.rewritten} file(s), deleted ${report.remoteResult.deleted} empty file(s), ${report.remoteResult.flushed ? 'pushed' : 'nothing to push'}`)
    }
  }
  if (!report.applied) {
    lines.push('')
    lines.push('Dry run — nothing was changed. Re-run with --apply to perform these changes.')
  }
  return lines.join('\n')
}
