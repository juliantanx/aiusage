import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { generateConsentFingerprint, type ConsentConfig } from '../sync/consent.js'
import { getState, setState } from '../init.js'

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
  parseInterval?: number
  dashboardPollInterval?: number
}

export function loadConfig(): Config | null {
  if (!existsSync(CONFIG_PATH)) return null
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'))
  } catch {
    return null
  }
}

export function saveConfig(config: Config): void {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), { mode: 0o600 })
}

export function buildConsentConfig(config: Config): ConsentConfig | null {
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

export interface InitOptions {
  backend?: 'github' | 's3' | 'skip'
  repo?: string
  bucket?: string
  prefix?: string
  endpoint?: string
  region?: string
  device?: string
  token?: string
  accessKeyId?: string
  secretAccessKey?: string
}

export function runInit(options: InitOptions): { success: boolean; message: string } {
  const existingConfig = loadConfig()

  if (options.backend === 'skip' || !options.backend) {
    // Save config without sync
    const config: Config = {
      device: options.device ?? existingConfig?.device,
      retentionDays: existingConfig?.retentionDays ?? 180,
      parseInterval: existingConfig?.parseInterval ?? 60,
      dashboardPollInterval: existingConfig?.dashboardPollInterval ?? 30,
    }
    saveConfig(config)
    return { success: true, message: 'Configuration saved without cloud sync.' }
  }

  if (options.backend === 'github') {
    if (!options.repo) {
      return { success: false, message: 'GitHub repository is required (format: username/repo-name).' }
    }
    if (!options.token) {
      return { success: false, message: 'GitHub Personal Access Token is required.' }
    }

    const config: Config = {
      sync: {
        backend: 'github',
        repo: options.repo,
        credentialRef: `keychain://aiusage/github/${options.repo}`,
      },
      device: options.device ?? existingConfig?.device,
      retentionDays: existingConfig?.retentionDays ?? 180,
      parseInterval: existingConfig?.parseInterval ?? 60,
      dashboardPollInterval: existingConfig?.dashboardPollInterval ?? 30,
    }

    // Build consent config and generate fingerprint
    const consentConfig = buildConsentConfig(config)
    if (!consentConfig) {
      return { success: false, message: 'Failed to build consent configuration.' }
    }
    const fingerprint = generateConsentFingerprint(consentConfig)

    // Save config
    saveConfig(config)

    // Update state with consent
    setState(AIUSAGE_DIR, {
      syncConsentAt: Date.now(),
      syncConsentTarget: fingerprint,
    })

    return {
      success: true,
      message: `GitHub sync configured: ${options.repo}\nConsent recorded for schema v1.`,
    }
  }

  if (options.backend === 's3') {
    if (!options.bucket) {
      return { success: false, message: 'S3 bucket name is required.' }
    }
    if (!options.accessKeyId || !options.secretAccessKey) {
      return { success: false, message: 'S3 access key ID and secret access key are required.' }
    }

    const prefix = options.prefix ?? 'aiusage/'
    if (!prefix || prefix === '/') {
      return { success: false, message: 'S3 prefix must not be empty or point to bucket root.' }
    }

    const config: Config = {
      sync: {
        backend: 's3',
        bucket: options.bucket,
        prefix,
        endpoint: options.endpoint,
        region: options.region ?? 'auto',
        credentialRef: `keychain://aiusage/s3/${options.bucket}`,
      },
      device: options.device ?? existingConfig?.device,
      retentionDays: existingConfig?.retentionDays ?? 180,
      parseInterval: existingConfig?.parseInterval ?? 60,
      dashboardPollInterval: existingConfig?.dashboardPollInterval ?? 30,
    }

    const consentConfig = buildConsentConfig(config)
    if (!consentConfig) {
      return { success: false, message: 'Failed to build consent configuration.' }
    }
    const fingerprint = generateConsentFingerprint(consentConfig)

    saveConfig(config)
    setState(AIUSAGE_DIR, {
      syncConsentAt: Date.now(),
      syncConsentTarget: fingerprint,
    })

    return {
      success: true,
      message: `S3 sync configured: ${options.bucket}/${prefix}\nConsent recorded for schema v1.`,
    }
  }

  return { success: false, message: 'Unknown backend.' }
}
