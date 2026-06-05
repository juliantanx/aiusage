function buildUrl(base, params) {
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value) searchParams.set(key, value)
  }
  const query = searchParams.toString()
  return query ? `${base}?${query}` : base
}

// Stale-while-revalidate cache (§11.4)
const swrCache = new Map()
const inflightRequests = new Map()

async function apiFetch(url, { signal, swr = false } = {}) {
  const request = () => signal ? fetch(url, { signal }) : fetch(url)

  // Stale-while-revalidate: return cached data immediately, refresh in background
  if (swr && swrCache.has(url)) {
    const cached = swrCache.get(url)
    // Revalidate in background if stale (> 5s)
    if (Date.now() - cached.fetchedAt > 5000 && !inflightRequests.has(url)) {
      const promise = request()
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data) swrCache.set(url, { data, fetchedAt: Date.now() }) })
        .catch(() => {})
        .finally(() => inflightRequests.delete(url))
      inflightRequests.set(url, promise)
    }
    return cached.data
  }

  // Deduplicate in-flight requests
  if (inflightRequests.has(url)) {
    return inflightRequests.get(url)
  }

  const promise = request()
    .then(async (response) => {
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: { message: 'API error' } }))
        throw new Error(error.error?.message || `HTTP ${response.status}`)
      }
      return response.json()
    })
    .then(data => {
      if (swr) swrCache.set(url, { data, fetchedAt: Date.now() })
      return data
    })
    .finally(() => inflightRequests.delete(url))

  inflightRequests.set(url, promise)
  return promise
}

export async function fetchSummary(params, { signal, swr = true } = {}) {
  return apiFetch(buildUrl('/api/summary', params), { signal, swr })
}

export async function fetchBootstrap(params = {}) {
  return apiFetch(buildUrl('/api/bootstrap', params))
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
  return apiFetch(buildUrl('/api/tool-calls', {
    ...params,
    toolType: params.toolType || undefined,
  }))
}

export async function fetchSessions(params) {
  return apiFetch(buildUrl('/api/sessions', {
    ...params,
    page: params.page?.toString(),
    pageSize: params.pageSize?.toString(),
  }))
}

export async function fetchSessionDetail(sessionId, params = {}) {
  return apiFetch(buildUrl(`/api/sessions/${encodeURIComponent(sessionId)}`, params))
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

export async function triggerSync() {
  const response = await fetch('/api/sync', { method: 'POST' })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'API error' } }))
    throw new Error(error.error?.message || `HTTP ${response.status}`)
  }
  return response.json()
}

export async function fetchSyncStatus() {
  return apiFetch('/api/sync')
}

export async function fetchConfig() {
  return apiFetch('/api/config')
}

export async function saveConfig(data) {
  const response = await fetch('/api/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'API error' } }))
    throw new Error(error.error?.message || `HTTP ${response.status}`)
  }
  return response.json()
}

export async function fetchTools(params) {
  return apiFetch(buildUrl('/api/tools', params))
}

export async function fetchDetectedTools() {
  return apiFetch('/api/detected-tools')
}

export async function fetchQuotas() {
  return apiFetch('/api/quotas')
}

export async function fetchLeaderboard(baseUrl, params = {}) {
  const data = await apiFetch(buildUrl('/api/leaderboard', {
    period_type: params.period_type,
    period_start: params.period_start,
    cursor: params.cursor,
  }))
  if (!data || !Array.isArray(data.entries)) {
    throw new Error('Invalid leaderboard response')
  }
  return data
}

export async function fetchLeaderboardAuthStatus() {
  return apiFetch('/api/leaderboard/auth/status')
}

export async function startLeaderboardAuth() {
  const response = await fetch('/api/leaderboard/auth/start', { method: 'POST' })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'API error' } }))
    throw new Error(error.error?.message || `HTTP ${response.status}`)
  }
  return response.json()
}

export async function completeLeaderboardAuth(deviceRequestId) {
  const response = await fetch('/api/leaderboard/auth/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_request_id: deviceRequestId }),
  })
  const data = await response.json().catch(() => null)
  if (response.status === 202 || data?.pending) return data || { pending: true }
  if (!response.ok) {
    throw new Error(data?.error?.message || `HTTP ${response.status}`)
  }
  return data
}

export async function logoutLeaderboardAuth() {
  const response = await fetch('/api/leaderboard/auth/logout', { method: 'POST' })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'API error' } }))
    throw new Error(error.error?.message || `HTTP ${response.status}`)
  }
  return response.json()
}

export async function uploadLeaderboardData() {
  const response = await fetch('/api/leaderboard/upload', { method: 'POST' })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'API error' } }))
    throw new Error(error.error?.message || `HTTP ${response.status}`)
  }
  return response.json()
}

export async function refreshExchangeRate() {
  const response = await fetch('/api/exchange-rate/refresh', { method: 'POST' })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'API error' } }))
    throw new Error(error.error?.message || `HTTP ${response.status}`)
  }
  return response.json()
}

export async function fetchCredential(ref) {
  return apiFetch(buildUrl('/api/config/credential', { ref }))
}

export const SETTINGS_UPDATED_EVENT = 'aiusage:settings-updated'

export function notifySettingsUpdated(patch) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(SETTINGS_UPDATED_EVENT, { detail: patch }))
}
