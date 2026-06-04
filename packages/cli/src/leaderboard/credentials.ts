import { readFileSync, writeFileSync, mkdirSync, unlinkSync, existsSync, renameSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { chmodSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
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
  const tmpFile = `${CREDENTIALS_FILE}.${randomBytes(4).toString('hex')}.tmp`
  try {
    writeFileSync(tmpFile, JSON.stringify(creds, null, 2), { encoding: 'utf-8', mode: 0o600 })
    renameSync(tmpFile, CREDENTIALS_FILE)
  } catch (err) {
    try { unlinkSync(tmpFile) } catch { /* cleanup best-effort */ }
    throw err
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
