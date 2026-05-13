import { generateConsentFingerprint } from '../sync/consent.js'
import { setState, getState } from '../init.js'
import { loadConfig, saveConfig, buildConsentConfig, AIUSAGE_DIR, type Config } from '../config.js'

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
    const config: Config = {
      device: options.device ?? existingConfig?.device,
      retentionDays: existingConfig?.retentionDays ?? 180,
      parseInterval: existingConfig?.parseInterval ?? 60,
      dashboardPollInterval: existingConfig?.dashboardPollInterval ?? 30,
      credentials: existingConfig?.credentials,
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
      credentials: {
        ...existingConfig?.credentials,
        [`github/${options.repo}/token`]: options.token,
      },
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
      credentials: {
        ...existingConfig?.credentials,
        [`s3/${options.bucket}/accessKeyId`]: options.accessKeyId,
        [`s3/${options.bucket}/secretAccessKey`]: options.secretAccessKey,
      },
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
