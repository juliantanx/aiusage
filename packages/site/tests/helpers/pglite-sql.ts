// A real PostgreSQL database (PGlite, Postgres compiled to WebAssembly) behind
// the shape of the postgres.js client exported by src/lib/server/db/pool.ts:
// tagged templates, nested query fragments, `begin` and `.count`. Tests that
// need actual SQL semantics mock the pool with it and run the real schema:
//
//   vi.mock('../../src/lib/server/db/pool.js', async () => ({ sql: (await import('../helpers/pglite-sql.js')).sql }))
//   beforeAll(() => migrateTestDatabase())
//
// One database per test file (vitest isolates modules per file).
import { PGlite, types, type Transaction } from '@electric-sql/pglite'

type Runner = Pick<PGlite, 'query'> | Transaction

const db = new PGlite()

// postgres.js returns int8 and numeric columns as strings.
const parsers = {
  [types.INT8]: (value: string) => value,
  [types.NUMERIC]: (value: string) => value,
}

class Fragment implements PromiseLike<Record<string, unknown>[] & { count: number }> {
  constructor(
    private readonly runner: () => Runner,
    readonly strings: readonly string[],
    readonly values: unknown[],
  ) {}

  /** Statement text with `$n` placeholders, inlining nested fragments. */
  build(params: unknown[] = []): { text: string; params: unknown[] } {
    let text = this.strings[0]
    this.values.forEach((value, i) => {
      if (value instanceof Fragment) {
        text += value.build(params).text
      } else {
        params.push(value)
        text += `$${params.length}`
      }
      text += this.strings[i + 1]
    })
    return { text, params }
  }

  async execute(): Promise<Record<string, unknown>[] & { count: number }> {
    const { text, params } = this.build()
    // postgres.js sends strings and numbers untyped and lets the server infer
    // the type from the statement; booleans and dates are typed.
    const paramTypes = params.map(p =>
      typeof p === 'boolean' ? types.BOOL : p instanceof Date ? types.TIMESTAMPTZ : 0
    )
    const serialized = params.map(p =>
      p == null || typeof p === 'boolean' ? p : p instanceof Date ? p.toISOString() : String(p)
    )
    const result = await this.runner().query<Record<string, unknown>>(text, serialized, { paramTypes, parsers })
    const rows = [...result.rows]
    return Object.assign(rows, { count: result.fields.length > 0 ? rows.length : (result.affectedRows ?? 0) })
  }

  then<A = Record<string, unknown>[] & { count: number }, B = never>(
    onFulfilled?: ((value: Record<string, unknown>[] & { count: number }) => A | PromiseLike<A>) | null,
    onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): Promise<A | B> {
    return this.execute().then(onFulfilled, onRejected)
  }
}

type Tag = ((strings: TemplateStringsArray, ...values: unknown[]) => Fragment) & {
  begin<T>(fn: (tx: Tag) => Promise<T>): Promise<T>
}

function tagFor(runner: () => Runner, inTransaction: boolean): Tag {
  const tag = (strings: TemplateStringsArray, ...values: unknown[]) => new Fragment(runner, strings, values)
  return Object.assign(tag, {
    begin<T>(fn: (tx: Tag) => Promise<T>): Promise<T> {
      if (inTransaction) throw new Error('nested begin is not supported')
      return db.transaction((tx) => fn(tagFor(() => tx, true)))
    },
  })
}

export const sql = tagFor(() => db, false)

/** Applies the site schema (every versioned migration) to the test database. */
export async function migrateTestDatabase(): Promise<void> {
  const { runMigrations } = await import('../../src/lib/server/db/schema.js')
  const log = console.log
  console.log = () => {}
  try {
    await runMigrations()
  } finally {
    console.log = log
  }
}

/** Raw access for fixtures and assertions. */
export function query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  return db.query<T>(text, params, { parsers }).then(r => r.rows)
}

export async function truncate(...tables: string[]): Promise<void> {
  await db.exec(`TRUNCATE ${tables.join(', ')} CASCADE`)
}
