function buildUrl(base, params) {
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value) searchParams.set(key, value)
  }
  const query = searchParams.toString()
  return query ? `${base}?${query}` : base
}

export async function githubConnection(action, body = {}) {
  const response = await fetch(`/api/github/${action}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error?.message || 'GitHub connection failed')
  return result
}

// Responses are not cached: every call that is not joining a request already
// in flight asks the local server again, so a reload after a refresh or a
// poll shows the current data (issue #108).
const inflightRequests = new Map()

async function apiFetch(url, { signal, method } = {}) {
  const request = () => method
    ? fetch(url, signal ? { method, signal } : { method })
    : signal ? fetch(url, { signal }) : fetch(url)

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
    .finally(() => inflightRequests.delete(url))

  inflightRequests.set(url, promise)
  return promise
}

export async function fetchSummary(params, { signal } = {}) {
  return apiFetch(buildUrl('/api/summary', params), { signal })
}

// Public aggregate totals for the home page; stays reachable without the
// dashboard password and only accepts `range`.
export async function fetchHomeSummary(params, { signal } = {}) {
  return apiFetch(buildUrl('/api/home-summary', { range: params?.range }), { signal })
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
  return apiFetch('/api/refresh', { method: 'POST' })
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

export async function bindPricingAlias(alias, modelKey) {
  const response = await fetch('/api/pricing/alias', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ alias, modelKey }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'API error' } }))
    throw new Error(error.error?.message || `HTTP ${response.status}`)
  }
  return response.json()
}

export async function unbindPricingAlias(alias) {
  const response = await fetch(`/api/pricing/alias?alias=${encodeURIComponent(alias)}`, { method: 'DELETE' })
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

export async function fetchPricingRecalcStatus() {
  const response = await fetch('/api/pricing/recalc', { cache: 'no-store' })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'API error' } }))
    throw new Error(error.error?.message || `HTTP ${response.status}`)
  }
  return response.json()
}

export async function syncPricing() {
  const response = await fetch('/api/pricing/sync', { method: 'POST' })
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

export async function fetchCloudSyncStatus(siteUrl) {
  try {
    const response = await fetch('/api/cli/sync/status')
    if (!response.ok) return { enabled: false }
    return response.json()
  } catch {
    try {
      const response = await fetch(`${siteUrl}/api/cli/sync/status`)
      if (!response.ok) return { enabled: false }
      return response.json()
    } catch {
      return { enabled: false }
    }
  }
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

export async function importKelivoBackup(file) {
  const form = new FormData()
  form.append('file', file)
  const response = await fetch('/api/import/kelivo', { method: 'POST', body: form })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(data?.error?.message || `HTTP ${response.status}`)
  }
  return data
}

export async function fetchQuotas() {
  return apiFetch('/api/quotas')
}

export async function fetchAuthStatus() {
  return apiFetch('/api/auth/status')
}

export async function login(password) {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'API error' } }))
    throw new Error(error.error?.message || `HTTP ${response.status}`)
  }
  return response.json()
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

export async function fetchCredentialStatus({ backend, repo, bucket }) {
  return apiFetch(buildUrl('/api/config/credentials/status', { backend, repo, bucket }))
}

export const SETTINGS_UPDATED_EVENT = 'aiusage:settings-updated'

export function notifySettingsUpdated(patch) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(SETTINGS_UPDATED_EVENT, { detail: patch }))
}
