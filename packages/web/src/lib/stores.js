import { writable, get } from 'svelte/store'

function persisted(key, defaultValue) {
  if (typeof window === 'undefined') return writable(defaultValue)
  let initial = defaultValue
  try {
    const stored = localStorage.getItem(key)
    if (stored !== null) initial = JSON.parse(stored)
  } catch {}
  const store = writable(initial)
  store.subscribe(value => {
    try {
      // JSON.stringify already strips undefined properties natively
      localStorage.setItem(key, JSON.stringify(value))
    } catch {}
  })
  return store
}

export const dateRange = persisted('aiusage-dateRange', { range: 'day' })

export const selectedDevice = persisted('aiusage-selectedDevice', '') // '' = all devices, value = deviceInstanceId

export function setDevice(deviceInstanceId) {
  selectedDevice.set(deviceInstanceId)
}

export const selectedTool = persisted('aiusage-selectedTool', '') // '' = all tools, value = tool name

export function setTool(tool) {
  selectedTool.set(tool)
}

export const pollingInterval = writable(30000) // 30 seconds default

export const displayCurrency = writable('USD')
export const exchangeRate = writable(0.137) // must match FALLBACK_RATE in core/src/exchange-rate.ts

export function setRange(range) {
  dateRange.set({ range, month: undefined })
}

export function setCustomRange(from, to, month) {
  dateRange.set({ from, to, month: month || undefined })
}

export function formatDate(ts) {
  return new Date(ts).toLocaleDateString()
}

export function formatNumber(n) {
  return n.toLocaleString()
}

export function formatCost(n) {
  const curr = get(displayCurrency)
  if (curr === 'CNY') {
    const rate = get(exchangeRate)
    const cny = n / rate
    return cny < 0.01 ? `¥${cny.toFixed(4)}` : `¥${cny.toFixed(2)}`
  }
  return n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`
}

export function formatTokens(n) {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}
