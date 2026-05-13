import type Database from 'better-sqlite3'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { getState, setState } from '../init.js'
import { SyncOrchestrator, type SyncBackend, type SyncResult } from '../sync/index.js'
import { verifyConsent, generateConsentFingerprint, type ConsentConfig } from '../sync/consent.js'
import { GitHubSyncBackend } from '../sync/github.js'
import { S3SyncBackend } from '../sync/s3.js'

const AIUSAGE_DIR = join(homedir(), '.aiusage')
const CONFIG_PATH = join(AIUSAGE_DIR, 'config.json')

const SYNC_FIELDS = [
  'ts', 'inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens',
  'thinkingTokens', 'cost', 'costSource', 'tool', 'model', 'provider',
  'sessionKey', 'device', 'deviceInstanceId', 'updatedAt',
]

interface Config {
  sync?: {
    backend: 'github' | 's3'
    repo?: string
    bucket?: string
    prefix?: string
    endpoint?: string
    region?: string
    credentialRef?: string
  }
  device?: string
  retentionDays?: number
}

function loadConfig(): Config | null {
  if (!existsSync(CONFIG_PATH)) return null
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'))
  } catch {
    return null
  }
}

function loadCredential(ref: string): string | null {
  // In v1, credentials are stored in config.json with allowPlaintextCredentialFallback
  // For keychain references, we'd need platform-specific integration
  // For now, check if the credential is stored directly in config
  const config = loadConfig()
  if (!config) return null
  // Placeholder: in production, integrate with keychain
  return null
}

function createBackend(config: Config): SyncBackend | null {
  const sync = config.sync
  if (!sync) return null

  if (sync.backend === 'github') {
    if (!sync.repo) return null
    // Token would come from credential store
    const token = loadCredential(sync.credentialRef ?? '') ?? ''
    if (!token) return null
    return new GitHubSyncBackend({ repo: sync.repo, token })
  }

  if (sync.backend === 's3') {
    if (!sync.bucket) return null
    const accessKeyId = loadCredential(`${sync.credentialRef}/accessKeyId`) ?? ''
    const secretAccessKey = loadCredential(`${sync.credentialRef}/secretAccessKey`) ?? ''
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

function buildConsentConfig(config: Config): ConsentConfig | null {
  const sync = config.sync
  if (!sync) return null

  const backend = sync.backend
  const target = backend === 'github'
    ? sync.repo ?? ''
    : `${sync.bucket}/${sync.prefix ?? 'aiusage/'}`
  const endpoint = backend === 'github'
    ? 'https://api.github.com'
    : sync.endpoint ?? 'https://s3.amazonaws.com'
  const region = sync.region ?? 'global'

  return {
    backend,
    target,
    endpoint,
    region,
    fields: SYNC_FIELDS,
    operations: ['read', 'write'],
    schemaVersion: 'v1',
  }
}

export async function runSync(db: Database.Database): Promise<SyncResult> {
  const config = loadConfig()
  if (!config?.sync) {
    return {
      status: 'failed',
      pulledCount: 0,
      uploadedCount: 0,
      error: 'Cloud sync not configured. Run "aiusage init" first.',
    }
  }

  const state = getState(AIUSAGE_DIR)
  if (!state?.syncConsentAt || !state?.syncConsentTarget) {
    setState(AIUSAGE_DIR, { lastSyncStatus: 'blocked_pending_consent' })
    return {
      status: 'blocked_pending_consent',
      pulledCount: 0,
      uploadedCount: 0,
      error: 'Sync consent not provided. Run "aiusage init" to approve.',
    }
  }

  // Verify consent matches current config
  const consentConfig = buildConsentConfig(config)
  if (!consentConfig) {
    return {
      status: 'failed',
      pulledCount: 0,
      uploadedCount: 0,
      error: 'Invalid sync configuration.',
    }
  }

  if (!verifyConsent(state.syncConsentTarget, consentConfig)) {
    setState(AIUSAGE_DIR, { lastSyncStatus: 'blocked_pending_consent' })
    return {
      status: 'blocked_pending_consent',
      pulledCount: 0,
      uploadedCount: 0,
      error: 'Sync configuration has changed since last approval. Run "aiusage init" to re-approve.',
    }
  }

  const backend = createBackend(config)
  if (!backend) {
    return {
      status: 'failed',
      pulledCount: 0,
      uploadedCount: 0,
      error: 'Could not create sync backend. Check credentials.',
    }
  }

  const orchestrator = new SyncOrchestrator(db, backend, {
    deviceInstanceId: state.deviceInstanceId,
    consentVerified: true,
  })

  // Run sync
  const result = await orchestrator.sync()

  // Update state
  const now = Date.now()
  setState(AIUSAGE_DIR, {
    lastSyncAt: now,
    lastSyncStatus: result.status === 'ok' ? 'ok' : result.status,
    lastSyncTarget: `${config.sync!.backend}:${config.sync!.repo ?? config.sync!.bucket}`,
    lastSyncUploaded: result.uploadedCount,
    lastSyncPulled: result.pulledCount,
  })

  return result
}
