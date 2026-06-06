import bcrypt from 'bcryptjs'
import { getConfigValue, CFG } from '$lib/server/config.js'

const SALT_ROUNDS = 12

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export async function validateUsername(username: string): Promise<string | null> {
  const minLen = await getConfigValue(CFG.USERNAME_MIN_LENGTH)
  const maxLen = await getConfigValue(CFG.USERNAME_MAX_LENGTH)
  if (!username || username.length < minLen || username.length > maxLen) {
    return `Username must be ${minLen}-${maxLen} characters`
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return 'Username can only contain letters, numbers, underscores, and hyphens'
  }
  return null
}

export function validateEmail(email: string): string | null {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return 'Invalid email format'
  }
  return null
}

export async function validatePassword(password: string): Promise<string | null> {
  const minLen = await getConfigValue(CFG.PASSWORD_MIN_LENGTH)
  if (!password || password.length < minLen) {
    return `Password must be at least ${minLen} characters`
  }
  return null
}
