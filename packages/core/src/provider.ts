export const MODEL_PROVIDER_MAP: [string, string][] = [
  ['claude-',    'anthropic'],
  ['gpt-',      'openai'],
  ['o1-',       'openai'],
  ['o3-',       'openai'],
  ['o4-',       'openai'],
  ['o-',        'openai'],
  ['deepseek-', 'deepseek'],
  ['gemini-',   'google'],
  ['glm-',      'zhipu'],
  ['mimo-',     'xiaomi'],
  ['minimax-',  'minimax'],
  ['kimi-',     'moonshot'],
  ['qianfan-',  'baidu'],
  ['qwen',      'alibaba'],
  ['z-ai/',     'zhipu'],
  ['accounts/fireworks/', 'fireworks'],
  ['frank/',    'zhipu'],
  ['nvidia/',   'nvidia'],
  ['moonshotai/', 'moonshot'],
  ['zai-org/',  'zhipu'],
]

export function inferProvider(model: string): string {
  for (const [prefix, provider] of MODEL_PROVIDER_MAP) {
    if (model.startsWith(prefix)) return provider
  }
  return 'unknown'
}
