import type Database from 'better-sqlite3'
import { calculateCost, resolveExchangeRate, resolvePrice } from '@aiusage/core'
import type { Config } from '../config.js'
import { NEXT_UPDATED_AT } from './record-version.js'

/**
 * Reprice the records a migration queued in `pending_cost_recalc`.
 *
 * A migration that changes a record's token counts cannot recompute its cost
 * itself: it runs before the curated prices are seeded and before the runtime
 * price table is loaded. It queues the record instead, and this runs once
 * pricing is ready, using the same runtime price table (registry, aliases and
 * legacy `config.priceOverrides`) the parsers price new records with.
 *
 * A record whose model no longer resolves to a price becomes
 * `cost = 0, cost_source = 'unknown'`, as *Recalculate pricing* would leave
 * it, rather than keeping a cost computed from the old token counts. Logged
 * costs are left alone. `updated_at` is moved above the row's old version and
 * every acknowledgement (`NEXT_UPDATED_AT`), so the new cost is published.
 * The queue is drained in the same transaction, so an interrupted run is
 * simply repeated on the next database open. Returns the number of records
 * repriced.
 */
export function recalcPendingCosts(db: Database.Database, config?: Config | null): number {
  // Cheap check so an ordinary open does not take the write lock.
  if (!db.prepare('SELECT 1 FROM pending_cost_recalc LIMIT 1').get()) return 0

  const exchangeRate = resolveExchangeRate(config ?? {})
  const select = db.prepare(`
    SELECT r.id, r.model, r.input_tokens, r.output_tokens, r.cache_read_tokens,
           r.cache_write_tokens, r.thinking_tokens, r.cost_source
    FROM pending_cost_recalc p
    JOIN records r ON r.id = p.record_id
  `)
  const update = db.prepare(`UPDATE records SET cost = ?, cost_source = ?, updated_at = ${NEXT_UPDATED_AT} WHERE id = ?`)

  // The queue is read under the write lock: another process sharing the
  // database may drain it and re-parse a record in the meantime, and its cost
  // must not then be overwritten from token counts read before that.
  return db.transaction(() => {
    const rows = select.all() as Array<{
      id: string
      model: string
      input_tokens: number
      output_tokens: number
      cache_read_tokens: number
      cache_write_tokens: number
      thinking_tokens: number
      cost_source: string
    }>
    let repriced = 0
    const now = Date.now()
    for (const row of rows) {
      if (row.cost_source === 'log') continue
      const priced = resolvePrice(row.model) != null
      const cost = priced ? calculateCost(row.model, {
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
        cacheReadTokens: row.cache_read_tokens,
        cacheWriteTokens: row.cache_write_tokens,
        thinkingTokens: row.thinking_tokens,
      }, exchangeRate) : 0
      update.run(cost, priced ? 'pricing' : 'unknown', now, row.id)
      repriced++
    }
    db.prepare('DELETE FROM pending_cost_recalc').run()
    return repriced
  }).immediate()
}
