import { sql } from '../db/pool.js'
import { nanoid } from 'nanoid'
import { invalidateLeaderboardCache } from '../leaderboard/query.js'

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

export async function approveSnapshot(adminUserId: string, snapshotId: string, note?: string): Promise<void> {
  const snapshots = await sql`
    SELECT id, upload_request_id, user_id, period_type, period_start
    FROM upload_snapshots WHERE id = ${snapshotId}
  `
  const snap = snapshots[0] as { id: string; upload_request_id: string; user_id: string; period_type: string; period_start: string } | undefined
  if (!snap) throw new Error('Snapshot not found')

  await sql`UPDATE upload_snapshots SET review_status = 'approved', reviewed_by = ${adminUserId}, reviewed_at = NOW(), review_note = ${note || null} WHERE id = ${snapshotId}`

  // Restore leaderboard visibility for approved snapshot
  await sql`
    UPDATE leaderboard_metrics
    SET visibility = 'public', updated_at = NOW()
    WHERE upload_request_id = ${snap.upload_request_id}
      AND user_id = ${snap.user_id}
      AND period_type = ${snap.period_type}::period_type
      AND period_start = ${snap.period_start}
  `

  await logAdminAction(adminUserId, 'approve_snapshot', 'upload_snapshots', snapshotId, note || 'Snapshot approved')
  invalidateLeaderboardCache()
}

export async function rejectSnapshot(adminUserId: string, snapshotId: string, note?: string): Promise<void> {
  await sql`UPDATE upload_snapshots SET review_status = 'rejected', reviewed_by = ${adminUserId}, reviewed_at = NOW(), review_note = ${note || null} WHERE id = ${snapshotId}`
  // Cascade: hide all derived leaderboard_metrics for this snapshot
  const snapshots = await sql`SELECT upload_request_id, user_id, period_type, period_start FROM upload_snapshots WHERE id = ${snapshotId}`
  const snap = snapshots[0] as { upload_request_id: string; user_id: string; period_type: string; period_start: string } | undefined
  if (snap) {
    await sql`
      UPDATE leaderboard_metrics
      SET visibility = 'hidden', updated_at = NOW()
      WHERE upload_request_id = ${snap.upload_request_id}
        AND user_id = ${snap.user_id}
        AND period_type = ${snap.period_type}::period_type
        AND period_start = ${snap.period_start}
    `
  }
  await logAdminAction(adminUserId, 'reject_snapshot', 'upload_snapshots', snapshotId, note || 'Snapshot rejected')
  invalidateLeaderboardCache()
}

export async function hideSnapshot(adminUserId: string, snapshotId: string, note?: string): Promise<void> {
  await sql`UPDATE upload_snapshots SET review_status = 'hidden', reviewed_by = ${adminUserId}, reviewed_at = NOW(), review_note = ${note || null} WHERE id = ${snapshotId}`
  const snapshots = await sql`SELECT upload_request_id, user_id, period_type, period_start FROM upload_snapshots WHERE id = ${snapshotId}`
  const snap = snapshots[0] as { upload_request_id: string; user_id: string; period_type: string; period_start: string } | undefined
  if (snap) {
    await sql`
      UPDATE leaderboard_metrics
      SET visibility = 'hidden', updated_at = NOW()
      WHERE upload_request_id = ${snap.upload_request_id}
        AND user_id = ${snap.user_id}
        AND period_type = ${snap.period_type}::period_type
        AND period_start = ${snap.period_start}
    `
  }
  await logAdminAction(adminUserId, 'hide_snapshot', 'upload_snapshots', snapshotId, note || 'Snapshot hidden')
  invalidateLeaderboardCache()
}

export async function hideLeaderboardEntry(adminUserId: string, entryId: string): Promise<void> {
  await sql`UPDATE leaderboard_metrics SET visibility = 'hidden', updated_at = NOW() WHERE id = ${entryId}`
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

  await sql`UPDATE leaderboard_metrics SET visibility = 'public', updated_at = NOW() WHERE id = ${entryId}`
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

async function logAdminAction(adminUserId: string, action: string, targetType: string, targetId: string, reason: string): Promise<void> {
  await sql`
    INSERT INTO admin_audit_logs (id, admin_user_id, action, target_type, target_id, reason)
    VALUES (${nanoid()}, ${adminUserId}, ${action}, ${targetType}, ${targetId}, ${reason})
  `
}

// --- Pricing Management ---

const LITELLM_PRICING_URL = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json'

interface LitellmEntry {
  input_cost_per_token?: number
  output_cost_per_token?: number
  cache_read_input_token_cost?: number
  cache_creation_input_token_cost?: number
  input_cost_per_second?: number
  output_cost_per_second?: number
  litellm_provider?: string
  mode?: string
}

function normalizeModelKey(sourceModelId: string): string {
  const slash = sourceModelId.indexOf('/')
  return slash > 0 ? sourceModelId.slice(slash + 1) : sourceModelId
}

function aliasesFor(sourceModelId: string, modelKey: string): string[] {
  const aliases = new Set([sourceModelId, modelKey])
  if (modelKey.startsWith('claude-')) aliases.add(modelKey.replace(/-\d{8}$/, ''))
  return [...aliases].filter(Boolean)
}

function parseLitellmEntry(sourceModelId: string, entry: LitellmEntry) {
  if (entry.mode && entry.mode !== 'chat' && entry.mode !== 'completion' && entry.mode !== 'responses') return null
  if (entry.input_cost_per_second != null || entry.output_cost_per_second != null) return null
  if (typeof entry.input_cost_per_token !== 'number' || typeof entry.output_cost_per_token !== 'number') return null
  const modelKey = normalizeModelKey(sourceModelId)
  if (!modelKey || modelKey.includes('*')) return null
  return {
    modelKey,
    provider: (entry.litellm_provider ?? '').trim().toLowerCase(),
    input: entry.input_cost_per_token * 1_000_000,
    output: entry.output_cost_per_token * 1_000_000,
    cacheRead: typeof entry.cache_read_input_token_cost === 'number' ? entry.cache_read_input_token_cost * 1_000_000 : null,
    cacheWrite: typeof entry.cache_creation_input_token_cost === 'number' ? entry.cache_creation_input_token_cost * 1_000_000 : null,
  }
}

/** Sync builtin entries from LiteLLM. User-origin rows are preserved. */
export async function syncPricingFromLitellm(adminUserId: string): Promise<{ added: number; updated: number; skipped: number; userPreserved: number }> {
  const response = await fetch(LITELLM_PRICING_URL, { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`LiteLLM pricing fetch failed: HTTP ${response.status}`)
  const data = await response.json() as Record<string, LitellmEntry>
  let added = 0, updated = 0, skipped = 0, userPreserved = 0

  await sql.begin(async (tx) => {
    for (const [sourceModelId, rawEntry] of Object.entries(data)) {
      const entry = parseLitellmEntry(sourceModelId, rawEntry)
      if (!entry) { skipped++; continue }

      const existing = await tx`SELECT origin, input, output, cache_read, cache_write, currency FROM model_prices WHERE model_key = ${entry.modelKey}`
      const row = existing[0] as { origin: string; input: string; output: string; cache_read: string | null; cache_write: string | null; currency: string } | undefined
      if (row?.origin === 'user') { userPreserved++; continue }

      if (!row) {
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

      for (const alias of aliasesFor(sourceModelId, entry.modelKey)) {
        await tx`
          INSERT INTO model_price_aliases (alias, model_key, match_type, provider, priority, source, origin, enabled)
          VALUES (${alias}, ${entry.modelKey}, 'exact', ${entry.provider}, 100, 'litellm', 'builtin', TRUE)
          ON CONFLICT (alias) DO UPDATE SET
            model_key = CASE WHEN model_price_aliases.origin = 'builtin' THEN EXCLUDED.model_key ELSE model_price_aliases.model_key END,
            provider = CASE WHEN model_price_aliases.origin = 'builtin' THEN EXCLUDED.provider ELSE model_price_aliases.provider END,
            source = CASE WHEN model_price_aliases.origin = 'builtin' THEN EXCLUDED.source ELSE model_price_aliases.source END,
            enabled = CASE WHEN model_price_aliases.origin = 'builtin' THEN TRUE ELSE model_price_aliases.enabled END,
            updated_at = NOW()
        `
      }
    }
  })

  await logAdminAction(adminUserId, 'sync_pricing', 'model_prices', 'current', `Synced from LiteLLM: ${added} added, ${updated} updated, ${skipped} skipped`)
  return { added, updated, skipped, userPreserved }
}

export const syncPricingFromCore = syncPricingFromLitellm

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
  return { tableId: 'current', entries }
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

  const existing = await sql`SELECT id FROM official_price_tables WHERE status = 'published' LIMIT 1`
  if (existing.length === 0) return { entries: [] }
  const tableId = (existing[0] as { id: string }).id

  const legacyEntries = await sql`
    SELECT e.model_key, e.input, e.output, e.cache_read, e.cache_write, e.currency,
           'legacy' AS source, e.model_key AS source_model_id, 'builtin' AS origin, NULL AS last_synced_at
    FROM official_price_entries e
    WHERE e.table_id = ${tableId}
    ORDER BY e.model_key ASC
  `
  return { entries: legacyEntries }
}
