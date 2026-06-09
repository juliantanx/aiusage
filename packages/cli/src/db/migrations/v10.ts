import type Database from 'better-sqlite3'

export function migrateV10(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS model_prices (
      model_key        TEXT PRIMARY KEY,
      provider         TEXT NOT NULL DEFAULT '',
      input            REAL NOT NULL,
      output           REAL NOT NULL,
      cache_read       REAL,
      cache_write      REAL,
      currency         TEXT NOT NULL DEFAULT 'USD',
      source           TEXT NOT NULL DEFAULT 'manual',
      source_model_id  TEXT,
      source_url       TEXT,
      origin           TEXT NOT NULL DEFAULT 'user',
      status           TEXT NOT NULL DEFAULT 'active',
      last_synced_at   INTEGER,
      created_at       INTEGER NOT NULL,
      updated_at       INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS model_price_aliases (
      alias       TEXT PRIMARY KEY,
      model_key   TEXT NOT NULL REFERENCES model_prices(model_key) ON DELETE CASCADE,
      match_type  TEXT NOT NULL DEFAULT 'exact',
      provider    TEXT NOT NULL DEFAULT '',
      priority    INTEGER NOT NULL DEFAULT 100,
      source      TEXT NOT NULL DEFAULT 'manual',
      origin      TEXT NOT NULL DEFAULT 'user',
      enabled     INTEGER NOT NULL DEFAULT 1,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_model_prices_origin ON model_prices(origin);
    CREATE INDEX IF NOT EXISTS idx_model_prices_source ON model_prices(source);
    CREATE INDEX IF NOT EXISTS idx_model_price_aliases_model ON model_price_aliases(model_key);

    INSERT INTO schema_version (version) VALUES (10);
  `)
}
