import type Database from 'better-sqlite3'
import { generateSyncRecordId } from '@aiusage/core'
import { retireWireIdsOfUnknownLocalRows } from '../records.js'

/**
 * Authoritative sync namespaces.
 *
 * 1. `sync_record_claims` remembers, per sync target, which records of which
 *    foreign device namespace this device has mirrored. Pull replaces a
 *    target's claims for a namespace with what the namespace holds now and
 *    deletes pulled rows only when no target claims them any more, so a
 *    namespace that shrinks or disappears on one target never removes rows
 *    another target still carries.
 *
 *    Rows pulled before this migration have no claim and nothing records
 *    which target they came from. They are marked *unresolved*
 *    (`synced_records.unclaimed_since` = sync tick 0, before any sync of
 *    this release) and are protected from reconciliation until their
 *    provenance is settled: `sync_namespace_verdicts` records, per target
 *    and namespace owner, the sync tick at which the target last judged that
 *    namespace reliably (a verified read, an authoritatively empty
 *    namespace, or a confirmed absence). An unresolved row is deleted only
 *    once every sync target this device knows has judged its namespace in a
 *    sync after the one that made the row unresolved, and none claimed it.
 *    The same state and rule cover rows upserted later from a namespace that
 *    could not be verified. See `docs/sync-namespaces.md`.
 *
 * 2. `sync_retired_wire_ids` holds wire ids this device has published under a
 *    target but will never publish again. Antigravity and Trae records used to
 *    be uploaded under `sha256(device, sourceFile, lineOffset)`, which is not
 *    unique for those tools (several usage events share one generation index;
 *    every Trae session shares offset 0), silently collapsing records. They now
 *    travel under their parser-generated `record.id`. File-based backends
 *    replace the whole namespace on the next sync, so nothing else is needed
 *    there; the cloud backend is upsert-only, so the old ids are pushed as
 *    tombstones and then forgotten. The affected `sync_record_state` rows are
 *    dropped so the records are re-published under their new ids.
 *
 * 3. Local rows still stamped with the pre-init `'unknown'` device id that
 *    were already published are in the same situation for every tool whose
 *    wire id is generated from the device id (Claude Code, Codex, …): the
 *    first sync adopts them under the real id, which changes their wire id.
 *    Their old `sha256('unknown', sourceFile, lineOffset)` ids are retired
 *    per target and their sync state cleared here, so the cloud copies are
 *    retracted rather than left behind. (Rows the previous release had
 *    already relabelled at parse time cannot be told apart any more; file
 *    backends drop their stale lines with the next snapshot regardless.)
 */
const REKEYED_TOOLS = ['antigravity', 'trae'] as const

export function migrateV14(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_record_claims (
      target             TEXT NOT NULL,
      device_instance_id TEXT NOT NULL,
      record_id          TEXT NOT NULL,
      PRIMARY KEY (target, device_instance_id, record_id)
    );
    CREATE INDEX IF NOT EXISTS idx_sync_record_claims_record ON sync_record_claims(record_id);

    CREATE TABLE IF NOT EXISTS sync_retired_wire_ids (
      target  TEXT NOT NULL,
      wire_id TEXT NOT NULL,
      PRIMARY KEY (target, wire_id)
    );

    CREATE TABLE IF NOT EXISTS sync_namespace_verdicts (
      target             TEXT NOT NULL,
      device_instance_id TEXT NOT NULL,
      judged_at          INTEGER NOT NULL,
      PRIMARY KEY (target, device_instance_id)
    );
  `)

  // Every row mirrored so far is of unknown provenance: no target claims it
  // and no target has judged its namespace since claims exist. Stamping sync
  // tick 0 makes such rows wait for a verdict from every known target
  // (every verdict has a tick of 1 or more) rather than be pruned by the
  // first one that reconciles.
  const columns = db.prepare(`PRAGMA table_info(synced_records)`).all() as Array<{ name: string }>
  if (!columns.some(c => c.name === 'unclaimed_since')) {
    db.exec(`ALTER TABLE synced_records ADD COLUMN unclaimed_since INTEGER`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_synced_records_unclaimed ON synced_records(unclaimed_since) WHERE unclaimed_since IS NOT NULL`)
    db.prepare(`
      UPDATE synced_records SET unclaimed_since = 0
      WHERE id NOT IN (SELECT record_id FROM sync_record_claims)
    `).run()
  }

  const placeholders = REKEYED_TOOLS.map(() => '?').join(', ')
  const rows = db.prepare(`
    SELECT s.target, r.device_instance_id, r.source_file, r.line_offset
    FROM sync_record_state s
    JOIN records r ON r.id = s.record_id
    WHERE r.origin = 'local' AND r.tool IN (${placeholders})
  `).all(...REKEYED_TOOLS) as Array<{ target: string; device_instance_id: string; source_file: string; line_offset: number }>

  if (rows.length > 0) {
    const insert = db.prepare(`INSERT OR IGNORE INTO sync_retired_wire_ids (target, wire_id) VALUES (?, ?)`)
    for (const row of rows) {
      insert.run(row.target, generateSyncRecordId(row.device_instance_id, row.source_file, row.line_offset))
    }
    db.prepare(`
      DELETE FROM sync_record_state
      WHERE record_id IN (SELECT id FROM records WHERE origin = 'local' AND tool IN (${placeholders}))
    `).run(...REKEYED_TOOLS)
    db.prepare(`
      UPDATE records SET synced_at = NULL
      WHERE origin = 'local' AND tool IN (${placeholders})
    `).run(...REKEYED_TOOLS)
  }

  retireWireIdsOfUnknownLocalRows(db)

  db.prepare('INSERT INTO schema_version (version) VALUES (14)').run()
}
