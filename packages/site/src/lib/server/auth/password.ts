import bcrypt from 'bcryptjs'
import { getConfigValue, CFG } from '$lib/server/config.js'

const SALT_ROUNDS = 12

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export type ValidationError = { code: string; params?: Record<string, number> } | null

export async function validateUsername(username: string): Promise<ValidationError> {
  const minLen = await getConfigValue(CFG.USERNAME_MIN_LENGTH)
  const maxLen = await getConfigValue(CFG.USERNAME_MAX_LENGTH)
  if (!username || username.length < minLen || username.length > maxLen) {
    return { code: 'username_length', params: { min: minLen, max: maxLen } }
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return { code: 'username_chars' }
  }
  return null
}

export function validateEmail(email: string): ValidationError {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { code: 'invalid_email' }
  }
  return null
}

export async function validatePassword(password: string): Promise<ValidationError> {
  const minLen = await getConfigValue(CFG.PASSWORD_MIN_LENGTH)
  if (!password || password.length < minLen) {
    return { code: 'password_length', params: { min: minLen } }
  }
  return null
}
