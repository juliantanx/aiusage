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

export async function fetchProjects(params) {
  return apiFetch(buildUrl('/api/projects', params))
}

export async function refreshData() {
  return apiFetch('/api/refresh')
}

export async function fetchPricing() {
  return apiFetch('/api/pricing')
}

export async function updatePricing(model, entry) {
  const response = await fetch('/api/pricing', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, ...entry }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'API error' } }))
    throw new Error(error.error?.message || `HTTP ${response.status}`)
  }
  return response.json()
}

export async function deletePricing(model) {
  const response = await fetch(`/api/pricing?model=${encodeURIComponent(model)}`, { method: 'DELETE' })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'API error' } }))
    throw new Error(error.error?.message || `HTTP ${response.status}`)
  }
  return response.json()
}

export async function recalcPricing() {
  const response = await fetch('/api/pricing/recalc', { method: 'POST' })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'API error' } }))
    throw new Error(error.error?.message || `HTTP ${response.status}`)
  }
  return response.json()
}
