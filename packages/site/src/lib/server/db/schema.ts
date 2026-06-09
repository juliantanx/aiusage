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
      await tx`DROP TABLE IF EXISTS leaderboard_entries`
      await tx`DELETE FROM upload_snapshots`
      await tx`DELETE FROM upload_requests`
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
  },
  {
    version: 4,
    name: 'pricing_version_and_anonymous',
    up: async (tx: ReturnType<typeof sql>) => {
      // Add pricing_version to leaderboard_metrics so cost calculations are traceable
      await tx`ALTER TABLE leaderboard_metrics ADD COLUMN IF NOT EXISTS pricing_version TEXT`
      // Add has_unknown_cost flag: true when model is not in official price table
      await tx`ALTER TABLE leaderboard_metrics ADD COLUMN IF NOT EXISTS has_unknown_cost BOOLEAN DEFAULT FALSE`

      // Add anonymous leaderboard support to users
      await tx`ALTER TABLE users ADD COLUMN IF NOT EXISTS leaderboard_anonymous BOOLEAN DEFAULT FALSE`

      // Official price tables for versioned pricing
      await tx`DO $$ BEGIN CREATE TYPE price_table_status AS ENUM ('draft', 'published', 'archived'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`

      await tx`CREATE TABLE IF NOT EXISTS official_price_tables (
        id TEXT PRIMARY KEY,
        version TEXT NOT NULL UNIQUE,
        status price_table_status NOT NULL DEFAULT 'draft',
        source TEXT NOT NULL DEFAULT 'core_pricing',
        source_commit TEXT,
        notes TEXT,
        created_by TEXT REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        published_by TEXT REFERENCES users(id),
        published_at TIMESTAMPTZ,
        archived_at TIMESTAMPTZ
      )`

      await tx`CREATE TABLE IF NOT EXISTS official_price_entries (
        id TEXT PRIMARY KEY,
        table_id TEXT NOT NULL REFERENCES official_price_tables(id) ON DELETE CASCADE,
        model_key TEXT NOT NULL,
        input NUMERIC(20, 8) NOT NULL,
        output NUMERIC(20, 8) NOT NULL,
        cache_read NUMERIC(20, 8),
        cache_write NUMERIC(20, 8),
        currency TEXT NOT NULL DEFAULT 'USD',
        source_url TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(table_id, model_key)
      )`

      await tx`CREATE INDEX IF NOT EXISTS idx_price_tables_status ON official_price_tables(status)`
      await tx`CREATE INDEX IF NOT EXISTS idx_price_entries_table ON official_price_entries(table_id)`
    }
  },
  {
    version: 5,
    name: 'cloud_sync',
    up: async (tx: ReturnType<typeof sql>) => {
      // cloud_device_instances: binds a CLI device to a local deviceInstanceId for cloud sync
      await tx`CREATE TABLE IF NOT EXISTS cloud_device_instances (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        device_id TEXT NOT NULL REFERENCES user_devices(id) ON DELETE CASCADE,
        device_instance_id TEXT NOT NULL,
        sync_generation BIGINT NOT NULL DEFAULT 1,
        last_push_cursor TEXT,
        last_pull_cursor TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, device_instance_id),
        UNIQUE(device_id)
      )`

      // cloud_usage_records: private detail records synced from CLI devices
      await tx`CREATE TABLE IF NOT EXISTS cloud_usage_records (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        device_id TEXT NOT NULL REFERENCES user_devices(id),
        device_instance_id TEXT NOT NULL,
        sync_generation BIGINT NOT NULL DEFAULT 1,
        record_id TEXT NOT NULL,
        ts BIGINT NOT NULL,
        tool TEXT NOT NULL,
        model TEXT NOT NULL,
        provider TEXT NOT NULL DEFAULT '',
        input_tokens BIGINT NOT NULL DEFAULT 0,
        output_tokens BIGINT NOT NULL DEFAULT 0,
        cache_read_tokens BIGINT NOT NULL DEFAULT 0,
        cache_write_tokens BIGINT NOT NULL DEFAULT 0,
        thinking_tokens BIGINT NOT NULL DEFAULT 0,
        cost NUMERIC(20, 8),
        cost_source TEXT,
        session_key TEXT NOT NULL DEFAULT '',
        source_file TEXT NOT NULL DEFAULT '',
        cwd TEXT NOT NULL DEFAULT '',
        device_name TEXT,
        platform TEXT,
        updated_at BIGINT NOT NULL,
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        server_updated_at TIMESTAMPTZ DEFAULT NOW(),
        change_seq BIGSERIAL,
        UNIQUE(user_id, sync_generation, device_instance_id, record_id)
      )`

      // cloud_sync_batches: push/pull batch tracking for idempotency and diagnostics
      await tx`CREATE TABLE IF NOT EXISTS cloud_sync_batches (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        device_id TEXT NOT NULL REFERENCES user_devices(id),
        idempotency_key TEXT NOT NULL,
        direction TEXT NOT NULL CHECK (direction IN ('push', 'pull')),
        record_count INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('accepted', 'rejected', 'failed')),
        error_code TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(device_id, idempotency_key)
      )`

      // cloud_sync_state: per-device sync watermark
      await tx`CREATE TABLE IF NOT EXISTS cloud_sync_state (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        device_id TEXT NOT NULL REFERENCES user_devices(id) ON DELETE CASCADE,
        last_push_at TIMESTAMPTZ,
        last_pull_at TIMESTAMPTZ,
        last_server_cursor TEXT,
        last_error_code TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (user_id, device_id)
      )`

      // cloud_sync_resets: tracks cloud data clears to prevent stale device uploads
      await tx`CREATE TABLE IF NOT EXISTS cloud_sync_resets (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        sync_generation BIGINT NOT NULL DEFAULT 1,
        clear_before_change_seq BIGINT,
        reset_at TIMESTAMPTZ DEFAULT NOW(),
        reset_by_device_id TEXT
      )`

      // Indexes for cloud_usage_records
      await tx`CREATE INDEX IF NOT EXISTS idx_cloud_usage_user_ts ON cloud_usage_records(user_id, ts DESC)`
      await tx`CREATE INDEX IF NOT EXISTS idx_cloud_usage_user_tool_ts ON cloud_usage_records(user_id, tool, ts DESC)`
      await tx`CREATE INDEX IF NOT EXISTS idx_cloud_usage_user_model_ts ON cloud_usage_records(user_id, model, ts DESC)`
      await tx`CREATE INDEX IF NOT EXISTS idx_cloud_usage_device ON cloud_usage_records(user_id, sync_generation, device_instance_id)`
      await tx`CREATE INDEX IF NOT EXISTS idx_cloud_usage_change_seq ON cloud_usage_records(user_id, change_seq)`
      await tx`CREATE INDEX IF NOT EXISTS idx_cloud_usage_deleted ON cloud_usage_records(user_id, deleted_at) WHERE deleted_at IS NOT NULL`

      // Indexes for cloud_sync_batches
      await tx`CREATE INDEX IF NOT EXISTS idx_cloud_sync_batches_user ON cloud_sync_batches(user_id, created_at DESC)`

      // Indexes for cloud_device_instances
      await tx`CREATE INDEX IF NOT EXISTS idx_cloud_device_instances_user ON cloud_device_instances(user_id)`
    }
  },
  {
    version: 6,
    name: 'user_settings_tables',
    up: async (tx: ReturnType<typeof sql>) => {
      // user_sync_settings: per-user sync preferences (§9.1)
      await tx`CREATE TABLE IF NOT EXISTS user_sync_settings (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        cloud_sync_enabled BOOLEAN DEFAULT FALSE,
        default_sync_backend TEXT DEFAULT 'cloud',
        retention_days INTEGER,
        aggregate_retention_policy TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )`

      // user_leaderboard_settings: per-user leaderboard preferences (§9.2)
      // Note: leaderboard_visibility and leaderboard_anonymous already exist on users table.
      // This table stores extended settings for future use.
      await tx`CREATE TABLE IF NOT EXISTS user_leaderboard_settings (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        auto_upload_enabled BOOLEAN DEFAULT FALSE,
        upload_period_types TEXT[] DEFAULT ARRAY['daily', 'weekly', 'monthly', 'yearly', 'all_time']::TEXT[],
        last_auto_upload_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )`
    }
  },
  {
    version: 7,
    name: 'email_verification_tokens',
    up: async (tx: ReturnType<typeof sql>) => {
      await tx`CREATE TABLE IF NOT EXISTS email_verification_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        consumed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`

      await tx`CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user ON email_verification_tokens(user_id, consumed_at)`
      await tx`CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_expires ON email_verification_tokens(expires_at)`

      // Existing password users predate this flow, so keep them able to sign in.
      await tx`UPDATE users SET email_verified = TRUE WHERE password_hash IS NOT NULL AND email_verified = FALSE`
    }
  },
  {
    version: 8,
    name: 'email_send_attempts',
    up: async (tx: ReturnType<typeof sql>) => {
      await tx`CREATE TABLE IF NOT EXISTS email_send_attempts (
        id TEXT PRIMARY KEY,
        purpose TEXT NOT NULL,
        ip_hash TEXT NOT NULL,
        email_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`

      await tx`CREATE INDEX IF NOT EXISTS idx_email_send_attempts_ip ON email_send_attempts(purpose, ip_hash, created_at DESC)`
      await tx`CREATE INDEX IF NOT EXISTS idx_email_send_attempts_email ON email_send_attempts(purpose, email_hash, created_at DESC)`
      await tx`CREATE INDEX IF NOT EXISTS idx_email_send_attempts_created ON email_send_attempts(created_at)`
    }
  },
  {
    version: 9,
    name: 'site_config',
    up: async (tx: ReturnType<typeof sql>) => {
      await tx`CREATE TABLE IF NOT EXISTS site_config (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        description TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        updated_by TEXT REFERENCES users(id)
      )`
    }
  },
  {
    version: 11,
    name: 'password_reset_tokens',
    up: async (tx: ReturnType<typeof sql>) => {
      await tx`CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        consumed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`

      await tx`CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens(user_id, consumed_at)`
      await tx`CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires ON password_reset_tokens(expires_at)`
    }
  },
  {
    version: 12,
    name: 'cloud_sync_star_gating',
    up: async (tx: ReturnType<typeof sql>) => {
      // Store GitHub OAuth access token for star verification
      await tx`ALTER TABLE user_identities ADD COLUMN IF NOT EXISTS access_token TEXT`

      // Admin override: allow user to use Cloud Sync regardless of star status
      await tx`ALTER TABLE users ADD COLUMN IF NOT EXISTS cloud_sync_enabled BOOLEAN DEFAULT FALSE`
      // Cached GitHub star check result
      await tx`ALTER TABLE users ADD COLUMN IF NOT EXISTS github_starred BOOLEAN DEFAULT FALSE`
      // When the star check was last performed
      await tx`ALTER TABLE users ADD COLUMN IF NOT EXISTS github_star_checked_at TIMESTAMPTZ`
    }
  },
  {
    version: 13,
    name: 'reverse_cloud_sync_enabled_semantics',
    up: async (tx: ReturnType<typeof sql>) => {
      // cloud_sync_enabled semantics reversed: true now means "banned from cloud"
      // Reset all existing true values to false (previously meant "admin override allow")
      await tx`UPDATE users SET cloud_sync_enabled = FALSE WHERE cloud_sync_enabled = TRUE`
    }
  },
  {
    version: 14,
    name: 'current_model_price_registry',
    up: async (tx: ReturnType<typeof sql>) => {
      await tx`CREATE TABLE IF NOT EXISTS model_prices (
        model_key TEXT PRIMARY KEY,
        provider TEXT NOT NULL DEFAULT '',
        input NUMERIC(20, 8) NOT NULL,
        output NUMERIC(20, 8) NOT NULL,
        cache_read NUMERIC(20, 8),
        cache_write NUMERIC(20, 8),
        currency TEXT NOT NULL DEFAULT 'USD',
        source TEXT NOT NULL DEFAULT 'manual',
        source_model_id TEXT,
        source_url TEXT,
        origin TEXT NOT NULL DEFAULT 'user',
        status TEXT NOT NULL DEFAULT 'active',
        last_synced_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )`

      await tx`CREATE TABLE IF NOT EXISTS model_price_aliases (
        alias TEXT PRIMARY KEY,
        model_key TEXT NOT NULL REFERENCES model_prices(model_key) ON DELETE CASCADE,
        match_type TEXT NOT NULL DEFAULT 'exact',
        provider TEXT NOT NULL DEFAULT '',
        priority INTEGER NOT NULL DEFAULT 100,
        source TEXT NOT NULL DEFAULT 'manual',
        origin TEXT NOT NULL DEFAULT 'user',
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )`

      await tx`CREATE INDEX IF NOT EXISTS idx_model_prices_origin ON model_prices(origin)`
      await tx`CREATE INDEX IF NOT EXISTS idx_model_prices_source ON model_prices(source)`
      await tx`CREATE INDEX IF NOT EXISTS idx_model_price_aliases_model ON model_price_aliases(model_key)`
    }
  }
]
