import type { SyncConfig } from '../config.js'

export function getSyncTarget(sync: SyncConfig | undefined): string | null {
  if (!sync) return null
  if (sync.backend === 'cloud') return 'cloud'
  if (sync.backend === 'github' && sync.repo) return `github:${sync.repo}`
  if (sync.backend === 's3' && sync.bucket) return `s3:${sync.bucket}`
  return null
}
