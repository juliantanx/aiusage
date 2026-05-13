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

export interface ModelData {
  models: Array<{
    model: string
    provider: string
    callCount: number
    totalTokens: number
    percentage: number
  }>
}

export interface ToolCallData {
  toolCalls: Array<{
    name: string
    count: number
    percentage: number
  }>
}

export interface SessionData {
  sessions: Array<{
    sessionId: string
    tool: string
    model: string
    ts: number
    inputTokens: number
    outputTokens: number
    cost: number
  }>
  total: number
  page: number
  pageSize: number
}

export interface DateRange {
  range?: 'day' | 'week' | 'month'
  from?: string
  to?: string
}

function buildUrl(base: string, params: Record<string, string | undefined>): string {
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value) searchParams.set(key, value)
  }
  const query = searchParams.toString()
  return query ? `${base}?${query}` : base
}

async function apiFetch<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'API error' } }))
    throw new Error(error.error?.message || `HTTP ${response.status}`)
  }
  return response.json()
}

export async function fetchSummary(params: SummaryParams): Promise<SummaryData> {
  return apiFetch(buildUrl('/api/summary', params))
}

export async function fetchTokens(params: TokenParams): Promise<TokenData> {
  return apiFetch(buildUrl('/api/tokens', params))
}

export async function fetchCost(params: SummaryParams): Promise<CostData> {
  return apiFetch(buildUrl('/api/cost', params))
}

export async function fetchModels(params: SummaryParams): Promise<ModelData> {
  return apiFetch(buildUrl('/api/models', params))
}

export async function fetchToolCalls(params: SummaryParams): Promise<ToolCallData> {
  return apiFetch(buildUrl('/api/tool-calls', params))
}

export async function fetchSessions(params: SummaryParams & { tool?: string; page?: number; pageSize?: number }): Promise<SessionData> {
  return apiFetch(buildUrl('/api/sessions', {
    ...params,
    page: params.page?.toString(),
    pageSize: params.pageSize?.toString(),
  }))
}
