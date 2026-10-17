import type Database from 'better-sqlite3'
import { calculateCostForPrice, inferProvider, normalizeQoderModel, resolveExchangeRate } from '@aiusage/core'
import { loadConfig } from '../config.js'
import { applyPricingToSyncedRecords, type SyncedRecordPricing } from '../db/synced-records.js'
import { hasUserPrice, resolvePriceFromRegistry } from '../pricing-registry.js'

export interface RecalcResult {
  updatedCount: number
  skippedCount: number
  /** Pulled rows whose `synced_records` mirror took the recalculated price. */
  syncedUpdatedCount: number
}

export interface RecalcOptions {
  /**
   * This installation's device id (see `state.json`), when known. Every
   * reading that spans devices reads the current device's rows from `records`
   * and every other device's from `synced_records`, so that a copy of a local
   * row echoed through another namespace is never counted twice. The
   * recalculation writes the price it recomputed into that mirror, which
   * requires knowing which mirrors those readings exclude (see
   * `applyPricingToSyncedRecords`); without the id no mirror is excluded, as
   * every reading then reads `records` alone. Every row is repriced either
   * way.
   */
  currentDeviceInstanceId?: string
}

const BATCH_SIZE = 1000

export function recalcPricing(db: Database.Database, options: RecalcOptions = {}): RecalcResult {
  let updatedCount = 0
  let skippedCount = 0
  let syncedUpdatedCount = 0
  let lastId = ''
  const exchangeRate = resolveExchangeRate(loadConfig() ?? {})
  const currentDeviceInstanceId = options.currentDeviceInstanceId

  // A pulled row's updated_at is the version of the remote record it mirrors:
  // bumping it would make every later correction from its owner look stale to
  // mergeSyncedRecordsIntoRecords. Only locally parsed rows are marked changed.
  const updateStmt = db.prepare(`
    UPDATE records
    SET model = ?, provider = ?, cost = ?, cost_source = ?,
        updated_at = CASE WHEN origin = 'local' THEN ? ELSE updated_at END
    WHERE id = ?
  `)

  // The recalculated price is offered to the synced_records mirror of every row
  // repriced here (see applyPricingToSyncedRecords): the summaries read other
  // devices' usage from that table, so without it a recalculation left the
  // dashboard on the price the owner had published. A batch and its mirror
  // writes go in one transaction, so the two tables cannot be left disagreeing.
  const mirrorOptions = currentDeviceInstanceId ? { excludeDeviceInstanceId: currentDeviceInstanceId } : {}
  const applyBatch = db.transaction((batch: any[]) => {
    const repriced: SyncedRecordPricing[] = []

    for (const record of batch) {
      const model = record.tool === 'qoder' ? normalizeQoderModel(record.model) : record.model

      // Logged costs are treated as authoritative and left untouched — EXCEPT when the
      // logged cost is non-positive (custom gateways report 0 for models they don't
      // price) or when the user has explicitly set a manual price for this model. In
      // both cases the logged value must not block pricing/recalc (issue #13).
      if (record.cost_source === 'log' && record.cost > 0 && !hasUserPrice(db, model)) {
        skippedCount++
        continue
      }

      const provider = model !== record.model ? inferProvider(model) : record.provider
      const price = resolvePriceFromRegistry(db, model)
      const newCost = price ? calculateCostForPrice(price, {
        inputTokens: record.input_tokens,
        outputTokens: record.output_tokens,
        cacheReadTokens: record.cache_read_tokens,
        cacheWriteTokens: record.cache_write_tokens,
        thinkingTokens: record.thinking_tokens,
      }, exchangeRate) : 0
      const costSource = price ? 'pricing' : 'unknown'

      // Offered to the mirror even when the copy already carries the price: a
      // mirror pulled after an earlier run never took it, and nothing else
      // would write it there.
      repriced.push({ id: record.id, model, provider, cost: newCost, costSource })

      if (model !== record.model || provider !== record.provider || newCost !== record.cost || costSource !== record.cost_source) {
        updateStmt.run(model, provider, newCost, costSource, Date.now(), record.id)
        updatedCount++
      }
    }

    syncedUpdatedCount += applyPricingToSyncedRecords(db, repriced, mirrorOptions).length
  })

  while (true) {
    const records = db.prepare(
      'SELECT id, tool, model, provider, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, cost, cost_source FROM records WHERE id > @lastId ORDER BY id LIMIT @limit'
    ).all({ lastId, limit: BATCH_SIZE }) as any[]

    if (records.length === 0) break

    applyBatch(records)

    lastId = records[records.length - 1].id
  }

  return { updatedCount, skippedCount, syncedUpdatedCount }
}
