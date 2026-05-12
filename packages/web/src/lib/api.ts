export interface SummaryParams {
  range?: 'day' | 'week' | 'month'
  from?: string
  to?: string
}

export interface TokenParams extends SummaryParams {
  tool?: string
}

export interface SummaryData {
  totalTokens: number
  totalCost: number
  activeDays: number
  byTool: Record<string, { tokens: number; cost: number }>
  topToolCalls: Array<{ name: string; count: number }>
}

export interface TokenData {
  data: Array<{
    date: string
    inputTokens: number
    outputTokens: number
    thinkingTokens: number
  }>
}

export interface CostData {
  data: Array<{
    date: string
    cost: number
  }>
  byTool: Record<string, number>
  byModel: Record<string, number>
}

function buildUrl(base: string, params: Record<string, string | undefined>): string {
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value) searchParams.set(key, value)
  }
  const query = searchParams.toString()
  return query ? `${base}?${query}` : base
}

export async function fetchSummary(params: SummaryParams): Promise<SummaryData> {
  const url = buildUrl('/api/summary', params)
  const response = await fetch(url)
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'API error')
  }
  return response.json()
}

export async function fetchTokens(params: TokenParams): Promise<TokenData> {
  const url = buildUrl('/api/tokens', params)
  const response = await fetch(url)
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'API error')
  }
  return response.json()
}

export async function fetchCost(params: SummaryParams): Promise<CostData> {
  const url = buildUrl('/api/cost', params)
  const response = await fetch(url)
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'API error')
  }
  return response.json()
}
