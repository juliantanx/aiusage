function buildUrl(base, params) {
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value) searchParams.set(key, value)
  }
  const query = searchParams.toString()
  return query ? `${base}?${query}` : base
}

async function apiFetch(url) {
  const response = await fetch(url)
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'API error' } }))
    throw new Error(error.error?.message || `HTTP ${response.status}`)
  }
  return response.json()
}

export async function fetchSummary(params) {
  return apiFetch(buildUrl('/api/summary', params))
}

export async function fetchTokens(params) {
  return apiFetch(buildUrl('/api/tokens', params))
}

export async function fetchCost(params) {
  return apiFetch(buildUrl('/api/cost', params))
}

export async function fetchModels(params) {
  return apiFetch(buildUrl('/api/models', params))
}

export async function fetchToolCalls(params) {
  return apiFetch(buildUrl('/api/tool-calls', params))
}

export async function fetchSessions(params) {
  return apiFetch(buildUrl('/api/sessions', {
    ...params,
    page: params.page?.toString(),
    pageSize: params.pageSize?.toString(),
  }))
}
