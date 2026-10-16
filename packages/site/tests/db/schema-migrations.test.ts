import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { queries, resetFakeSql, respondWith } from '../mocks/sql.js'

vi.mock('../../src/lib/server/db/pool.js', async () => ({ sql: (await import('../mocks/sql.js')).fakeSql }))
// Seeded on every startup after the migrations; not part of what is tested here.
vi.mock('../../src/lib/server/pricing/curated-prices.js', () => ({ ensureCuratedPrices: async () => 0 }))
vi.mock('../../src/lib/server/pricing/curated-aliases.js', () => ({ ensureCuratedPricingAliases: async () => ({ added: 0, updated: 0 }) }))

import { runMigrations } from '../../src/lib/server/db/schema.js'

const BEFORE_V16 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15]

function database(appliedVersions: number[]) {
  respondWith((q) => {
    if (q.text.startsWith('SELECT version FROM schema_migrations')) return appliedVersions.map(version => ({ version }))
    return undefined
  })
}

/** Statements that change the schema or delete data, i.e. what a migration ran. */
function migrationStatements(): string[] {
  return queries
    .map(q => q.text)
    .filter(text => /^(ALTER|DROP|DELETE|DO|CREATE (TABLE|INDEX|UNIQUE INDEX)) /.test(text) && !text.includes('schema_migrations'))
}

beforeEach(() => {
  resetFakeSql()
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('migration v16: leaderboard_metrics survives upload-history pruning', () => {
  it('runs on a database that is already at v15 and only rewrites the foreign key', async () => {
    database(BEFORE_V16)

    await runMigrations()

    const statements = migrationStatements()
    expect(statements).toHaveLength(4)
    expect(statements[0]).toBe('ALTER TABLE leaderboard_metrics ALTER COLUMN upload_request_id DROP NOT NULL')
    // The old constraint is found in the catalog, whatever it is called.
    expect(statements[1]).toContain("c.conrelid = 'leaderboard_metrics'::regclass AND c.confrelid = 'upload_requests'::regclass AND c.contype = 'f' AND a.attname = 'upload_request_id'")
    expect(statements[1]).toContain("EXECUTE format('ALTER TABLE leaderboard_metrics DROP CONSTRAINT %I', fk.conname)")
    expect(statements[2]).toBe(
      'ALTER TABLE leaderboard_metrics ADD CONSTRAINT leaderboard_metrics_upload_request_id_fkey FOREIGN KEY (upload_request_id) REFERENCES upload_requests(id) ON DELETE SET NULL'
    )
    // statements[3] is migration v17.
    expect(queries.filter(q => q.text.startsWith('INSERT INTO schema_migrations')).map(q => q.values)).toEqual([[16], [17]])
  })

  it('does nothing once it is recorded as applied', async () => {
    database([...BEFORE_V16, 16, 17])

    await runMigrations()

    expect(migrationStatements()).toEqual([])
    expect(queries.some(q => q.text.startsWith('INSERT INTO schema_migrations'))).toBe(false)
  })

  it('runs after the migration that creates the table on a new database', async () => {
    database([])

    await runMigrations()

    const statements = migrationStatements()
    const createTable = statements.findIndex(text => text.startsWith('CREATE TABLE IF NOT EXISTS leaderboard_metrics'))
    const setNull = statements.findIndex(text => text.endsWith('ON DELETE SET NULL'))
    expect(createTable).toBeGreaterThanOrEqual(0)
    expect(setNull).toBeGreaterThan(createTable)
  })
})
