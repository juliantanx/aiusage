import { readFileSync, writeFileSync, mkdirSync, unlinkSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { chmodSync } from 'node:fs'
import { AIUSAGE_DIR } from '../config.js'

const CREDENTIALS_FILE = join(AIUSAGE_DIR, 'leaderboard-credentials.json')

export interface DeviceCredentials {
  device_id: string
  device_secret: string
  obtained_at: string
}

export function saveCredentials(creds: DeviceCredentials): void {
  const dir = dirname(CREDENTIALS_FILE)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(CREDENTIALS_FILE, JSON.stringify(creds, null, 2), 'utf-8')
  // Restrict file permissions to owner only (Unix-like systems)
  try {
    chmodSync(CREDENTIALS_FILE, 0o600)
  } catch {
    // Windows doesn't support chmod in the same way
  }
}

export function loadCredentials(): DeviceCredentials | null {
  try {
    const data = readFileSync(CREDENTIALS_FILE, 'utf-8')
    return JSON.parse(data)
  } catch {
    return null
  }
}

export function clearCredentials(): void {
  try {
    if (existsSync(CREDENTIALS_FILE)) {
      unlinkSync(CREDENTIALS_FILE)
    }
  } catch {
    // Ignore errors on cleanup
  }
}

export function hasCredentials(): boolean {
  return existsSync(CREDENTIALS_FILE)
}
