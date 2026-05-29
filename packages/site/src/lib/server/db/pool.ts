import postgres from 'postgres'
import { env } from '$env/dynamic/private'

let _sql: ReturnType<typeof postgres> | null = null

function getSql(): ReturnType<typeof postgres> {
  if (!_sql) {
    const databaseUrl = env.DATABASE_URL || process.env.DATABASE_URL
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
