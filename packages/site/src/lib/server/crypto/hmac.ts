import { createHmac, createHash, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto'
import { env } from '$env/dynamic/private'

function getEncryptionKey(): string | undefined {
  return env.DEVICE_SECRET_ENCRYPTION_KEY
}

function getIpHashSecret(): string {
  return env.IP_HASH_SECRET || 'default-ip-hash-secret'
}

export function computeHmac(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('hex')
}

export function verifyHmac(data: string, secret: string, signature: string): boolean {
  const expected = computeHmac(data, secret)
  // Constant-time comparison
  if (expected.length !== signature.length) return false
  let result = 0
  for (let i = 0; i < expected.length; i++) {
    result |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  }
  return result === 0
}

export function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex')
}

export function hashIp(ip: string): string {
  return computeHmac(ip, getIpHashSecret())
}

export function encryptDeviceSecret(secret: string): string {
  const encKey = getEncryptionKey()
  if (!encKey) throw new Error('DEVICE_SECRET_ENCRYPTION_KEY not set')
  const key = Buffer.from(encKey, 'hex')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64')}:${encrypted.toString('base64')}:${tag.toString('base64')}`
}

export function decryptDeviceSecret(encrypted: string): string {
  const encKey = getEncryptionKey()
  if (!encKey) throw new Error('DEVICE_SECRET_ENCRYPTION_KEY not set')
  const key = Buffer.from(encKey, 'hex')
  const [ivB64, encB64, tagB64] = encrypted.split(':')
  const iv = Buffer.from(ivB64, 'base64')
  const enc = Buffer.from(encB64, 'base64')
  const tag = Buffer.from(tagB64, 'base64')
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
}

export function buildCanonicalString(
  method: string,
  path: string,
  bodyHash: string,
  timestamp: string,
  nonce: string,
  deviceId: string,
  idempotencyKey: string
): string {
  return [method, path, bodyHash, timestamp, nonce, deviceId, idempotencyKey].join('\n')
}

export function generateDeviceSecret(): string {
  return randomBytes(32).toString('hex')
}

export function generateNonce(): string {
  return randomBytes(16).toString('hex')
}

export function generateUserCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  const bytes = randomBytes(8)
  for (let i = 0; i < 8; i++) {
    code += chars[bytes[i] % chars.length]
    if (i === 3) code += '-'
  }
  return code
}
