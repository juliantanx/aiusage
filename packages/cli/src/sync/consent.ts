import { createHash } from 'node:crypto'

export interface ConsentConfig {
  backend: 'github' | 's3'
  target: string
  endpoint: string
  region: string
  fields: string[]
  operations: readonly string[]
  schemaVersion: string
}

export function generateConsentFingerprint(config: ConsentConfig): string {
  const input = [
    config.backend,
    config.target,
    config.endpoint,
    config.region,
    config.fields.join(','),
    config.operations.join(','),
    config.schemaVersion,
  ].join('|')

  return createHash('sha256').update(input).digest('hex').slice(0, 16)
}

export function verifyConsent(storedFingerprint: string, currentConfig: ConsentConfig): boolean {
  const currentFingerprint = generateConsentFingerprint(currentConfig)
  return storedFingerprint === currentFingerprint
}
