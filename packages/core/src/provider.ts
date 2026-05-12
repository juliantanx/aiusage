export const MODEL_PROVIDER_MAP: [string, string][] = [
  ['claude-',    'anthropic'],
  ['gpt-',      'openai'],
  ['o1-',       'openai'],
  ['o3-',       'openai'],
  ['o4-',       'openai'],
  ['deepseek-', 'deepseek'],
  ['gemini-',   'google'],
]

export function inferProvider(model: string): string {
  for (const [prefix, provider] of MODEL_PROVIDER_MAP) {
    if (model.startsWith(prefix)) return provider
  }
  return 'unknown'
}
