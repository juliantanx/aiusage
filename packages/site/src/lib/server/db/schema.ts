import { sql } from './pool.js'

export async function runMigrations(): Promise<void> {
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TIMESTAMPTZ DEFAULT NOW()
  )`

  const applied = await sql`SELECT version FROM schema_migrations ORDER BY version`
  const appliedVersions = new Set(applied.map((r: { version: number }) => r.version))

  for (const migration of migrations) {
    if (!appliedVersions.has(migration.version)) {
      console.log(`Applying migration v${migration.version}: ${migration.name}`)
      await sql.begin(async (tx) => {
        await migration.up(tx)
        await tx`INSERT INTO schema_migrations (version) VALUES (${migration.version})`
      })
    }
  }
}

const migrations = [
  {
    version: 1,
    name: 'initial_schema',
    up: async (tx: ReturnType<typeof sql>) => {
      await tx`DO $$ BEGIN CREATE TYPE user_role AS ENUM ('user', 'admin'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`
      await tx`DO $$ BEGIN CREATE TYPE user_status AS ENUM ('active', 'banned', 'deleted'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`
      await tx`DO $$ BEGIN CREATE TYPE period_type AS ENUM ('daily', 'weekly', 'monthly', 'yearly', 'all_time'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`
      await tx`DO $$ BEGIN CREATE TYPE device_status AS ENUM ('active', 'revoked'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`
      await tx`DO $$ BEGIN CREATE TYPE upload_status AS ENUM ('accepted', 'rejected', 'flagged'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`
      await tx`DO $$ BEGIN CREATE TYPE snapshot_review_status AS ENUM ('pending', 'approved', 'rejected', 'hidden'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`
      await tx`DO $$ BEGIN CREATE TYPE leaderboard_visibility AS ENUM ('public', 'hidden', 'flagged'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`

      await tx`CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        email_verified BOOLEAN DEFAULT FALSE,
        password_hash TEXT,
        display_name TEXT NOT NULL,
        avatar_url TEXT,
        leaderboard_visibility TEXT DEFAULT 'public',
        role user_role DEFAULT 'user',
        status user_status DEFAULT 'active',
        timezone TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        banned_at TIMESTAMPTZ,
        ban_reason TEXT
      )`

      await tx`CREATE TABLE IF NOT EXISTS user_identities (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        provider_user_id TEXT NOT NULL,
        provider_username TEXT,
        email TEXT,
        email_verified BOOLEAN DEFAULT FALSE,
        raw_profile JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(provider, provider_user_id)
      )`

      await tx`CREATE TABLE IF NOT EXISTS user_devices (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        secret_encrypted TEXT NOT NULL,
        secret_hash TEXT NOT NULL,
        status device_status DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        last_used_at TIMESTAMPTZ,
        revoked_at TIMESTAMPTZ
      )`

      await tx`CREATE TABLE IF NOT EXISTS sessions (
        sid TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        data JSONB DEFAULT '{}',
        expires_at TIMESTAMPTZ NOT NULL
      )`

      await tx`CREATE TABLE IF NOT EXISTS device_auth_requests (
        id TEXT PRIMARY KEY,
        device_challenge TEXT NOT NULL,
        user_code TEXT NOT NULL,
        verification_url TEXT NOT NULL,
        device_name TEXT NOT NULL,
        cli_version TEXT NOT NULL,
        user_id TEXT REFERENCES users(id),
        status TEXT DEFAULT 'pending',
        device_verifier TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL,
        approved_at TIMESTAMPTZ
      )`

      await tx`CREATE TABLE IF NOT EXISTS upload_nonces (
        device_id TEXT NOT NULL,
        nonce TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY(device_id, nonce)
      )`

      await tx`CREATE TABLE IF NOT EXISTS upload_requests (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        device_id TEXT NOT NULL REFERENCES user_devices(id),
        idempotency_key TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        status upload_status NOT NULL,
        result_summary JSONB,
        rejection_reason TEXT,
        client_version TEXT NOT NULL,
        client_platform TEXT NOT NULL,
        schema_version INTEGER NOT NULL,
        ip_hash TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(device_id, idempotency_key)
      )`

      await tx`CREATE TABLE IF NOT EXISTS upload_snapshots (
        id TEXT PRIMARY KEY,
        upload_request_id TEXT NOT NULL REFERENCES upload_requests(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id),
        device_id TEXT NOT NULL REFERENCES user_devices(id),
        period_type period_type NOT NULL,
        period_start TIMESTAMPTZ NOT NULL,
        period_end TIMESTAMPTZ NOT NULL,
        total_tokens BIGINT NOT NULL,
        token_snapshot_hash TEXT NOT NULL,
        status upload_status NOT NULL,
        reason_code TEXT,
        reason_message TEXT,
        review_status snapshot_review_status,
        reviewed_by TEXT REFERENCES users(id),
        reviewed_at TIMESTAMPTZ,
        review_note TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(upload_request_id, period_type, period_start)
      )`

      await tx`CREATE TABLE IF NOT EXISTS admin_audit_logs (
        id TEXT PRIMARY KEY,
        admin_user_id TEXT NOT NULL REFERENCES users(id),
        action TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        reason TEXT,
        metadata JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`

      // Indexes
      await tx`CREATE INDEX IF NOT EXISTS idx_upload_requests_device_key ON upload_requests(device_id, idempotency_key)`
      await tx`CREATE INDEX IF NOT EXISTS idx_upload_snapshots_req ON upload_snapshots(upload_request_id, period_type, period_start)`
      await tx`CREATE INDEX IF NOT EXISTS idx_upload_snapshots_user ON upload_snapshots(user_id, period_type, period_start)`
      await tx`CREATE INDEX IF NOT EXISTS idx_upload_snapshots_status ON upload_snapshots(status, created_at)`
      await tx`CREATE INDEX IF NOT EXISTS idx_upload_requests_created ON upload_requests(created_at)`
      await tx`CREATE INDEX IF NOT EXISTS idx_upload_nonces_created ON upload_nonces(created_at)`
      await tx`CREATE INDEX IF NOT EXISTS idx_user_devices_user ON user_devices(user_id, status)`
      await tx`CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)`
      await tx`CREATE INDEX IF NOT EXISTS idx_user_identities_user ON user_identities(user_id)`
      await tx`CREATE INDEX IF NOT EXISTS idx_device_auth_requests_user_code ON device_auth_requests(user_code)`
    }
  },
  {
    version: 2,
    name: 'username_change_tracking',
    up: async (tx: ReturnType<typeof sql>) => {
      await tx`ALTER TABLE users ADD COLUMN IF NOT EXISTS username_changed_at TIMESTAMPTZ`

      await tx`CREATE TABLE IF NOT EXISTS reserved_usernames (
        username TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reserved_until TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`

      await tx`CREATE INDEX IF NOT EXISTS idx_reserved_usernames_until ON reserved_usernames(reserved_until)`
    }
  },
  {
    version: 3,
    name: 'leaderboard_metrics',
    up: async (tx: ReturnType<typeof sql>) => {
      await tx`DELETE FROM upload_snapshots`
      await tx`DELETE FROM upload_requests`
      await tx`DROP TABLE IF EXISTS leaderboard_entries`
      await tx`ALTER TABLE upload_snapshots DROP COLUMN IF EXISTS leaderboard_entry_id`

      await tx`CREATE TABLE IF NOT EXISTS leaderboard_metrics (
        id TEXT PRIMARY KEY,
        upload_request_id TEXT NOT NULL REFERENCES upload_requests(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        device_id TEXT NOT NULL REFERENCES user_devices(id) ON DELETE CASCADE,
        period_type period_type NOT NULL,
        period_start TIMESTAMPTZ NOT NULL,
        period_end TIMESTAMPTZ NOT NULL,
        scope_type TEXT NOT NULL CHECK (scope_type IN ('all', 'tool', 'model', 'tool_model')),
        tool TEXT,
        model TEXT,
        input_tokens BIGINT NOT NULL,
        output_tokens BIGINT NOT NULL,
        cache_read_tokens BIGINT NOT NULL,
        cache_write_tokens BIGINT NOT NULL,
        thinking_tokens BIGINT NOT NULL,
        total_tokens BIGINT NOT NULL,
        total_cost_usd NUMERIC(20, 8) NOT NULL,
        visibility leaderboard_visibility DEFAULT 'public',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )`

      await tx`CREATE UNIQUE INDEX IF NOT EXISTS idx_leaderboard_metrics_unique
        ON leaderboard_metrics(user_id, period_type, period_start, scope_type, COALESCE(tool, ''), COALESCE(model, ''))`

      await tx`CREATE INDEX IF NOT EXISTS idx_leaderboard_metrics_rank_tokens
        ON leaderboard_metrics(period_type, period_start, scope_type, visibility, total_tokens DESC, updated_at ASC, user_id ASC)`
      await tx`CREATE INDEX IF NOT EXISTS idx_leaderboard_metrics_rank_cost
        ON leaderboard_metrics(period_type, period_start, scope_type, visibility, total_cost_usd DESC, updated_at ASC, user_id ASC)`
      await tx`CREATE INDEX IF NOT EXISTS idx_leaderboard_metrics_filters
        ON leaderboard_metrics(period_type, period_start, scope_type, tool, model, visibility)`
      await tx`CREATE INDEX IF NOT EXISTS idx_leaderboard_metrics_user
        ON leaderboard_metrics(user_id, period_type, period_start, scope_type)`
    }
  }
]
