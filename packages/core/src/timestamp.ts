/**
 * Parse a timestamp value into epoch milliseconds.
 *
 * Handles:
 * - numbers: treated as seconds when below 1e12 (multiplied to ms), else ms
 * - numeric strings: same second/ms heuristic as numbers
 * - date strings: parsed via `Date`
 *
 * Falls back to `fallback` when the value cannot be interpreted.
 */
export function parseTimestamp(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value < 1e12 ? value * 1000 : value
  if (typeof value === 'string' && value.trim()) {
    const asNumber = Number(value)
    if (Number.isFinite(asNumber)) return asNumber < 1e12 ? asNumber * 1000 : asNumber
    const parsed = new Date(value).getTime()
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}
