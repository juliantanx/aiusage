import type Database from 'better-sqlite3'

export function migrateV11(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS model_price_sync_baselines (
      model_key        TEXT PRIMARY KEY,
      provider         TEXT NOT NULL DEFAULT '',
      input            REAL NOT NULL,
      output           REAL NOT NULL,
      cache_read       REAL,
      cache_write      REAL,
      currency         TEXT NOT NULL DEFAULT 'USD',
      source           TEXT NOT NULL DEFAULT 'litellm',
      source_model_id  TEXT,
      source_url       TEXT,
      last_synced_at   INTEGER NOT NULL,
      updated_at       INTEGER NOT NULL
    );

    INSERT INTO model_price_sync_baselines (
      model_key, provider, input, output, cache_read, cache_write, currency, source,
      source_model_id, source_url, last_synced_at, updated_at
    )
    SELECT model_key, provider, input, output, cache_read, cache_write, currency, source,
           source_model_id, source_url, COALESCE(last_synced_at, updated_at), updated_at
    FROM model_prices
    WHERE origin = 'builtin' AND source != 'manual';

    INSERT INTO schema_version (version) VALUES (11);
  `)
}
