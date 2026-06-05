import { describe, it, expect } from 'vitest'
import { computeHmac, sha256, generateNonce, generateIdempotencyKey, buildCanonicalString, base64url, sha256Buffer } from '../../src/leaderboard/crypto.js'

describe('sha256', () => {
  it('produces consistent hex hash', () => {
    const hash = sha256('hello')
    expect(hash).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824')
  })

  it('produces different hashes for different inputs', () => {
    expect(sha256('a')).not.toBe(sha256('b'))
  })
})

describe('computeHmac', () => {
  it('produces consistent HMAC', () => {
    const hmac1 = computeHmac('secret', 'message')
    const hmac2 = computeHmac('secret', 'message')
    expect(hmac1).toBe(hmac2)
  })

  it('differs with different secrets', () => {
    expect(computeHmac('s1', 'msg')).not.toBe(computeHmac('s2', 'msg'))
  })

  it('differs with different messages', () => {
    expect(computeHmac('s', 'a')).not.toBe(computeHmac('s', 'b'))
  })
})

describe('generateNonce', () => {
  it('returns 32 char hex string', () => {
    const nonce = generateNonce()
    expect(nonce).toMatch(/^[0-9a-f]{32}$/)
  })

  it('generates unique values', () => {
    const a = generateNonce()
    const b = generateNonce()
    expect(a).not.toBe(b)
  })
})

describe('generateIdempotencyKey', () => {
  it('returns 32 char hex string', () => {
    expect(generateIdempotencyKey()).toMatch(/^[0-9a-f]{32}$/)
  })
})

describe('buildCanonicalString', () => {
  it('joins parts with newlines', () => {
    const result = buildCanonicalString('POST', '/path', 'hash', '123', 'nonce', 'dev', 'idem')
    expect(result).toBe('POST\n/path\nhash\n123\nnonce\ndev\nidem')
  })
})

describe('base64url', () => {
  it('encodes buffer to base64url', () => {
    const buf = Buffer.from([0xff, 0xfe, 0xfd])
    const result = base64url(buf)
    expect(result).not.toContain('+')
    expect(result).not.toContain('/')
  })

  it('encodes string to base64url', () => {
    const result = base64url('hello world')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })
})

describe('sha256Buffer', () => {
  it('returns a Buffer', () => {
    const result = sha256Buffer('test')
    expect(Buffer.isBuffer(result)).toBe(true)
    expect(result.length).toBe(32)
  })
})
