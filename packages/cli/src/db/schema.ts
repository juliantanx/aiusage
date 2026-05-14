import type Database from 'better-sqlite3'

export function applyPragmas(db: Database.Database): void {
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
}

export function createReadonlyViews(db: Database.Database): void {
  db.exec(`
    CREATE VIEW IF NOT EXISTS v_usage_records AS
    SELECT
      id,
      datetime(ts / 1000, 'unixepoch') || '.' || printf('%03d', ts % 1000) || 'Z' AS timestamp,
      ts,
      tool,
      model,
      provider,
      input_tokens,
      output_tokens,
      cache_read_tokens,
      cache_write_tokens,
      thinking_tokens,
      (input_tokens + output_tokens + cache_read_tokens + cache_write_tokens + thinking_tokens) AS total_tokens,
      cost,
      cost_source,
      session_id,
      source_file,
      device,
      device_instance_id,
      ingested_at,
      synced_at,
      updated_at
    FROM records;

    CREATE VIEW IF NOT EXISTS v_tool_calls AS
    SELECT
      tc.id,
      tc.record_id,
      tc.name,
      tc.tool AS tool_call_tool,
      datetime(tc.ts / 1000, 'unixepoch') || '.' || printf('%03d', tc.ts % 1000) || 'Z' AS timestamp,
      tc.ts,
      tc.call_index,
      r.tool,
      r.model,
      r.provider,
      r.session_id,
      r.source_file,
      r.device,
      r.device_instance_id
    FROM tool_calls tc
    LEFT JOIN records r ON r.id = tc.record_id;

    CREATE VIEW IF NOT EXISTS v_sessions AS
    SELECT
      session_id,
      tool,
      model,
      provider,
      device,
      device_instance_id,
      COUNT(*) AS record_count,
      MIN(ts) AS first_ts,
      datetime(MIN(ts) / 1000, 'unixepoch') || '.' || printf('%03d', MIN(ts) % 1000) || 'Z' AS first_timestamp,
      MAX(ts) AS last_ts,
      datetime(MAX(ts) / 1000, 'unixepoch') || '.' || printf('%03d', MAX(ts) % 1000) || 'Z' AS last_timestamp,
      SUM(input_tokens) AS input_tokens,
      SUM(output_tokens) AS output_tokens,
      SUM(cache_read_tokens) AS cache_read_tokens,
      SUM(cache_write_tokens) AS cache_write_tokens,
      SUM(thinking_tokens) AS thinking_tokens,
      SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens + thinking_tokens) AS total_tokens,
      SUM(cost) AS total_cost
    FROM records
    GROUP BY session_id, tool, model, provider, device, device_instance_id;
  `)
}

export function createSchemaVersionTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version     INTEGER PRIMARY KEY,
      applied_at  TEXT DEFAULT (datetime('now'))
    )
  `)
}

export function createV1Schema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE records (
      id                TEXT PRIMARY KEY,
      ts                INTEGER NOT NULL,
      ingested_at       INTEGER NOT NULL,
      synced_at         INTEGER,
      updated_at        INTEGER NOT NULL,
      line_offset       INTEGER NOT NULL,
      tool              TEXT NOT NULL,
      model             TEXT NOT NULL,
      provider          TEXT NOT NULL,
      input_tokens      INTEGER DEFAULT 0,
      output_tokens     INTEGER DEFAULT 0,
      cache_read_tokens INTEGER DEFAULT 0,
      cache_write_tokens INTEGER DEFAULT 0,
      thinking_tokens   INTEGER DEFAULT 0,
      cost              REAL DEFAULT 0,
      cost_source       TEXT NOT NULL DEFAULT 'pricing',
      session_id        TEXT NOT NULL,
      source_file       TEXT NOT NULL,
      device            TEXT NOT NULL,
      device_instance_id TEXT NOT NULL
    );

    CREATE TABLE synced_records (
      id                TEXT PRIMARY KEY,
      ts                INTEGER NOT NULL,
      tool              TEXT NOT NULL,
      model             TEXT NOT NULL,
      provider          TEXT NOT NULL,
      input_tokens      INTEGER DEFAULT 0,
      output_tokens     INTEGER DEFAULT 0,
      cache_read_tokens INTEGER DEFAULT 0,
      cache_write_tokens INTEGER DEFAULT 0,
      thinking_tokens   INTEGER DEFAULT 0,
      cost              REAL DEFAULT 0,
      cost_source       TEXT NOT NULL DEFAULT 'pricing',
      session_key       TEXT NOT NULL,
      device            TEXT NOT NULL,
      device_instance_id TEXT NOT NULL,
      platform          TEXT NOT NULL DEFAULT '',
      updated_at        INTEGER NOT NULL
    );

    CREATE TABLE sync_tombstones (
      id                TEXT NOT NULL,
      device_scope      TEXT NOT NULL,
      deleted_at        INTEGER NOT NULL,
      reason            TEXT NOT NULL,
      PRIMARY KEY (id, device_scope)
    );

    CREATE TABLE tool_calls (
      id          TEXT PRIMARY KEY,
      record_id   TEXT REFERENCES records(id) ON DELETE CASCADE,
      tool        TEXT,
      name        TEXT NOT NULL,
      ts          INTEGER NOT NULL,
      call_index  INTEGER DEFAULT 0
    );

    CREATE INDEX idx_records_ts         ON records(ts DESC);
    CREATE INDEX idx_records_ingested   ON records(ingested_at DESC);
    CREATE INDEX idx_records_updated    ON records(updated_at DESC);
    CREATE INDEX idx_records_tool       ON records(tool);
    CREATE INDEX idx_records_model      ON records(model);
    CREATE INDEX idx_records_session    ON records(session_id);
    CREATE INDEX idx_records_source     ON records(source_file);
    CREATE INDEX idx_records_cost_source ON records(cost_source);
    CREATE INDEX idx_synced_records_ts      ON synced_records(ts DESC);
    CREATE INDEX idx_synced_records_tool    ON synced_records(tool);
    CREATE INDEX idx_synced_records_model   ON synced_records(model);
    CREATE INDEX idx_synced_records_session ON synced_records(session_key);
    CREATE INDEX idx_synced_records_device  ON synced_records(device);
    CREATE INDEX idx_synced_records_updated ON synced_records(updated_at DESC);
    CREATE INDEX idx_sync_tombstones_deleted_at ON sync_tombstones(deleted_at DESC);
    CREATE INDEX idx_tombstones_device_scope ON sync_tombstones(device_scope);
    CREATE INDEX idx_tc_record_id       ON tool_calls(record_id);
    CREATE INDEX idx_tc_name            ON tool_calls(name);
    CREATE INDEX idx_tc_ts              ON tool_calls(ts DESC);
  `)
}
