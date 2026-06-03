import postgres from 'postgres'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

let _sql: ReturnType<typeof postgres> | null = null
let envLoaded = false

function loadLocalEnv(): void {
  if (envLoaded) return
  envLoaded = true

  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), 'packages/site/.env'),
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

function getSql(): ReturnType<typeof postgres> {
  if (!_sql) {
    loadLocalEnv()
    const databaseUrl = process.env.DATABASE_URL
    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is required')
    }
    _sql = postgres(databaseUrl, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10
    })
  }
  return _sql
}

// sql is callable (for tagged template literals) and has properties (like .begin)
// Use a function with forwarded properties
function sql(strings: TemplateStringsArray, ...values: unknown[]) {
  return getSql()(strings, ...values)
}

// Forward property access to the underlying client
const sqlProxy = new Proxy(sql, {
  get(_target, prop) {
    const db = getSql()
    return (db as unknown as Record<string | symbol, unknown>)[prop]
  },
  apply(_target, _thisArg, args) {
    return (getSql() as unknown as Function)(...args)
  }
})

export { sqlProxy as sql }
