import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function loadLocalEnv(): void {
  const envPath = resolve(process.cwd(), '.env')
  if (!existsSync(envPath)) return

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
}

async function main() {
  loadLocalEnv()
  const { runMigrations } = await import('./schema.js')
  const { sql } = await import('./pool.js')

  try {
    await runMigrations()
    console.log('All migrations applied.')
  } catch (err) {
    console.error('Migration failed:', err)
    process.exit(1)
  } finally {
    await sql.end()
  }
}

main()
