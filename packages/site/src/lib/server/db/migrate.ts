import { runMigrations } from './schema.js'
import { sql } from './pool.js'

async function main() {
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
