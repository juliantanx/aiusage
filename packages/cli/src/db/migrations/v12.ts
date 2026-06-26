import type Database from 'better-sqlite3'

/**
 * Issue #12 repair migration.
 *
 * v1.5.0–v1.5.7 shipped a cwd/source_file backfill that enriched local records
 * but forgot to bump `updated_at`. Because cross-device propagation only
 * re-uploads records where `updated_at > synced_at` (and the remote merge only
 * overwrites when the incoming `updatedAt` is strictly newer), the enriched
 * cwd/source_file never reached other devices. On the device running
 * `aiusage serve`, Codex (and other cwd-dependent) projects therefore stayed
 * invisible because the synced rows carry no cwd and no source_file.
 *
 * The backfill itself is fixed to bump `updated_at` going forward, but users who
 * already ran the buggy version have cwd populated locally (so the corrected
 * `WHERE cwd = ''` backfill no longer matches them). This one-time migration
 * re-marks those already-enriched records as changed so the next sync re-uploads
 * them with the complete wire format. Record ids are device-scoped, so bumping
 * `updated_at` only re-uploads each device's own rows (last-write-wins is safe).
 */
export function migrateV12(db: Database.Database): void {
  db.prepare(`
    UPDATE records
    SET updated_at = ?
    WHERE source_file NOT LIKE 'synced/%'
      AND (cwd != '' OR source_file LIKE '%:session:%')
  `).run(Date.now())

  db.prepare('INSERT INTO schema_version (version) VALUES (12)').run()
}
