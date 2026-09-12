import type { Config, SyncConfig } from '../config.js'
import { setPat } from '../github/auth.js'

function credentialFields(sync?: SyncConfig): Record<string, string> {
  if (sync?.backend === 'github' && sync.repo) return { githubToken: `github/${sync.repo}/token` }
  if (sync?.backend === 's3' && sync.bucket) return {
    s3AccessKeyId: `s3/${sync.bucket}/accessKeyId`,
    s3SecretAccessKey: `s3/${sync.bucket}/secretAccessKey`,
  }
  return {}
}

export function credentialStatus(config: Config, sync = config.sync): Record<string, boolean> {
  if (sync?.backend === 'github') {
    const auth = config.sync?.repo === sync.repo ? config.sync?.githubAuth : undefined
    return { githubApp: auth?.method === 'github-app', githubToken: Boolean(
      (auth?.method === 'pat' && auth.credentialId) || config.credentials?.[`github/${sync.repo}/token`] || process.env.AIUSAGE_GITHUB_TOKEN) }
  }
  return Object.fromEntries(Object.entries(credentialFields(sync)).map(([field, key]) => [field, Boolean(config.credentials?.[key])]))
}

export function publicSyncConfig(sync?: SyncConfig): Record<string, unknown> | null {
  if (!sync) return null
  const { backend, repo, bucket, prefix, endpoint, region } = sync
  return { backend, repo, bucket, prefix, endpoint, region,
    ...(sync.githubAuth ? { githubAuth: { method: sync.githubAuth.method,
      ...(sync.githubAuth.method === 'github-app' ? { login: sync.githubAuth.login } : {}) } } : {}) }
}

export function setSyncCredentials(config: Config, values: Record<string, unknown>): void {
  for (const [field, key] of Object.entries(credentialFields(config.sync))) {
    const value = values[field]
    // Empty or omitted fields preserve the existing value.
    if (typeof value === 'string' && value) {
      if (field === 'githubToken') setPat(config, value)
      else config.credentials = { ...config.credentials, [key]: value }
    }
  }
}
