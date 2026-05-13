import type Database from 'better-sqlite3'
import { getState, setState } from '../init.js'
import { SyncOrchestrator, type SyncBackend, type SyncResult } from '../sync/index.js'
import { verifyConsent, generateConsentFingerprint } from '../sync/consent.js'
import { GitHubSyncBackend } from '../sync/github.js'
import { S3SyncBackend } from '../sync/s3.js'
import { loadConfig, buildConsentConfig, loadCredential, AIUSAGE_DIR } from '../config.js'

function createBackend(config: import('../config.js').Config): SyncBackend | null {
  const sync = config.sync
  if (!sync) return null

  if (sync.backend === 'github') {
    if (!sync.repo) return null
    const token = loadCredential(`github/${sync.repo}/token`)
    if (!token) return null
    return new GitHubSyncBackend({ repo: sync.repo, token })
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

export async function runSync(db: Database.Database): Promise<SyncResult> {
  const config = loadConfig()
  if (!config?.sync) {
    return failedResult('Cloud sync not configured. Run "aiusage init" first.')
  }

  const state = getState(AIUSAGE_DIR)
  if (!state?.syncConsentAt || !state?.syncConsentTarget) {
    setState(AIUSAGE_DIR, { lastSyncStatus: 'blocked_pending_consent' })
    return blockedResult('Sync consent not provided. Run "aiusage init" to approve.')
  }

  const consentConfig = buildConsentConfig(config)
  if (!consentConfig) {
    return failedResult('Invalid sync configuration.')
  }

  if (!verifyConsent(state.syncConsentTarget, consentConfig)) {
    setState(AIUSAGE_DIR, { lastSyncStatus: 'blocked_pending_consent' })
    return blockedResult('Sync configuration has changed since last approval. Run "aiusage init" to re-approve.')
  }

  const backend = createBackend(config)
  if (!backend) {
    return failedResult('Could not create sync backend. Check credentials.')
  }

  const orchestrator = new SyncOrchestrator(db, backend, {
    deviceInstanceId: state.deviceInstanceId,
    consentVerified: true,
  })

  const result = await orchestrator.sync()

  const now = Date.now()
  setState(AIUSAGE_DIR, {
    lastSyncAt: now,
    lastSyncStatus: result.status === 'ok' ? 'ok' : result.status,
    lastSyncTarget: `${config.sync.backend}:${config.sync.repo ?? config.sync.bucket}`,
    lastSyncUploaded: result.uploadedCount,
    lastSyncPulled: result.pulledCount,
  })

  return result
}
