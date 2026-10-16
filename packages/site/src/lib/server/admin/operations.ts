import { sql } from '../db/pool.js'
import { nanoid } from 'nanoid'
import { invalidateLeaderboardCache } from '../leaderboard/query.js'
import { ensureCuratedPricingAliases } from '../pricing/curated-aliases.js'
import { planLitellmPricing, type LitellmEntry } from '@aiusage/core'

export async function banUser(adminUserId: string, targetUserId: string, reason: string): Promise<void> {
  await sql`UPDATE users SET status = 'banned', banned_at = NOW(), ban_reason = ${reason}, updated_at = NOW() WHERE id = ${targetUserId}`
  await logAdminAction(adminUserId, 'ban_user', 'users', targetUserId, reason)
  invalidateLeaderboardCache()
}

export async function unbanUser(adminUserId: string, targetUserId: string): Promise<void> {
  await sql`UPDATE users SET status = 'active', banned_at = NULL, ban_reason = NULL, updated_at = NOW() WHERE id = ${targetUserId}`
  await logAdminAction(adminUserId, 'unban_user', 'users', targetUserId, 'User unbanned')
  invalidateLeaderboardCache()
}

export interface SnapshotModerationResult {
  /** leaderboard_metrics rows the action changed. 0 means the boards are unchanged. */
  metricsUpdated: number
  /** approve only: rows of the period that are still not public afterwards, because the approval does not cover them. */
  metricsHeld?: number
}

type SnapshotReviewStatus = 'approved' | 'rejected' | 'hidden'
type Sql = typeof sql

// pool.ts types `sql` as the query function alone; `begin` is forwarded to the
// postgres.js client at run time.
function transaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T> {
  return (sql as unknown as { begin(fn: (tx: Sql) => Promise<T>): Promise<T> }).begin(fn)
}

// Marks the snapshot reviewed and applies `apply` to the leaderboard in one
// transaction, holding the snapshot owner's leaderboard lock. processUpload
// takes the same lock (uploads/verify.ts), so an upload of that user either
// committed before the action reads anything or starts after it committed.
async function moderateSnapshot<T>(
  adminUserId: string,
  snapshotId: string,
  reviewStatus: SnapshotReviewStatus,
  note: string | undefined,
  apply: (tx: Sql) => Promise<T>
): Promise<T> {
  return transaction(async (tx) => {
    const locked = await tx`
      SELECT pg_advisory_xact_lock(hashtextextended('leaderboard_metrics:' || user_id, 0))
      FROM upload_snapshots WHERE id = ${snapshotId}
    `
    if (locked.length === 0) throw new Error('Snapshot not found')

    await tx`
      UPDATE upload_snapshots
      SET review_status = ${reviewStatus}::snapshot_review_status, reviewed_by = ${adminUserId}, reviewed_at = NOW(), review_note = ${note || null}
      WHERE id = ${snapshotId}
    `
    return apply(tx)
  })
}

// Hides every metric row of the snapshot's user and period. The rows are
// matched on (user, period_type, period_start), not on the snapshot's
// upload_request_id: each later upload of the period re-points the rows it
// contains at its own request, so a request id only matches until the next
// upload.
async function hideSnapshotPeriod(tx: Sql, snapshotId: string): Promise<SnapshotModerationResult> {
  const rows = await tx`
    UPDATE leaderboard_metrics lm
    SET visibility = 'hidden', updated_at = NOW()
    FROM upload_snapshots s
    WHERE s.id = ${snapshotId}
      AND lm.user_id = s.user_id
      AND lm.period_type = s.period_type
      AND lm.period_start = s.period_start
    RETURNING lm.id
  `
  return { metricsUpdated: rows.length }
}

// Publishes the metric rows of the snapshot's user and period that an approval
// covers. A row carries the request of the upload that last wrote it, which
// need not be this snapshot's: a later upload re-points the rows it contains,
// and leaves alone the rows of tools and models it does not mention. A row is
// published when it was written by this snapshot's upload, or by an upload of
// the period that was accepted (and not hidden or rejected since) or has been
// approved. A row written by another flagged upload that is not approved stays
// as it is, and so does a row whose upload history has been pruned
// (upload_request_id IS NULL).
//
// An approval decides about this snapshot only. It publishes nothing while
// another snapshot of the period stands hidden or rejected (a hide covers the
// whole period, so lifting it takes an approval of that snapshot), and it
// leaves alone a row an admin hid on its own (entry_hidden), which only
// restoreLeaderboardEntry publishes again.
async function publishSnapshotPeriod(tx: Sql, snapshotId: string): Promise<SnapshotModerationResult> {
  const published = await tx`
    UPDATE leaderboard_metrics lm
    SET visibility = 'public', updated_at = NOW()
    FROM upload_snapshots s
    WHERE s.id = ${snapshotId}
      AND lm.user_id = s.user_id
      AND lm.period_type = s.period_type
      AND lm.period_start = s.period_start
      AND NOT lm.entry_hidden
      AND NOT EXISTS (
        SELECT 1 FROM upload_snapshots hold
        WHERE hold.user_id = s.user_id
          AND hold.period_type = s.period_type
          AND hold.period_start = s.period_start
          AND hold.review_status IN ('hidden', 'rejected')
      )
      AND (
        lm.upload_request_id = s.upload_request_id
        OR EXISTS (
          SELECT 1 FROM upload_snapshots src
          WHERE src.upload_request_id = lm.upload_request_id
            AND src.user_id = s.user_id
            AND src.period_type = s.period_type
            AND src.period_start = s.period_start
            AND (
              src.review_status = 'approved'
              OR (src.status <> 'flagged' AND src.review_status IS NULL)
            )
        )
      )
    RETURNING lm.id
  `
  const held = await tx`
    SELECT COUNT(*)::INTEGER AS count
    FROM leaderboard_metrics lm
    JOIN upload_snapshots s ON s.id = ${snapshotId}
    WHERE lm.user_id = s.user_id
      AND lm.period_type = s.period_type
      AND lm.period_start = s.period_start
      AND lm.visibility <> 'public'
  `
  return { metricsUpdated: published.length, metricsHeld: (held[0] as { count: number }).count }
}

export async function approveSnapshot(adminUserId: string, snapshotId: string, note?: string): Promise<SnapshotModerationResult> {
  const result = await moderateSnapshot(adminUserId, snapshotId, 'approved', note, (tx) => publishSnapshotPeriod(tx, snapshotId))
  await logAdminAction(adminUserId, 'approve_snapshot', 'upload_snapshots', snapshotId, note || 'Snapshot approved', moderationMetadata(result))
  invalidateLeaderboardCache()
  return result
}

export async function rejectSnapshot(adminUserId: string, snapshotId: string, note?: string): Promise<SnapshotModerationResult> {
  // Cascade: hide all derived leaderboard_metrics for this snapshot's period
  const result = await moderateSnapshot(adminUserId, snapshotId, 'rejected', note, (tx) => hideSnapshotPeriod(tx, snapshotId))
  await logAdminAction(adminUserId, 'reject_snapshot', 'upload_snapshots', snapshotId, note || 'Snapshot rejected', moderationMetadata(result))
  invalidateLeaderboardCache()
  return result
}

export async function hideSnapshot(adminUserId: string, snapshotId: string, note?: string): Promise<SnapshotModerationResult> {
  const result = await moderateSnapshot(adminUserId, snapshotId, 'hidden', note, (tx) => hideSnapshotPeriod(tx, snapshotId))
  await logAdminAction(adminUserId, 'hide_snapshot', 'upload_snapshots', snapshotId, note || 'Snapshot hidden', moderationMetadata(result))
  invalidateLeaderboardCache()
  return result
}

function moderationMetadata(result: SnapshotModerationResult): Record<string, unknown> {
  return {
    metrics_updated: result.metricsUpdated,
    ...(result.metricsHeld ? { metrics_held: result.metricsHeld } : {}),
  }
}

// A row hidden on its own stays hidden through snapshot approvals and later
// uploads of its period, until restoreLeaderboardEntry.
export async function hideLeaderboardEntry(adminUserId: string, entryId: string): Promise<void> {
  await sql`UPDATE leaderboard_metrics SET visibility = 'hidden', entry_hidden = TRUE, updated_at = NOW() WHERE id = ${entryId}`
  await logAdminAction(adminUserId, 'hide_metric', 'leaderboard_metrics', entryId, 'Metric hidden')
  invalidateLeaderboardCache()
}

export async function restoreLeaderboardEntry(adminUserId: string, entryId: string): Promise<void> {
  // Check user status and leaderboard_visibility before restoring
  const metrics = await sql`
    SELECT lm.user_id, u.status, u.leaderboard_visibility
    FROM leaderboard_metrics lm
    JOIN users u ON u.id = lm.user_id
    WHERE lm.id = ${entryId}
  `
  const metric = metrics[0] as { user_id: string; status: string; leaderboard_visibility: string } | undefined
  if (!metric) throw new Error('Metric not found')
  if (metric.status !== 'active') throw new Error('Cannot restore: user is not active')
  if (metric.leaderboard_visibility !== 'public') throw new Error('Cannot restore: user leaderboard visibility is not public')

  await sql`UPDATE leaderboard_metrics SET visibility = 'public', entry_hidden = FALSE, updated_at = NOW() WHERE id = ${entryId}`
  await logAdminAction(adminUserId, 'restore_metric', 'leaderboard_metrics', entryId, 'Metric restored')
  invalidateLeaderboardCache()
}

export async function setCloudSync(adminUserId: string, targetUserId: string, enabled: boolean): Promise<void> {
  await sql`UPDATE users SET cloud_sync_enabled = ${enabled}, updated_at = NOW() WHERE id = ${targetUserId}`
  await logAdminAction(adminUserId, 'set_cloud_sync', 'users', targetUserId, enabled ? 'Cloud sync disabled for user' : 'Cloud sync re-enabled for user')
}

export async function setUserRole(adminUserId: string, targetUserId: string, role: string): Promise<void> {
  await sql`UPDATE users SET role = ${role}::user_role WHERE id = ${targetUserId}`
  await logAdminAction(adminUserId, 'set_role', 'users', targetUserId, `Role set to ${role}`)
  invalidateLeaderboardCache()
}

export async function getFlaggedSnapshots(limit = 50, offset = 0) {
  return sql`
    SELECT s.*, u.display_name, u.username, d.name as device_name,
      NULL::bigint as prev_total_tokens
    FROM upload_snapshots s
    JOIN users u ON u.id = s.user_id
    JOIN user_devices d ON d.id = s.device_id
    WHERE s.status = 'flagged'
      AND s.review_status IS NULL
    ORDER BY s.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `
}

export async function getAdminAuditLogs(limit = 50, offset = 0) {
  return sql`
    SELECT al.*, u.display_name as admin_display_name
    FROM admin_audit_logs al
    JOIN users u ON u.id = al.admin_user_id
    ORDER BY al.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `
}

export async function clearAdminAuditLogs(adminUserId: string): Promise<number> {
  const result = await sql`DELETE FROM admin_audit_logs RETURNING id`
  await logAdminAction(adminUserId, 'clear_audit_logs', 'admin_audit_logs', '-', `Cleared ${result.length} logs`)
  return result.length
}

async function logAdminAction(adminUserId: string, action: string, targetType: string, targetId: string, reason: string, metadata?: Record<string, unknown>): Promise<void> {
  await sql`
    INSERT INTO admin_audit_logs (id, admin_user_id, action, target_type, target_id, reason, metadata)
    VALUES (${nanoid()}, ${adminUserId}, ${action}, ${targetType}, ${targetId}, ${reason}, ${metadata ? JSON.stringify(metadata) : null}::jsonb)
  `
}

// --- Pricing Management ---

const LITELLM_PRICING_URL = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json'

/**
 * Sync builtin entries from LiteLLM. User-origin rows are preserved.
 *
 * Several LiteLLM ids reduce to one model key (`aihubmix/claude-haiku-4-5`,
 * `vertex_ai/claude-haiku-4-5` and `claude-haiku-4-5`); `planLitellmPricing`
 * (@aiusage/core, shared with the CLI's price sync) gives each key one owner,
 * so the stored price does not depend on the order of the file and is the
 * one the CLI stores. The other ids stay aliases of the key.
 */
export async function syncPricingFromLitellm(adminUserId: string): Promise<{ added: number; updated: number; skipped: number; userPreserved: number; aliasesAdded: number; aliasesUpdated: number }> {
  const response = await fetch(LITELLM_PRICING_URL, { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`LiteLLM pricing fetch failed: HTTP ${response.status}`)
  const data = await response.json() as Record<string, LitellmEntry>
  const plan = planLitellmPricing(data)
  let added = 0, updated = 0, userPreserved = 0, aliasesAdded = 0, aliasesUpdated = 0
  const skipped = plan.skipped

  await sql.begin(async (tx) => {
    for (const owner of plan.prices) {
      const entry = {
        modelKey: owner.modelKey,
        provider: owner.provider,
        input: owner.price.input,
        output: owner.price.output,
        cacheRead: owner.price.cacheRead ?? null,
        cacheWrite: owner.price.cacheWrite ?? null,
      }
      const sourceModelId = owner.sourceModelId
      const existing = await tx`SELECT origin, input, output, cache_read, cache_write, currency FROM model_prices WHERE model_key = ${entry.modelKey}`
      const row = existing[0] as { origin: string; input: string; output: string; cache_read: string | null; cache_write: string | null; currency: string } | undefined
      if (row?.origin === 'user') {
        userPreserved++
      } else if (!row) {
        await tx`
          INSERT INTO model_prices (model_key, provider, input, output, cache_read, cache_write, currency, source, source_model_id, source_url, origin, status, last_synced_at)
          VALUES (${entry.modelKey}, ${entry.provider}, ${entry.input}, ${entry.output}, ${entry.cacheRead}, ${entry.cacheWrite}, 'USD', 'litellm', ${sourceModelId}, ${LITELLM_PRICING_URL}, 'builtin', 'active', NOW())
        `
        added++
      } else {
        const changed = Number(row.input) !== entry.input || Number(row.output) !== entry.output ||
          (row.cache_read == null ? null : Number(row.cache_read)) !== entry.cacheRead ||
          (row.cache_write == null ? null : Number(row.cache_write)) !== entry.cacheWrite || row.currency !== 'USD'
        await tx`
          UPDATE model_prices
          SET provider = ${entry.provider}, input = ${entry.input}, output = ${entry.output}, cache_read = ${entry.cacheRead}, cache_write = ${entry.cacheWrite},
              currency = 'USD', source = 'litellm', source_model_id = ${sourceModelId}, source_url = ${LITELLM_PRICING_URL},
              origin = 'builtin', status = 'active', last_synced_at = NOW(), updated_at = NOW()
          WHERE model_key = ${entry.modelKey} AND origin = 'builtin'
        `
        if (changed) updated++
      }
    }

    for (const planned of plan.aliases) {
      // A dated Claude shortcut must not sit on a name that has a price of
      // its own the file does not list (a curated price, or a row an earlier
      // sync left): it points at that row instead.
      let target = { modelKey: planned.modelKey, provider: planned.provider }
      if (planned.datedShortcut) {
        const own = await tx`SELECT provider FROM model_prices WHERE model_key = ${planned.alias} AND status = 'active'` as Array<{ provider: string }>
        if (own[0]) target = { modelKey: planned.alias, provider: own[0].provider }
      }
      const alias = planned.alias
      const before = await tx`SELECT model_key, origin, enabled FROM model_price_aliases WHERE alias = ${alias}` as Array<{ model_key: string; origin: string; enabled: boolean }>
      await tx`
        INSERT INTO model_price_aliases (alias, model_key, match_type, provider, priority, source, origin, enabled)
        VALUES (${alias}, ${target.modelKey}, 'exact', ${target.provider}, 100, 'litellm', 'builtin', TRUE)
        ON CONFLICT (alias) DO UPDATE SET
          model_key = CASE WHEN model_price_aliases.origin = 'builtin' THEN EXCLUDED.model_key ELSE model_price_aliases.model_key END,
          provider = CASE WHEN model_price_aliases.origin = 'builtin' THEN EXCLUDED.provider ELSE model_price_aliases.provider END,
          source = CASE WHEN model_price_aliases.origin = 'builtin' THEN EXCLUDED.source ELSE model_price_aliases.source END,
          enabled = CASE WHEN model_price_aliases.origin = 'builtin' THEN TRUE ELSE model_price_aliases.enabled END,
          updated_at = NOW()
      `
      const existingAlias = before[0]
      if (!existingAlias) aliasesAdded++
      else if (existingAlias.origin !== 'user' && (existingAlias.model_key !== target.modelKey || existingAlias.enabled !== true)) aliasesUpdated++
    }

    // Curated aliases for model names no pricing source lists verbatim; they
    // are also applied on startup (runMigrations).
    const curated = await ensureCuratedPricingAliases(tx)
    aliasesAdded += curated.added
    aliasesUpdated += curated.updated
  })

  await logAdminAction(adminUserId, 'sync_pricing', 'model_prices', 'active', `Synced from LiteLLM: ${added} added, ${updated} updated, ${skipped} skipped, ${aliasesAdded} aliases added, ${aliasesUpdated} aliases updated`)
  return { added, updated, skipped, userPreserved, aliasesAdded, aliasesUpdated }
}

export async function getPriceEntries(adminUserId: string) {
  const entries = await sql`
    SELECT p.model_key AS id, p.model_key, p.input, p.output, p.cache_read, p.cache_write, p.currency,
           p.source, p.source_model_id, p.origin, p.last_synced_at, COALESCE(u.usage_count, 0)::INTEGER AS usage_count
    FROM model_prices p
    LEFT JOIN (
      SELECT model, COUNT(*)::INTEGER AS usage_count
      FROM cloud_usage_records
      GROUP BY model
    ) u ON u.model = p.model_key
    ORDER BY COALESCE(u.usage_count, 0) DESC, p.model_key ASC
  `
  return { entries }
}

export async function updatePriceEntries(
  adminUserId: string,
  updates: Array<{ id: string; input: number; output: number; cache_read: number | null; cache_write: number | null }>
): Promise<void> {
  await sql.begin(async (tx) => {
    for (const u of updates) {
      await tx`
        UPDATE model_prices
        SET input = ${u.input}, output = ${u.output}, cache_read = ${u.cache_read}, cache_write = ${u.cache_write}, origin = 'user', source = 'manual', updated_at = NOW()
        WHERE model_key = ${u.id}
      `
    }
  })
  await logAdminAction(adminUserId, 'update_price_entries', 'model_prices', 'current', `Updated ${updates.length} entries`)
}

export async function addPriceEntry(
  adminUserId: string,
  entry: { model_key: string; input: number; output: number; cache_read: number | null; cache_write: number | null; currency: string }
): Promise<string> {
  const id = entry.model_key
  await sql`
    INSERT INTO model_prices (model_key, provider, input, output, cache_read, cache_write, currency, source, source_model_id, origin, status)
    VALUES (${entry.model_key}, '', ${entry.input}, ${entry.output}, ${entry.cache_read}, ${entry.cache_write}, ${entry.currency}, 'manual', ${entry.model_key}, 'user', 'active')
    ON CONFLICT (model_key) DO UPDATE SET
      input = EXCLUDED.input, output = EXCLUDED.output, cache_read = EXCLUDED.cache_read, cache_write = EXCLUDED.cache_write,
      currency = EXCLUDED.currency, source = 'manual', source_model_id = EXCLUDED.source_model_id, origin = 'user', status = 'active', updated_at = NOW()
  `
  await sql`
    INSERT INTO model_price_aliases (alias, model_key, match_type, provider, priority, source, origin, enabled)
    VALUES (${entry.model_key}, ${entry.model_key}, 'exact', '', 200, 'manual', 'user', TRUE)
    ON CONFLICT (alias) DO UPDATE SET model_key = EXCLUDED.model_key, priority = 200, source = 'manual', origin = 'user', enabled = TRUE, updated_at = NOW()
  `
  await logAdminAction(adminUserId, 'add_price_entry', 'model_prices', id, `Added model ${entry.model_key}`)
  return id
}

export async function deletePriceEntry(adminUserId: string, entryId: string, modelKey: string): Promise<void> {
  await sql`DELETE FROM model_price_aliases WHERE model_key = ${modelKey}`
  await sql`DELETE FROM model_prices WHERE model_key = ${entryId}`
  await logAdminAction(adminUserId, 'delete_price_entry', 'model_prices', entryId, `Deleted model ${modelKey}`)
}

export async function getPublicPriceEntries() {
  const entries = await sql`
    SELECT model_key, input, output, cache_read, cache_write, currency, source, source_model_id, origin, last_synced_at
    FROM model_prices
    WHERE status = 'active'
    ORDER BY model_key ASC
  `
  if (entries.length > 0) return { entries }
  return { entries: [] }
}
