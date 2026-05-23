const QODER_TIER_MODELS = new Set([
  'auto',
  'ultimate',
  'performance',
  'efficient',
  'lite',
])

export function normalizeQoderModel(model: string): string {
  const raw = model.trim()
  if (!raw || raw.toLowerCase() === 'unknown') return 'unknown'

  const lower = raw.toLowerCase()
  const tier = lower.startsWith('qoder-') ? lower.slice('qoder-'.length) : lower
  if (QODER_TIER_MODELS.has(tier)) return `qoder-${tier}`

  return raw
}
