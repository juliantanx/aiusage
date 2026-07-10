/**
 * Normalize a CodeFuse model identifier.
 *
 * Accepts a raw string or a model object ({ id | display_name | displayName }),
 * strips ANSI escape sequences and trailing `[<n>m]` markers, drops any routed
 * provider prefix (everything before the last `/`, e.g. `glink/claude-opus-4-6`),
 * and lowercases the result. Returns `'unknown'` when no usable name is present.
 */
export function normalizeCodeFuseModel(value: unknown): string {
  let raw: unknown = value
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>
    raw = obj.id || obj.display_name || obj.displayName
  }
  if (typeof raw !== 'string') return 'unknown'
  let model = raw.trim()
  if (!model) return 'unknown'
  model = model
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\[\d+m\]$/g, '')
    .trim()
  const slash = model.lastIndexOf('/')
  if (slash >= 0) model = model.slice(slash + 1)
  return model ? model.toLowerCase() : 'unknown'
}
