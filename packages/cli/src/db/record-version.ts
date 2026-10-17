/**
 * The `updated_at` an `UPDATE records` statement gives a row it changes in
 * place. Its one `?` is the current time.
 *
 * A record counts as unsynced only while its `updated_at` is above what was
 * acknowledged for it: `records.synced_at`, and `sync_record_state.synced_at`
 * for each target (a cloud target acknowledges the `updated_at` it was sent, a
 * file backend the time of its upload). The new version is therefore above
 * the row's old one and above every acknowledgement, even when the clock has
 * been set back since they were written. Otherwise a corrected row could stay
 * acknowledged and never be uploaded again.
 */
export const NEXT_UPDATED_AT = `MAX(
  ?,
  records.updated_at + 1,
  COALESCE(records.synced_at, 0) + 1,
  COALESCE((SELECT MAX(s.synced_at) FROM sync_record_state s WHERE s.record_id = records.id), 0) + 1
)`
