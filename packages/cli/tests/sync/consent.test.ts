import { describe, it, expect } from 'vitest'
import { generateConsentFingerprint, verifyConsent } from '../../src/sync/consent.js'

describe('Consent Flow', () => {
  it('generates consistent fingerprint for same inputs', () => {
    const fp1 = generateConsentFingerprint({
      backend: 'github',
      target: 'username/aiusage-data',
      endpoint: 'https://api.github.com',
      region: 'global',
      fields: ['ts', 'inputTokens', 'outputTokens'],
      operations: ['read', 'write'],
      schemaVersion: 'v1',
    })
    const fp2 = generateConsentFingerprint({
      backend: 'github',
      target: 'username/aiusage-data',
      endpoint: 'https://api.github.com',
      region: 'global',
      fields: ['ts', 'inputTokens', 'outputTokens'],
      operations: ['read', 'write'],
      schemaVersion: 'v1',
    })
    expect(fp1).toBe(fp2)
  })

  it('generates different fingerprint for different backends', () => {
    const fp1 = generateConsentFingerprint({
      backend: 'github',
      target: 'username/aiusage-data',
      endpoint: 'https://api.github.com',
      region: 'global',
      fields: ['ts'],
      operations: ['read', 'write'],
      schemaVersion: 'v1',
    })
    const fp2 = generateConsentFingerprint({
      backend: 's3',
      target: 'bucket/prefix',
      endpoint: 'https://s3.amazonaws.com',
      region: 'us-east-1',
      fields: ['ts'],
      operations: ['read', 'write'],
      schemaVersion: 'v1',
    })
    expect(fp1).not.toBe(fp2)
  })

  it('verifies consent matches current config', () => {
    const consent = {
      backend: 'github' as const,
      target: 'username/aiusage-data',
      endpoint: 'https://api.github.com',
      region: 'global',
      fields: ['ts', 'inputTokens'],
      operations: ['read', 'write'] as const,
      schemaVersion: 'v1',
    }
    const fingerprint = generateConsentFingerprint(consent)
    expect(verifyConsent(fingerprint, consent)).toBe(true)
  })

  it('rejects consent when target changes', () => {
    const consent = {
      backend: 'github' as const,
      target: 'username/aiusage-data',
      endpoint: 'https://api.github.com',
      region: 'global',
      fields: ['ts', 'inputTokens'],
      operations: ['read', 'write'] as const,
      schemaVersion: 'v1',
    }
    const fingerprint = generateConsentFingerprint(consent)
    const modifiedConsent = { ...consent, target: 'other/repo' }
    expect(verifyConsent(fingerprint, modifiedConsent)).toBe(false)
  })
})
