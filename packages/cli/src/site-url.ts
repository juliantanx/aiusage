import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

let envLoaded = false

function loadLocalEnv(): void {
  if (envLoaded) return
  envLoaded = true

  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), 'packages/site/.env'),
    resolve(process.cwd(), '../site/.env'),
  ]

  for (const envPath of candidates) {
    if (!existsSync(envPath)) continue

    const content = readFileSync(envPath, 'utf-8')
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue

      const key = trimmed.slice(0, eq).trim()
      const rawValue = trimmed.slice(eq + 1).trim()
      if (!key || process.env[key] != null) continue
      process.env[key] = rawValue.replace(/^['"]|['"]$/g, '')
    }
    return
  }
}

export function getSiteUrl(): string {
  loadLocalEnv()
  return process.env.SITE_URL || 'https://aiusage.jtanx.com'
}
