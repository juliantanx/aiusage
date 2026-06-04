import type Database from 'better-sqlite3'
import { migrateV1 } from './v1.js'
import { migrateV2 } from './v2.js'
import { migrateV3 } from './v3.js'
import { migrateV4 } from './v4.js'
import { migrateV5 } from './v5.js'
import { migrateV6 } from './v6.js'
import { createSchemaVersionTable } from '../schema.js'

const MIGRATIONS = [
  { version: 1, migrate: migrateV1 },
  { version: 2, migrate: migrateV2 },
  { version: 3, migrate: migrateV3 },
  { version: 4, migrate: migrateV4 },
  { version: 5, migrate: migrateV5 },
  { version: 6, migrate: migrateV6 },
]

export function runMigrations(db: Database.Database): void {
  createSchemaVersionTable(db)

  const currentVersion = db.prepare(
    'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1'
  ).get() as { version: number } | undefined

  const current = currentVersion?.version ?? 0

  for (const migration of MIGRATIONS) {
    if (migration.version > current) {
      db.transaction(() => {
        migration.migrate(db)
      })()
    }
  }
}
