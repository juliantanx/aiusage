import type Database from 'better-sqlite3'
import { NEXT_UPDATED_AT } from '../record-version.js'

/**
 * Codex output tokens exclude reasoning tokens.
 *
 * Codex logs `output_tokens` inclusive of `reasoning_output_tokens`
 * (`total_tokens` is `input_tokens + output_tokens`), and the parser used to
 * store the first as output and the second as thinking tokens. Every total
 * sums both columns and pricing charges thinking tokens at the output price
 * on top of output tokens, so Codex reasoning tokens were counted and billed
 * twice.
 *
 * The parser now stores output without the reasoning part. This migration
 * applies the same correction to the Codex rows this device parsed before the
 * fix, the way v15 did for cached input tokens:
 *
 *   - `output_tokens` becomes `max(0, output_tokens - thinking_tokens)`;
 *   - `thinking_tokens` is kept, so reasoning is still counted once and billed
 *     once at the output price;
 *   - `updated_at` is moved above the row's old version and every
 *     acknowledgement (`NEXT_UPDATED_AT`), so the corrected row is published
 *     again even if the clock was set back;
 *   - rows whose cost came from pricing are queued in `pending_cost_recalc`
 *     (created by v15) and repriced by `recalcPendingCosts` once pricing is
 *     ready. A logged cost is never queued.
 *
 * Only `origin = 'local'` rows are touched, as in v15: rows pulled from other
 * devices are corrected and re-published by their owners. CodeFuse rows from
 * its embedded Codex engine are not touched here either; they are re-imported
 * from their logs through the CodeFuse parser version in `watermark.ts`.
 *
 * The subtraction is not repeatable, so it relies on running exactly once
 * (the schema version) and on every row it sees having been written by the
 * old parser: the parser that subtracts ships together with this migration,
 * and migrations run before anything is parsed.
 */
export function migrateV16(db: Database.Database): void {
  const affected = `tool = 'codex' AND origin = 'local' AND thinking_tokens > 0`

  db.prepare(`
    INSERT OR IGNORE INTO pending_cost_recalc (record_id)
    SELECT id FROM records WHERE ${affected} AND cost_source = 'pricing'
  `).run()

  db.prepare(`
    UPDATE records
    SET output_tokens = MAX(0, output_tokens - thinking_tokens), updated_at = ${NEXT_UPDATED_AT}
    WHERE ${affected}
  `).run(Date.now())

  db.prepare('INSERT INTO schema_version (version) VALUES (16)').run()
}
